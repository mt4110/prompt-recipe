import { useEffect, useState } from "react";
import { message, request } from "../api";
import type { Constraint, Recipe, Snapshot } from "../types";
import { discover, emptyFilter } from "../discovery";
import { ClassificationEditor, RecipeFilters } from "./RecipeFilters";
import { Sets } from "./Sets";
import { LintPanel } from "./LintPanel";
import { downloadPack } from "../export";
import { Composer, LessonView } from "./Composer";
const keys = [
  "approval.before_implementation",
  "network.allowed",
  "parallel.allowed",
  "execution.required",
];
const labels = [
  "実装前に承認を待つ",
  "ネットワーク利用を許可",
  "並列作業を許可",
  "実行環境を必要とする",
];
export function Library({
  snapshot,
  refresh,
  notice,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [ids, setIds] = useState<string[]>(
    snapshot.recipes.find((r) => !r.builtin)
      ? [snapshot.recipes.find((r) => !r.builtin)!.revision_id]
      : [],
  );
  const [builtin, setBuiltin] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState(emptyFilter);
  const [selected, setSelected] = useState(
    snapshot.recipes.find((r) => !r.builtin)?.revision_id || "",
  );
  const [edit, setEdit] = useState<{
    recipe_id: string | null;
    expected_revision: string | null;
    name: string;
    description: string;
    body: string;
    reason: string;
    constraints: Constraint[];
    actions: string[];
    goals: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState<{
    catalog: {
      schema_version?: number;
      recipes: Recipe[];
      sets?: { name: string }[];
    };
    plan: {
      plan_hash: string;
      changes: { name: string; from: number; to: number; action: string }[];
    };
  } | null>(null);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".lesson h2");
    if (!el) return;
    const bounds = el.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight)
      el.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [selected]);
  const recipe = snapshot.revisions.find(
    (r) => r.recipe.revision_id === selected,
  )?.recipe;
  const filtered = discover(
    snapshot.recipes.filter((r) => r.builtin === builtin),
    filter,
  );
  function start(r?: Recipe) {
    setEdit({
      recipe_id: r && !r.builtin ? r.id : null,
      expected_revision:
        r && !r.builtin
          ? snapshot.recipes.find((c) => c.id === r.id)?.revision_id ||
            r.revision_id
          : r?.revision_id || null,
      name: r?.name || "",
      description: r?.description || "",
      body: r?.body || "",
      reason: r ? `v${r.version}をもとに自分の案件に合わせる` : "新規作成",
      constraints: r?.constraints || [],
      actions: r?.actions || [],
      goals: r?.goals || [],
    });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>プロンプト台帳</h1>
          <p className="muted">いつもの指示を、すぐ使う。</p>
        </div>
        <div className="actions">
          <button
            onClick={async () => {
              try {
                const saved = await downloadPack(
                  await request("export_archive", { set_id: null }),
                  "prompt-recipe-ledger.json",
                );
                notice(
                  saved
                    ? "台帳とセットをExportしました。本文は平文です。"
                    : "Exportをキャンセルしました。",
                );
              } catch (e) {
                notice(message(e));
              }
            }}
          >
            台帳をExport
          </button>
          <label className="file-button">
            台帳・セットをImport
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  if (file.size > 1024 * 1024)
                    throw new Error("パックは1 MiB以内で選んでください。");
                  const catalog = JSON.parse(await file.text());
                  const plan = await request<{
                    plan_hash: string;
                    changes: {
                      name: string;
                      from: number;
                      to: number;
                      action: string;
                    }[];
                  }>(
                    catalog.schema_version === 3
                      ? "inspect_archive"
                      : "inspect_import",
                    catalog.schema_version === 3
                      ? { archive: catalog }
                      : { catalog },
                  );
                  setImporting({ catalog, plan });
                } catch (err) {
                  notice(message(err));
                } finally {
                  e.target.value = "";
                }
              }}
            />
          </label>
          <button onClick={() => start()}>プロンプトを登録</button>
        </div>
      </div>
      <div className="columns">
        <section className="panel">
          <div className="filter-chips">
            <button aria-pressed={!builtin} onClick={() => setBuiltin(false)}>
              自分の台帳
            </button>
            <button aria-pressed={builtin} onClick={() => setBuiltin(true)}>
              組み込み教材
            </button>
          </div>
          <RecipeFilters value={filter} onChange={setFilter} />
          <p role="status" className="muted">
            候補 {filtered.length}本 · 詳細の表示は保持します
          </p>
          <div className="recipe-list">
            {filtered.map((r) => (
              <div className="ledger-row" key={r.id}>
                <input
                  type="checkbox"
                  aria-label={`${r.name}をセットに追加`}
                  checked={ids.includes(r.revision_id)}
                  onChange={(e) => {
                    setIds(
                      e.target.checked
                        ? [...ids, r.revision_id]
                        : ids.filter((id) => id !== r.revision_id),
                    );
                    if (!selected) setSelected(r.revision_id);
                  }}
                />
                <button
                  className={
                    "recipe-row " +
                    (selected === r.revision_id ? "selected" : "")
                  }
                  key={r.id}
                  onClick={() => {
                    setSelected(r.revision_id);
                    setIds([r.revision_id]);
                    setValues({});
                  }}
                >
                  <strong>{r.name}</strong>
                  <span>{r.description}</span>
                  <small>
                    {r.builtin ? "教材候補" : "自分のレシピ"} · v{r.version}
                  </small>
                </button>
              </div>
            ))}
            {!filtered.length && (
              <p className="muted">
                {builtin
                  ? "該当する教材はありません。"
                  : "プロンプトを登録するか、組み込み教材から自分用に取り込めます。"}
              </p>
            )}
          </div>
        </section>
        <div>
          <Sets
            snapshot={snapshot}
            ids={ids}
            apply={(v) => {
              setIds(v);
              setSelected(v[0] || "");
              setValues({});
            }}
            refresh={refresh}
            notice={notice}
          />
          {recipe && (
            <>
              <LessonView recipe={recipe} />
              <LintPanel text={recipe.body} />

              <Composer
                standalone
                project={{
                  id: "personal",
                  name: "台帳",
                  environment: "code",
                  reference: "",
                  assignment: [],
                  version: 1,
                }}
                ids={ids}
                values={values}
                setValues={setValues}
                notice={notice}
              />
              <div className="actions">
                <button onClick={() => start(recipe)}>
                  {recipe.builtin ? "自分用に複製" : "新版を作る"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const pack = await request("export", {
                        revision_ids: [recipe.revision_id],
                      });
                      const saved = await downloadPack(pack);
                      notice(
                        saved
                          ? "レシピをExportしました。"
                          : "Exportをキャンセルしました。",
                      );
                    } catch (e) {
                      notice(message(e));
                    }
                  }}
                >
                  JSONでExport
                </button>
              </div>
              <section className="panel history">
                <h3>版と変更理由</h3>
                {snapshot.revisions
                  .filter((r) => r.recipe.id === recipe.id)
                  .map((r) => (
                    <button
                      className="history-row"
                      key={r.recipe.revision_id}
                      onClick={() => {
                        setSelected(r.recipe.revision_id);
                        setIds([r.recipe.revision_id]);
                        setValues({});
                      }}
                    >
                      v{r.recipe.version} · {r.reason}
                      {r.recipe.revision_id === selected ? " · 表示中" : ""}
                    </button>
                  ))}
              </section>
            </>
          )}
        </div>
      </div>
      {importing && (
        <div className="modal-backdrop">
          <section
            className="panel editor"
            role="dialog"
            aria-modal="true"
            aria-label="Importする変更"
          >
            <h2>導入する版を確認</h2>
            <p className="hint">
              ローカルのJSONだけを読みます。プロジェクトの割当は現在の版に固定したままです。教材の根拠はレシピで確認できます。
            </p>
            {importing.plan.changes.map((c, i) => (
              <p key={i}>
                {c.name} · {c.action} · {c.from ? `v${c.from} → ` : ""}v{c.to}
              </p>
            ))}
            {importing.catalog.sets?.map((s, i) => (
              <p key={i}>セット：{s.name}</p>
            ))}
            <p className="hint">
              新しい既存版とプロジェクトの割り当ては保持します。同一IDのセットが異なる場合は導入を止めます。
            </p>
            {importing.catalog.recipes.map((r) => (
              <details key={r.revision_id}>
                <summary>{r.name}の本文を確認</summary>
                <pre>{r.body}</pre>
                <p className="hint">
                  {r.lesson?.evidence || "個人レシピ・効果未検証"}
                </p>
              </details>
            ))}
            <div className="actions">
              <button
                autoFocus
                disabled={busy}
                onClick={() => setImporting(null)}
              >
                キャンセル
              </button>
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(
                      importing.catalog.schema_version === 3
                        ? "import_archive"
                        : "import",
                      {
                        ...(importing.catalog.schema_version === 3
                          ? { archive: importing.catalog }
                          : { catalog: importing.catalog }),
                        expected_plan: importing.plan.plan_hash,
                      },
                    );
                    await refresh();
                    setImporting(null);
                    notice(
                      "導入しました。使う版はプロジェクトで選んでください。",
                    );
                  } catch (err) {
                    notice(message(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                この変更を導入
              </button>
            </div>
          </section>
        </div>
      )}
      {edit && (
        <div className="modal-backdrop">
          <section
            className="panel editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="editor-title"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) setEdit(null);
              if (e.key === "Tab") {
                const targets = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    "button:not(:disabled),input,textarea,select",
                  ),
                );
                const first = targets[0],
                  last = targets.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <h2 id="editor-title">自分のレシピを保存</h2>
            <p className="muted">
              旧版とプロジェクトの割当は保持します。構造化制約は本文と対応させてください。
            </p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  const r = await request<Recipe>("save_recipe", edit);
                  await refresh();
                  setSelected(r.revision_id);
                  setIds([r.revision_id]);
                  setBuiltin(false);
                  setValues({});
                  setEdit(null);
                  notice(
                    "新版を保存しました。プロジェクトで採用する版を選んでください。",
                  );
                } catch (err) {
                  notice(message(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                名前
                <input
                  autoFocus
                  required
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label>
                説明
                <input
                  value={edit.description}
                  onChange={(e) =>
                    setEdit({ ...edit, description: e.target.value })
                  }
                />
              </label>
              <label>
                本文
                <textarea
                  required
                  rows={7}
                  placeholder="{{variable}}で入力欄を作れます"
                  value={edit.body}
                  onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                />
              </label>
              <LintPanel text={edit.body} />
              <ClassificationEditor
                actions={edit.actions}
                goals={edit.goals}
                onChange={(patch) => setEdit({ ...edit, ...patch })}
              />
              <fieldset>
                <legend>構造化制約（指定した項目のみ検査）</legend>
                {keys.map((key, i) => (
                  <label className="constraint" key={key}>
                    {labels[i]}
                    <select
                      value={String(
                        edit.constraints.find((c) => c.key === key)?.value ??
                          "unset",
                      )}
                      onChange={(e) =>
                        setEdit({
                          ...edit,
                          constraints: [
                            ...edit.constraints.filter((c) => c.key !== key),
                            ...(e.target.value === "unset"
                              ? []
                              : [{ key, value: e.target.value === "true" }]),
                          ],
                        })
                      }
                    >
                      <option value="unset">未指定</option>
                      <option value="true">はい</option>
                      <option value="false">いいえ</option>
                    </select>
                  </label>
                ))}
              </fieldset>
              <details>
                <summary>変更理由（任意で調整）</summary>
                <label>
                  変更理由
                  <input
                    required
                    value={edit.reason}
                    onChange={(e) =>
                      setEdit({ ...edit, reason: e.target.value })
                    }
                  />
                </label>
              </details>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEdit(null)}
                >
                  キャンセル
                </button>
                <button className="primary" disabled={busy}>
                  {busy ? "保存中…" : "新版を保存"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
