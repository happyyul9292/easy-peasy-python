import { randomInt } from "node:crypto";

class EasyError extends Error {
  constructor(message, line = 1, column = 1) {
    super(message);
    this.name = "EasyPeasyError";
    this.line = line;
    this.column = column;
  }
}

function splitTopLevel(source, separator = ",") {
  const out = [];
  let current = "", quote = null, depth = 0, escaped = false;
  for (const ch of source) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\" && quote) { current += ch; escaped = true; continue; }
    if (quote) { current += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue; }
    if ("([{".includes(ch)) depth++;
    if (")]}".includes(ch)) depth--;
    if (ch === separator && depth === 0) { out.push(current.trim()); current = ""; }
    else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function parseString(s) {
  const q = s[0];
  const body = s.slice(1, -1);
  return body.replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\r/g, "\r").replace(/\\(["'\\])/g, "$1");
}

function evaluate(expr, env) {
  expr = expr.trim();
  if (!expr) throw new EasyError("표현식이 비어 있습니다.");
  if (/^(['"]).*\1$/s.test(expr)) return parseString(expr);
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "none") return null;
  if (expr.startsWith("[") && expr.endsWith("]")) return splitTopLevel(expr.slice(1, -1)).map(x => evaluate(x, env));
  if (expr.startsWith("f\"") && expr.endsWith("\"")) {
    return parseString(expr.slice(1)).replace(/\{([^{}]+)\}/g, (_, x) => String(evaluate(x, env)));
  }
  const wrapped = expr.match(/^([a-zA-Z_]\w*)\((.*)\)$/s);
  if (wrapped) {
    const [, name, argsText] = wrapped;
    const args = argsText.trim() ? splitTopLevel(argsText).map(x => evaluate(x, env)) : [];
    const builtins = {
      length: x => x?.length ?? Object.keys(x || {}).length,
      first: x => x?.[0] ?? null,
      last: x => x?.[x.length - 1] ?? null,
      sum: x => x.reduce((a, b) => a + Number(b), 0),
      average: x => x.length ? x.reduce((a, b) => a + Number(b), 0) / x.length : null,
      upsort: x => [...x].sort((a,b) => typeof a === "number" && typeof b === "number" ? a-b : String(a).localeCompare(String(b))),
      downsort: x => [...x].sort((a,b) => typeof a === "number" && typeof b === "number" ? b-a : String(b).localeCompare(String(a))),
      only_upper: x => [...String(x)].filter(c => c.toLocaleUpperCase() === c && c.toLocaleLowerCase() !== c).join(""),
      only_lower: x => [...String(x)].filter(c => c.toLocaleLowerCase() === c && c.toLocaleUpperCase() !== c).join(""),
      digits: x => [...String(x)].filter(c => /\d/.test(c)).join(""),
      letters: x => [...String(x)].filter(c => /\p{L}/u.test(c)).join(""),
      is_even: x => Number(x) % 2 === 0,
      is_odd: x => Math.abs(Number(x) % 2) === 1,
      random_int: (a,b) => randomInt(Math.ceil(a), Math.floor(b) + 1),
      random_choice: x => x.length ? x[randomInt(x.length)] : null
    };
    if (!(name in builtins)) throw new EasyError(`아직 지원하지 않는 함수입니다: ${name}`);
    return builtins[name](...args);
  }
  for (const op of ["or", "and", "==", "!=", ">=", "<=", ">", "<", "+", "-", "*", "/", "%"]) {
    const parts = splitOperator(expr, op.trim());
    if (parts) {
      const [left, right] = parts;
      const a = evaluate(left, env), b = evaluate(right, env);
      switch (op.trim()) {
        case "or": return Boolean(a || b);
        case "and": return Boolean(a && b);
        case "==": return a === b;
        case "!=": return a !== b;
        case ">=": return a >= b;
        case "<=": return a <= b;
        case ">": return a > b;
        case "<": return a < b;
        case "+": return typeof a === "string" || typeof b === "string" ? String(a) + String(b) : Number(a) + Number(b);
        case "-": return Number(a) - Number(b);
        case "*": return Number(a) * Number(b);
        case "/": if (Number(b) === 0) throw new EasyError("0으로 나눌 수 없습니다."); return Number(a) / Number(b);
        case "%": return Number(a) % Number(b);
      }
    }
  }
  if (/^\w+$/.test(expr)) {
    if (Object.hasOwn(env, expr)) return env[expr];
    throw new EasyError(`정의되지 않은 변수입니다: ${expr}`);
  }
  throw new EasyError(`해석할 수 없는 표현식입니다: ${expr}`);
}

function splitOperator(expr, op) {
  let quote = null, escaped = false, depth = 0;
  // Scan only at top level. Operators inside names, strings, or function arguments
  // must never split an expression (e.g. sum(scores) must not split at "or").
  for (let i = 0; i <= expr.length - op.length; i++) {
    const ch = expr[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if ("([{".includes(ch)) depth++;
    else if (")] }".replace(/\s/g, "").includes(ch)) depth--;
    if (depth !== 0) continue;
    if (expr.slice(i, i + op.length) !== op) continue;
    if (op === "and" || op === "or") {
      const before = expr[i - 1] || " ", after = expr[i + op.length] || " ";
      if (/[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) continue;
    }
    // Avoid treating unary +/- as binary operators.
    if ((op === "+" || op === "-") && (i === 0 || "(,[=<>!+-*/%".includes(expr[i - 1]))) continue;
    if (i > 0 && i + op.length < expr.length) return [expr.slice(0, i).trim(), expr.slice(i + op.length).trim()];
  }
  return null;
}

function getBlock(lines, start, baseIndent) {
  const block = [];
  let i = start;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) { i++; continue; }
    const indent = raw.match(/^\s*/)[0].length;
    if (indent <= baseIndent) break;
    block.push({ text: raw.trim(), line: i + 1, indent });
    i++;
  }
  return { block, next: i };
}

function parseInputPrompt(expr, inputs, inputState) {
  const match = expr.match(/^input\((.*)\)$/s);
  if (!match) return null;
  const inside = match[1].trim();
  const ask = inside.match(/^ask\((['"])(.*?)\1\)$/s);
  const direct = inside.match(/^(['"])(.*?)\1$/s);
  const prompt = ask ? ask[2] : direct ? direct[2] : "";
  const raw = inputs[inputState.index++];
  if (raw === undefined) throw new EasyError(`프로그램 입력이 필요합니다: ${prompt || "값을 입력하세요"}`);
  const trimmed = String(raw).trim();
  if (/^-?(0|[1-9]\d*)$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?(?:\d+\.\d*|\.\d+)$/.test(trimmed)) return Number(trimmed);
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "none") return null;
  return String(raw);
}

function executeLines(lines, env, state, baseIndent = -1) {
  for (let i = 0; i < lines.length; i++) {
    if (Date.now() > state.deadline) throw new EasyError("실행 시간 제한을 초과했습니다.");
    if (state.steps++ > 50_000) throw new EasyError("실행 단계 제한을 초과했습니다.");
    const row = lines[i];
    const line = row.line ?? i + 1;
    state.currentLine = line;
    const text = row.text ?? row;
    if (!text || text.startsWith("#")) continue;

    const ifMatch = text.match(/^if\s+(.+):$/);
    const repeatMatch = text.match(/^repeat\s+(.+):$/);
    const forMatch = text.match(/^for\s+([A-Za-z_]\w*)\s+in\s+range\((.+)\):$/);
    if (ifMatch || repeatMatch || forMatch) {
      const indent = row.indent ?? 0;
      const { block, next } = getBlock(lines.map(x => typeof x === "string" ? x : " ".repeat(x.indent ?? 0) + x.text), i + 1, indent);
      const normalized = block.map((b, idx) => ({ ...b, indent: b.indent }));
      let condition = false;
      if (ifMatch) condition = Boolean(evaluate(ifMatch[1], env));
      if (repeatMatch) {
        const n = Number(evaluate(repeatMatch[1], env));
        if (!Number.isInteger(n) || n < 0 || n > 1000) throw new EasyError("repeat 횟수는 0~1000 사이의 정수여야 합니다.", line);
        for (let j = 0; j < n; j++) executeLines(normalized, env, state, indent);
      } else if (forMatch) {
        const args = splitTopLevel(forMatch[2]).map(x => Number(evaluate(x, env)));
        const start = args.length === 1 ? 0 : args[0], end = args.length === 1 ? args[0] : args[1];
        if (!Number.isInteger(start) || !Number.isInteger(end) || Math.abs(end-start) > 1000) throw new EasyError("range 범위가 올바르지 않습니다.", line);
        for (let j = start; j < end; j++) { env[forMatch[1]] = j; executeLines(normalized, env, state, indent); }
      } else if (condition) executeLines(normalized, env, state, indent);
      i = next - 1;
      const nextText = lines[next]?.text ?? lines[next];
      if (ifMatch && nextText?.startsWith("else:")) {
        const elseIndent = lines[next].indent ?? 0;
        const elseBlockRaw = getBlock(lines.map(x => typeof x === "string" ? x : " ".repeat(x.indent ?? 0) + x.text), next + 1, elseIndent);
        const elseBlock = elseBlockRaw.block.map(b => ({ ...b, indent: b.indent }));
        if (!condition) executeLines(elseBlock, env, state, elseIndent);
        i = elseBlockRaw.next - 1;
      }
      continue;
    }

    const printMatch = text.match(/^print\((.*)\)$/s);
    if (printMatch) {
      const parts = splitTopLevel(printMatch[1]);
      const values = parts.map(part => {
        const inputVal = parseInputPrompt(part, state.inputs, state.inputState);
        return inputVal !== null ? inputVal : evaluate(part, env);
      });
      state.output.push(values.map(v => v === null ? "none" : typeof v === "object" ? JSON.stringify(v) : String(v)).join(" "));
      continue;
    }

    const assignment = text.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/s);
    if (assignment) {
      const [, name, expr] = assignment;
      const inputVal = parseInputPrompt(expr, state.inputs, state.inputState);
      env[name] = inputVal !== null ? inputVal : evaluate(expr, env);
      continue;
    }

    throw new EasyError(`지원하지 않는 문장입니다: ${text}`, line);
  }
}

export function diagnoseEasyPeasy(code) {
  const diagnostics = [];
  const lines = code.split(/\r?\n/);
  const push = (line, column, message, severity = "error") => diagnostics.push({
    line, column, endColumn: column + 1, severity, message
  });
  const stack = [];
  let quote = null, escaped = false, comment = false;
  const opens = { "(": ")", "[": "]", "{": "}" };
  const closes = new Set(Object.values(opens));
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    quote = null; escaped = false; comment = false;
    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      if (comment) break;
      if (quote) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === quote) quote = null;
        continue;
      }
      if (ch === "#" ) { comment = true; break; }
      if (ch === "'" || ch === '"') { quote = ch; continue; }
      if (opens[ch]) stack.push({ ch, line: li + 1, column: ci + 1 });
      else if (closes.has(ch)) {
        const last = stack[stack.length - 1];
        if (!last) push(li + 1, ci + 1, `닫을 여는 괄호가 없습니다: '${ch}'`);
        else if (opens[last.ch] !== ch) {
          push(li + 1, ci + 1, `괄호 짝이 맞지 않습니다: '${last.ch}' 다음에 '${ch}'가 왔습니다.`);
          stack.pop();
        } else stack.pop();
      }
    }
    if (quote) push(li + 1, Math.max(1, line.length), "문자열의 닫는 따옴표가 없습니다.");
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    if (/^(if|else|repeat|for|while)\b/.test(t) && !t.endsWith(":")) {
      push(li + 1, Math.max(1, line.length), "문장 끝에 콜론(:)이 필요합니다.");
    }
    if (/^print\s*\(/.test(t) && !/[)]\s*(#.*)?$/.test(t)) {
      push(li + 1, Math.max(1, line.length), "print 함수의 닫는 괄호 ')'가 없습니다.");
    }
    if (/^[A-Za-z_]\w*\s*=/.test(t) && /[=+\-*/]\s*$/.test(t)) {
      push(li + 1, Math.max(1, line.length), "연산자 뒤에 값이 없습니다.");
    }
    if (/^\s+else\s*:/.test(line)) {
      const prev = lines.slice(0, li).reverse().find(x => x.trim());
      if (!prev || !/^if\b/.test(prev.trim())) push(li + 1, line.search(/\S/) + 1, "else는 대응하는 if 블록 뒤에 와야 합니다.", "warning");
    }
  }
  for (const item of stack) push(item.line, item.column, `여는 괄호 '${item.ch}'가 닫히지 않았습니다.`);
  // De-duplicate diagnostics at the same location.
  return diagnostics.filter((d, i, a) => a.findIndex(x => x.line === d.line && x.column === d.column && x.message === d.message) === i);
}

export async function runEasyPeasy(code, inputs = [], options = {}) {
  const diagnostics = diagnoseEasyPeasy(code).filter(d => d.severity === "error");
  if (diagnostics.length) throw new EasyError(diagnostics[0].message, diagnostics[0].line, diagnostics[0].column);
  const env = Object.create(null);
  const state = {
    output: [],
    inputs,
    inputState: { index: 0 },
    deadline: Date.now() + (options.timeoutMs || 1500),
    steps: 0
  };
  const lines = code.split(/\r?\n/).map((text, i) => ({ text: text.trim(), line: i + 1, indent: text.match(/^\s*/)[0].length }));
  try { executeLines(lines, env, state); } catch (error) { if (error && (!error.line || (error.line === 1 && (state.currentLine || 1) !== 1))) error.line = state.currentLine || 1; throw error; }
  let output = state.output.join("\n");
  if (output.length > (options.maxOutput || 30_000)) output = output.slice(0, options.maxOutput || 30_000) + "\n…출력이 잘렸습니다.";
  return { output, variables: Object.fromEntries(Object.entries(env).map(([k,v]) => [k, v])), steps: state.steps };
}
