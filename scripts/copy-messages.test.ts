import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFailure, copySuccess } from "../src/copyMessages.ts";
test("copy success remains explicit even when history is unavailable", () => {
  assert.equal(copySuccess(123, null), "コピーしました（123文字）");
  assert.equal(copySuccess(8, "履歴を記録しません。"), "コピーしました（8文字） · 履歴を記録しません。");
});
test("copy failure is explicit without duplicate prefixes", () => {
  assert.equal(copyFailure("権限がありません。"), "コピーできませんでした。権限がありません。");
  assert.equal(copyFailure("コピーできませんでした。入力は保持されています。"), "コピーできませんでした。入力は保持されています。");
});
