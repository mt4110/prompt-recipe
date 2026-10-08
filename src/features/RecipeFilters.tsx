import { actions, goals, emptyFilter, type Filter } from "../discovery";

export function RecipeFilters({
  value,
  onChange,
  search = true,
}: {
  value: Filter;
  onChange: (filter: Filter) => void;
  search?: boolean;
}) {
  return (
    <div className="recipe-filters">
      {search && (
        <input
          type="search"
          aria-label="レシピを絞る"
          placeholder="名前・目的・領域で検索"
          value={value.query}
          onChange={(e) => onChange({ ...value, query: e.target.value })}
        />
      )}
      <fieldset>
        <legend>やりたいこと</legend>
        <div className="filter-chips">
          <button
            type="button"
            aria-pressed={!value.action}
            onClick={() => onChange({ ...value, action: "" })}
          >
            すべて
          </button>
          {actions.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={value.action === id}
              onClick={() =>
                onChange({ ...value, action: value.action === id ? "" : id })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>
          目的 <span className="muted">任意</span>
        </legend>
        <div className="filter-chips">
          {goals.map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={value.goal === id}
              onClick={() =>
                onChange({ ...value, goal: value.goal === id ? "" : id })
              }
            >
              {label}
            </button>
          ))}
          {(value.query || value.action || value.goal) && (
            <button
              type="button"
              className="text-button"
              onClick={() => onChange(emptyFilter)}
            >
              条件を戻す
            </button>
          )}
        </div>
      </fieldset>
    </div>
  );
}

export function ClassificationEditor({
  actions: selectedActions,
  goals: selectedGoals,
  onChange,
}: {
  actions: string[];
  goals: string[];
  onChange: (patch: { actions: string[] } | { goals: string[] }) => void;
}) {
  return (
    <fieldset>
      <legend>探すための分類（複数選択・任意）</legend>
      {[
        { key: "actions" as const, options: actions, values: selectedActions },
        { key: "goals" as const, options: goals, values: selectedGoals },
      ].map(({ key, options, values }) => (
        <div className="filter-chips" key={key}>
          {options.map(([id, label]) => (
            <label className="classification-check" key={id}>
              <input
                type="checkbox"
                checked={values.includes(id)}
                onChange={(e) =>
                  onChange({
                    [key]: e.target.checked
                      ? [...values, id]
                      : values.filter((v) => v !== id),
                  } as { actions: string[] } | { goals: string[] })
                }
              />
              {label}
            </label>
          ))}
        </div>
      ))}
    </fieldset>
  );
}
