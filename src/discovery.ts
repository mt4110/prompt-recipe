import type { Recipe } from "./types";

export const actions = [
  ["analyze", "分析する"],
  ["fix", "直す"],
  ["design", "設計する"],
  ["discuss", "相談する"],
] as const;
export const goals = [
  ["quality", "品質"],
  ["time", "時間"],
  ["cost", "コスト"],
  ["understanding", "理解"],
] as const;
export type Filter = { query: string; action: string; goal: string };
export const emptyFilter: Filter = { query: "", action: "", goal: "" };

// Pure local discovery. It never edits the input array or the composition selection.
export function discover(recipes: Recipe[], filter: Filter) {
  const query = filter.query.trim().toLocaleLowerCase("ja");
  return recipes.filter(
    (r) =>
      (!filter.action || r.actions?.includes(filter.action)) &&
      (!filter.goal || r.goals?.includes(filter.goal)) &&
      (!query ||
        [
          r.name,
          r.description,
          r.lesson?.area || "",
          r.lesson?.purpose || "",
          ...actions
            .filter(([id]) => r.actions?.includes(id))
            .map(([, label]) => label),
          ...goals
            .filter(([id]) => r.goals?.includes(id))
            .map(([, label]) => label),
        ]
          .join(" ")
          .toLocaleLowerCase("ja")
          .includes(query)),
  );
}
