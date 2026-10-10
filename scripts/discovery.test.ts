import "./resource-efficiency.test.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discover, emptyFilter } from "../src/discovery.ts";
const recipes = JSON.parse(
  readFileSync(new URL("../content/catalog.json", import.meta.url), "utf8"),
).recipes;
test("purpose-only and action-only discovery work without selecting both", () => {
  const cost = discover(recipes, { ...emptyFilter, goal: "cost" });
  assert.ok(cost.some((r) => r.id === "builtin-02"));
  assert.ok(cost.every((r) => r.goals?.includes("cost")));
  const discuss = discover(recipes, { ...emptyFilter, action: "discuss" });
  assert.ok(discuss.some((r) => r.id === "builtin-13"));
  assert.ok(discuss.every((r) => r.actions?.includes("discuss")));
});
test("empty results and repeated filtering do not mutate inputs ", () => {
  const input = JSON.stringify(recipes);
  for (const query of ["恒久", "理解", "存在しないレシピ"])
    discover(recipes, { ...emptyFilter, query });
  assert.equal(JSON.stringify(recipes), input);
  assert.equal(
    discover(recipes, { ...emptyFilter, query: "存在しないレシピ" }).length,
    0,
  );
  assert.equal(discover(recipes, emptyFilter).length, recipes.length);
});
test("legacy unclassified recipes remain searchable without guessing a classification", () => {
  const old = [{ ...recipes[0], actions: undefined, goals: undefined }];
  assert.equal(discover(old, { ...emptyFilter, query: "理解確認" }).length, 1);
  assert.equal(discover(old, { ...emptyFilter, goal: "quality" }).length, 0);
});
