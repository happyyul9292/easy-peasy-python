import test from "node:test";
import assert from "node:assert/strict";
import { runEasyPeasy, diagnoseEasyPeasy } from "../src/easypeasy.js";

test("prints values and evaluates arithmetic", async () => {
  const result = await runEasyPeasy('age = 13\nprint(age + 1)');
  assert.equal(result.output, "14");
});

test("supports sorting and uppercase extraction", async () => {
  const result = await runEasyPeasy('items = [5, 2, 9]\nprint(upsort(items))\nprint(only_upper("Easy PEASY"))');
  assert.equal(result.output, "[2,5,9]\nEPEASY");
});

test("supports interactive typed input inference", async () => {
  const result = await runEasyPeasy('age = input(ask("Age?"))\nprint(age + 1)', ["13"]);
  assert.equal(result.output, "14");
});

test("diagnoses missing colon", () => {
  const result = diagnoseEasyPeasy("if age > 18\n    print(\"yes\")");
  assert.ok(result.some(item => /콜론/.test(item.message)));
});

test("diagnoses unclosed brackets", () => {
  const result = diagnoseEasyPeasy('items = [1, 2, 3');
  assert.ok(result.some(item => /닫히지 않았습니다/.test(item.message)));
});

test("diagnoses unmatched closing bracket", () => {
  const result = diagnoseEasyPeasy('print(1))');
  assert.ok(result.some(item => /여는 괄호가 없습니다/.test(item.message)));
});


test("does not split variable names containing the word operator 'or'", async () => {
  const result = await runEasyPeasy('scores = [85, 92, 78, 96, 88]\nsorted_scores = upsort(scores)\nprint("total:", sum(scores))\nprint("average:", average(scores))\nprint("lowest:", first(sorted_scores))\nprint("highest:", last(sorted_scores))');
  assert.equal(result.output, "total: 439\naverage: 87.8\nlowest: 78\nhighest: 96");
});

test("diagnoses an unclosed string", () => {
  const result = diagnoseEasyPeasy('name = "도율');
  assert.ok(result.some(item => /닫는 따옴표/.test(item.message)));
});
