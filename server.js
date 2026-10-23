import express from "express";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runEasyPeasy, diagnoseEasyPeasy } from "./src/easypeasy.js";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 3000);
const AI_TIMEOUT_MS = 600_000;
const GEMINI_MODEL = "gemini-3.8-flash";

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
  const model = GEMINI_MODEL;
  if (!apiKey) {
    return res.status(503).json({ error: "Gemini API 키가 설정되지 않았습니다. .env 파일의 GEMINI_API_KEY를 입력하세요." });
  }
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  const prompt = typeof req.body?.prompt === "string" ? req.body.prompt.trim() : "";
  if (!prompt) return res.status(400).json({ error: "AI에게 요청할 내용을 입력하세요." });
  if (code.length > 50_000 || prompt.length > 10_000) return res.status(413).json({ error: "요청이 너무 깁니다." });

  const system = `You are the official coding assistant for EasyPeasy Studio. Answer in Korean. Accuracy is more important than creativity.
The actual interpreter is a small, deliberately limited language. Do not pretend it is Python or claim unsupported syntax runs.
SUPPORTED executable syntax:
- assignment: name = expression
- print(expression, ...) and input(ask("prompt")) / input("prompt")
- if condition: followed by indented lines; optional else: at the same indentation
- repeat expression: followed by indented lines
- for name in range(args): followed by indented lines (range accepts one or two numeric args in the current interpreter)
- literals: quoted strings, integer/decimal numbers, true, false, none, and list literals [a, b]
- expressions: arithmetic + - * / %, comparisons == != < > <= >=, boolean and/or, nested calls, list expressions
- supported built-ins only: length, first, last, sum, average, upsort, downsort, only_upper, only_lower, digits, letters, is_even, is_odd, random_int, random_choice
- input values are automatically converted to integer, decimal, true/false, none when matching; otherwise text
IMPORTANT limitations: no general Python import, def/function declarations, dictionaries, classes, try/except, while, elif, list comprehensions, file IO, Python modules, or arbitrary Python built-ins are currently executable unless explicitly implemented in the source code provided to you. Never output these as working EasyPeasy code. If asked to add a feature, explain that it needs implementation rather than pretending it exists.
Before responding, mentally check every line against the supported syntax above. Do not use f-strings, comments with unsupported semantics, semicolons, keyword arguments, or chained method calls. Keep code examples minimal and executable.
If the user asks a question/explanation and does not request a code change, return JSON only: {"explanation":"Korean answer","code":null}.
If the user requests to create, fix, refactor, optimize, complete, translate, or otherwise change code, return JSON only: {"explanation":"Korean explanation","code":"entire replacement EasyPeasy source"}. Never omit code for a clear code-change request. The code must be complete, not a diff, and must use only supported syntax. No markdown fences or extra text outside JSON.`;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  try {
    const payload = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [
        ...(Array.isArray(req.body?.history) ? req.body.history.slice(-12).filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text.slice(0, 8000) }] })) : []),
        { role: "user", parts: [{ text: `Current EasyPeasy code:\n---\n${code}\n---\nUser request:\n${prompt}` }] }
      ],
      generationConfig: { responseMimeType: "application/json" }
    };
    let response = await fetch(endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(AI_TIMEOUT_MS)
    });
    let data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.error?.message || `API 오류 (${response.status})`;
      return res.status(response.status === 429 ? 429 : 502).json({ error: `AI 요청 실패 (${response.status}): ${detail}` });
    }
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { return res.status(502).json({ error: "AI가 올바른 JSON 형식으로 답하지 않았습니다. 다시 요청해 주세요.", raw: text.slice(0, 2000) }); }
    const needsCode = /고쳐|수정|만들|작성|추가|변환|리팩터|완성|코드로|구현|바꿔|fix|write|create|implement|convert|refactor|debug/i.test(prompt);
    let codeDiagnostics = typeof parsed.code === "string" ? diagnoseEasyPeasy(parsed.code).filter(d => d.severity === "error") : [];
    // One repair attempt: models occasionally answer with an explanation only or omit a delimiter.
    if ((needsCode && parsed.code === null) || codeDiagnostics.length) {
      const retryText = codeDiagnostics.length
        ? `Your proposed code failed EasyPeasy structural diagnostics: ${codeDiagnostics.map(d => `line ${d.line}: ${d.message}`).join("; ")}. Return a corrected complete source file using only supported EasyPeasy syntax. Return strict JSON only with explanation and code.`
        : `The user requested a code change, so an explanation-only response is not sufficient. Return the complete replacement EasyPeasy source code in the code field. Use only the supported EasyPeasy syntax from the system instructions. Return strict JSON only.`;
      const retryPayload = { ...payload, generationConfig: { responseMimeType: "application/json" }, contents: [...payload.contents, { role: "model", parts: [{ text }] }, { role: "user", parts: [{ text: retryText }] }] };
      const retryResponse = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(retryPayload), signal: AbortSignal.timeout(AI_TIMEOUT_MS) });
      const retryData = await retryResponse.json().catch(() => ({}));
      if (retryResponse.ok) {
        const retryRaw = retryData?.candidates?.[0]?.content?.parts?.map(p => p.text || "").join("") || "";
        try { const repaired = JSON.parse(retryRaw); if (typeof repaired.explanation === "string" && (repaired.code === null || typeof repaired.code === "string")) parsed = repaired; } catch {}
      }
      codeDiagnostics = typeof parsed.code === "string" ? diagnoseEasyPeasy(parsed.code).filter(d => d.severity === "error") : [];
    }
    if (typeof parsed.explanation !== "string") return res.status(502).json({ error: "AI 응답에 설명이 없습니다." });
    if (parsed.code !== null && typeof parsed.code !== "string") return res.status(502).json({ error: "AI 응답의 코드 형식이 올바르지 않습니다." });
    if (codeDiagnostics.length) return res.status(422).json({ error: `AI 수정안의 문법 검사 실패: ${codeDiagnostics[0].message} (${codeDiagnostics[0].line}행)` });
    if (needsCode && parsed.code === null) return res.status(422).json({ error: "코드 수정 요청에 대해 완성된 코드가 생성되지 않았습니다. 요청을 조금 더 구체적으로 작성해 다시 시도하세요." });
    res.json({ explanation: parsed.explanation, code: parsed.code });
  } catch (error) {
    const message = error.name === "TimeoutError" || error.name === "AbortError" ? "AI 응답이 10분 제한 시간을 초과했습니다. 모델 제공 여부와 API 상태를 확인한 뒤 다시 시도해 주세요." : `AI 요청 실패: ${error.message || "서버 연결 오류"}`;
    res.status(502).json({ error: message });
  }
});


app.post("/api/convert", async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ error: "AI 변환을 사용하려면 서버 .env에 GEMINI_API_KEY를 설정하세요." });
  const language = typeof req.body?.language === "string" ? req.body.language.trim().slice(0, 80) : "알 수 없는 언어";
  const source = typeof req.body?.source === "string" ? req.body.source : "";
  if (!source.trim()) return res.status(400).json({ error: "변환할 코드가 비어 있습니다." });
  if (source.length > 50000) return res.status(413).json({ error: "코드가 너무 깁니다. 50,000자 이하로 나누어 변환하세요." });
  const model = GEMINI_MODEL;
  const system = `You are a source-to-source translator for EasyPeasy, an actual limited interpreter. Respond in Korean and return strict JSON only: {"explanation":"...","code":"..."}. Translate from the declared source language into executable EasyPeasy, not Python-like pseudocode. Supported EP statements: assignments, print(...), input(ask("...")), if condition: / else:, repeat n:, for name in range(n) or range(start, stop):. Supported values: strings, numbers, true, false, none, lists. Operators: + - * / %, comparisons, and/or. Built-ins: length, first, last, sum, average, upsort, downsort, only_upper, only_lower, digits, letters, is_even, is_odd, random_int, random_choice. Do not output def, imports, dictionaries, classes, while, try/catch, list comprehensions, methods, f-strings, or other unsupported constructs. If source uses unsupported capability, approximate only when semantics remain valid; otherwise clearly say so in explanation and use a comment-free minimal equivalent where possible. Keep indentation 4 spaces. Do not add features or functions that do not exist.`;
  const payload = { systemInstruction:{parts:[{text:system}]}, contents:[{role:"user",parts:[{text:`Source language: ${language}
Translate this complete source code to EasyPeasy. Preserve behavior as much as supported.
--- SOURCE START ---
${source}
--- SOURCE END ---`}] }], generationConfig:{responseMimeType:"application/json"} };
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload),signal:AbortSignal.timeout(AI_TIMEOUT_MS)});
    const data = await response.json().catch(()=>({}));
    if (!response.ok) return res.status(502).json({error:`AI 변환 실패 (${response.status}): ${data?.error?.message || "서버 응답 오류"}`});
    const text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("") || "";
    let parsed; try { parsed=JSON.parse(text); } catch { return res.status(502).json({error:"AI가 변환 결과를 올바른 형식으로 반환하지 않았습니다. 다시 시도하세요."}); }
    if (typeof parsed.code !== "string") return res.status(502).json({error:"변환된 코드가 응답에 없습니다."});
    const diagnostics = diagnoseEasyPeasy(parsed.code).filter(d=>d.severity === "error");
    if (diagnostics.length) return res.status(422).json({error:`변환 결과의 문법 검사에 실패했습니다: ${diagnostics[0].message} (${diagnostics[0].line}행)`});
    res.json({explanation:typeof parsed.explanation === "string" ? parsed.explanation : "변환이 완료되었습니다.",code:parsed.code});
  } catch (error) {
    const timeout = error.name === "TimeoutError" || error.name === "AbortError";
    res.status(502).json({error:timeout ? "AI 변환이 10분 제한 시간을 초과했습니다. 모델 제공 여부와 API 상태를 확인한 뒤 다시 시도해 주세요." : `AI 변환 실패: ${error.message || "연결 오류"}`});
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`EasyPeasy Studio 실행 중: http://localhost:${port}`);
  console.log(`Gemini model: ${GEMINI_MODEL}; AI timeout: ${AI_TIMEOUT_MS / 1000}s`);
});
// Allow long-running AI responses without Node's own server timers cutting them off.
server.requestTimeout = 11 * 60 * 1000;
server.headersTimeout = 12 * 60 * 1000;
server.keepAliveTimeout = 65 * 1000;
