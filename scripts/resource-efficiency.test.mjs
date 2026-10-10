// Static compatibility guards; not an app-import, security, or savings proof.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../content/packs/resource-efficiency.json", import.meta.url), "utf8");
const pack = JSON.parse(source);
const recipeKeys = ["id", "revision_id", "version", "parent_revision_id", "name", "description", "body", "builtin", "variables", "constraints", "lesson", "actions", "goals"];
const lessonKeys = ["purpose", "example", "why", "verify", "limitations", "evidence", "reviewed_at", "level", "area"];
const byteLength = (value) => Buffer.byteLength(value, "utf8");

function assertKeys(value, expected) {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort());
}

test("resource pack is a bounded schema-2 catalog with independent immutable revision IDs", () => {
  assertKeys(pack, ["schema_version", "version", "recipes"]);
  assert.equal(pack.schema_version, 2);
  assert.ok(byteLength(source) < 1024 * 1024);
  assert.equal(pack.recipes.length, 9);
  assert.equal(new Set(pack.recipes.map((r) => r.id)).size, 9);
  assert.equal(new Set(pack.recipes.map((r) => r.revision_id)).size, 9);
  for (const r of pack.recipes) {
    assertKeys(r, recipeKeys);
    assert.match(r.id, /^resource-efficiency-[a-z]+$/);
    assert.equal(r.revision_id, `${r.id}-v1`);
    assert.ok(byteLength(r.id) <= 128 && byteLength(r.revision_id) <= 128);
    assert.equal(r.version, 1);
    assert.equal(r.parent_revision_id, null);
    assert.equal(r.builtin, false);
    assert.deepEqual(r.variables, []);
    assert.deepEqual(r.constraints, []);
    assert.ok(!r.body.includes("{{"));
  }
});

test("every recipe has executable text, complete lesson metadata, and supported discovery labels", () => {
  for (const r of pack.recipes) {
    assert.ok(r.name.trim() && byteLength(r.name) <= 200);
    for (const key of ["description", "body"]) {
      assert.equal(typeof r[key], "string");
      assert.ok(r[key].trim() && byteLength(r[key]) <= 256 * 1024);
    }
    assertKeys(r.lesson, lessonKeys);
    for (const value of Object.values(r.lesson)) {
      assert.equal(typeof value, "string");
      assert.ok(value.trim() && byteLength(value) <= 256 * 1024);
    }
    for (const [values, allowed] of [[r.actions, ["analyze", "fix", "design", "discuss"]], [r.goals, ["quality", "time", "cost", "understanding"]]]) {
      assert.ok(values.length > 0 && values.every((v) => allowed.includes(v)));
      assert.equal(new Set(values).size, values.length);
    }
    assert.ok(r.goals.includes("cost"));
    assert.ok(r.lesson.evidence.includes("未検証"));
  }
});

test("public material contains no machine-specific home path and keeps the optional-use boundary", () => {
  const guide = readFileSync(new URL("../docs/TOKEN-EFFICIENCY.md", import.meta.url), "utf8");
  const global = readFileSync(new URL("../docs/examples/AGENTS.resource-efficiency.md", import.meta.url), "utf8");
  for (const text of [source, guide, global]) {
    assert.doesNotMatch(text, /\/Users\/|\/home\/[A-Za-z0-9_-]+\/|[A-Z]:\\Users\\/);
  }
  assert.ok(guide.includes("9本を毎回まとめて合成しない"));
  assert.ok(guide.includes("任意導入"));
  assert.equal(global.split("<!-- prompt-recipe:resource-efficiency:start -->").length, 2);
  assert.equal(global.split("<!-- prompt-recipe:resource-efficiency:end -->").length, 2);
});

test("instruction bodies exclude lesson explanations and retain critical caveats", () => {
  const get = (suffix) => pack.recipes.find((r) => r.id === `resource-efficiency-${suffix}`).body;
  assert.ok(get("core").includes("未実行・解析不能を成功としない"));
  assert.ok(get("evidence").includes("追加取得方法"));
  assert.ok(get("security").includes("本番遮断ルールへ自動昇格させず"));
  assert.ok(get("research").includes("反例が見つからないことを証明とせず"));
  assert.ok(get("measure").includes("トークン削減率を電力やCO2の削減率へ換算しない"));
  for (const r of pack.recipes) assert.ok(!r.body.includes(r.lesson.why));
});
