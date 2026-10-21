import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEasyPeasy, diagnoseEasyPeasy } from "./src/easypeasy.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "256kb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "EasyPeasy Studio",
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    runtime: "EasyPeasy MVP interpreter"
  });
});

app.post("/api/diagnose", (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (code.length > 100_000) return res.status(413).json({ error: "코드가 너무 깁니다." });
  res.json({ diagnostics: diagnoseEasyPeasy(code) });
});

app.post("/api/run", async (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const inputs = Array.isArray(req.body?.inputs) ? req.body.inputs.slice(0, 100).map(String) : [];
  if (code.length > 100_000) return res.status(413).json({ error: "코드가 너무 깁니다." });
  try {
    const result = await runEasyPeasy(code, inputs, { timeoutMs: 1500, maxOutput: 30_000 });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || "실행 중 오류가 발생했습니다.", name: error.name || "RuntimeError", line: error.line || null, column: error.column || null, stack: error.stack?.split("\n").slice(0, 3).join("\n") });
  }
});

app.post("/api/ai", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = (process.env.GEMINI_MODEL || "gemini-2.5-flash").trim();
  if (!apiKey) {
    return res.status(503).json({ error: "Gemini API 키가 설정되지 않았습니다. .env 파일의 GEMINI_API_KEY를 입력하세요." });
  }
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "AI에게 요청할 내용을 입력하세요." });
  if (code.length > 50_000 || prompt.length > 10_000) return res.status(413).json({ error: "요청이 너무 깁니다." });

  const system = `You are the coding assistant inside EasyPeasy Studio. Respond in Korean.
Help users write and debug EasyPeasy code. EasyPeasy currently supports a deliberately small MVP syntax:
- assignments: name = expression
- print(expression, ...)
- input(ask("prompt")) and input("prompt")
- if / else blocks with colon and 4-space indentation
- repeat N: blocks
- for name in range(start, stop): blocks
- expressions with numbers, strings, true, false, none, lists, arithmetic, comparisons, and basic boolean operators
- built-ins: length, first, last, sum, average, upsort, downsort, only_upper, only_lower, digits, letters, is_even, is_odd, random_int, random_choice
Do not claim unsupported syntax works. If asked to fix code, return a JSON object only with this schema:
{"explanation":"Korean explanation","code":"complete corrected source code"}
The code field must contain the entire replacement source, not a diff. Do not include markdown fences. If the user asks a question rather than a code change, return:
{"explanation":"Korean answer","code":null}
Do not invent APIs outside the supported list unless clearly label them as suggestions for future development.`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: `Current EasyPeasy code:\n---\n${code}\n---\nUser request:\n${prompt}` }] }],
      generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
    };
    let response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000)
    });
    let data = await response.json().catch(() => ({}));
    // Recover automatically when the configured model name is unavailable.
    if (!response.ok && response.status === 404 && model !== "gemini-2.5-flash") {
      response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(apiKey), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(90_000)
      });
      data = await response.json().catch(() => ({}));
    }
    if (!response.ok) {
      const detail = data?.error?.message || `API 오류 (${response.status})`;
      return res.status(response.status === 429 ? 429 : 502).json({ error: `AI 요청 실패 (${response.status}): ${detail}` });
    }
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return res.status(502).json({ error: "Gemini가 올바른 JSON 형식으로 답하지 않았습니다. 다시 요청해 주세요.", raw: text.slice(0, 2000) }); }
    if (typeof parsed.explanation !== "string") return res.status(502).json({ error: "Gemini 응답에 설명이 없습니다." });
    if (parsed.code !== null && typeof parsed.code !== "string") return res.status(502).json({ error: "Gemini 응답의 코드 형식이 올바르지 않습니다." });
    res.json({ explanation: parsed.explanation, code: parsed.code });
  } catch (error) {
    const message = error.name === "TimeoutError" || error.name === "AbortError" ? "응답 시간이 초과되었습니다. 요청을 짧게 나누거나 모델 이름을 확인해 주세요." : `AI 요청 실패: ${error.message || "서버 연결 오류"}`;
    res.status(502).json({ error: message });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(port, "0.0.0.0", () => {
  console.log(`EasyPeasy Studio 실행 중: http://localhost:${port}`);
});
