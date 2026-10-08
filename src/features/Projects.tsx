import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop, message, request } from "../api";
import type { Project, Snapshot } from "../types";
import { discover, emptyFilter } from "../discovery";
import { RecipeFilters } from "./RecipeFilters";
import { Sets } from "./Sets";
import { Composer } from "./Composer";
export function Projects({
  snapshot,
  refresh,
  notice,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const active =
    snapshot.projects.find((p) => p.id === snapshot.active_project) ||
    snapshot.projects[0];
  const aiProfile = snapshot.ai_catalog.profiles.find(
    (p) => p.id === snapshot.ai_target?.profile_id,
  );
  const aiTask = snapshot.ai_catalog.tasks.find(
    (t) => t.id === snapshot.ai_target?.task,
  );
  const [draft, setDraft] = useState<Project>(active);
  const [values, setValues] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState(emptyFilter);
  const [reveal, setReveal] = useState(0);
  const [busy, setBusy] = useState(false);
  const all = [
    ...snapshot.recipes,
    ...snapshot.revisions
      .map((r) => r.recipe)
      .filter(
        (r) =>
          draft.assignment.includes(r.revision_id) &&
          !snapshot.recipes.some((c) => c.revision_id === r.revision_id),
      ),
  ];
  const filtered = discover(all, filter);
  const saved = snapshot.projects.find((p) => p.id === draft.id);
  const metadataDirty =
    !!saved &&
    (draft.name !== saved.name || draft.environment !== saved.environment);
  async function save() {
    setBusy(true);
    try {
      const p = await request<Project>("save_project", {
        project: draft,
        expected_version: draft.version,
      });
      await request("activate_project", { project_id: p.id });
      setDraft(p);
      await refresh();
      notice("プロジェクトとセットを保存しました。");
    } catch (e) {
      notice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>プロジェクトの依頼を整える</h1>
          <p className="muted">いつもの指示を選んで、今回の素材を入れる。</p>
        </div>
        <button
          disabled={busy || !desktop}
          onClick={async () => {
            setBusy(true);
            try {
              const p = await invoke<Project | null>("open_repository");
              if (p) {
                setDraft(p);
                setValues({});
                await refresh();
                notice("Gitプロジェクトを開きました。");
              }
            } catch (e) {
              notice(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          プロジェクトを開く
        </button>
      </div>
      {aiProfile && snapshot.ai_target && (
        <p className="ai-context">
          <strong>{aiProfile[snapshot.ai_target.surface]}</strong> ·{" "}
          {aiTask?.name} ·{" "}
          {snapshot.ai_target.format === "xml" ? "XML" : "Markdown"}
          <br />
          <span className="muted">
            変更は上部の「AIを比較・選択」から。実際のモデルは利用先で確認してください。
          </span>
        </p>
      )}
      <div className="columns">
        <div>
          <section className="panel">
            <p className="hint">
              {snapshot.repositories[draft.id] ||
                "台帳用の保存領域です。Gitプロジェクトは「プロジェクトを開く」から選びます。"}
            </p>
            <label>
              プロジェクト
              <select
                value={draft.id}
                onChange={async (e) => {
                  const p = snapshot.projects.find(
                    (p) => p.id === e.target.value,
                  );
                  if (p) {
                    setDraft(p);
                    setValues({});
                    try {
                      await request("activate_project", { project_id: p.id });
                      await refresh();
                    } catch (err) {
                      notice(message(err));
                    }
                  }
                }}
              >
                {!draft.id && <option value="">新規作成中</option>}
                {snapshot.projects.map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              名前
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </label>
            <label>
              AIを使う環境
              <select
                value={draft.environment}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    environment: e.target.value as Project["environment"],
                  })
                }
              >
                <option value="code">コード・実行環境にアクセスできる</option>
                <option value="chat">会話のみ</option>
              </select>
            </label>
            <label>
              指示書・正本の参照先
              <textarea
                rows={2}
                placeholder="AGENTS.md、docs/ARCHITECTURE.mdなど"
                value={draft.reference}
                onChange={(e) => {
                  setDraft({ ...draft, reference: e.target.value });
                  setValues({ ...values, reference: e.target.value });
                }}
              />
            </label>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? "保存中…" : "このセットを保存"}
            </button>
          </section>
          <Sets
            snapshot={snapshot}
            ids={draft.assignment}
            apply={(ids) => {
              setDraft({ ...draft, assignment: ids });
              setReveal((v) => v + 1);
            }}
            refresh={refresh}
            notice={notice}
          />
          <section className="panel">
            <div className="section-title">
              <h2>使うレシピ</h2>
              <span className="muted">選択順に合成</span>
            </div>
            <RecipeFilters value={filter} onChange={setFilter} />
            <details className="selected-set">
              <summary>
                選択済み {draft.assignment.length}本 · 合成順を確認
              </summary>
              <ol>
                {draft.assignment.map((id) => {
                  const r = all.find((r) => r.revision_id === id);
                  return (
                    <li key={id}>
                      {r?.name || "版が見つかりません"} · v{r?.version}
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`${r?.name}をセットから外す`}
                        onClick={() => {
                          setDraft({
                            ...draft,
                            assignment: draft.assignment.filter(
                              (v) => v !== id,
                            ),
                          });
                          setReveal((v) => v + 1);
                        }}
                      >
                        外す
                      </button>
                    </li>
                  );
                })}
              </ol>
              <p className="hint">
                絞り込みは選択済みの内容・順番を変えません。旧版の採用もそのままです。
              </p>
            </details>
            <p className="muted" role="status">
              候補 {filtered.length}本
            </p>
            <div className="recipe-list">
              {!filtered.length && (
                <p className="muted">
                  該当するレシピはありません。条件を戻して探せます。
                </p>
              )}
              {filtered.map((r) => (
                <label
                  className={
                    "check-row " +
                    (draft.assignment.includes(r.revision_id) ? "selected" : "")
                  }
                  key={r.revision_id}
                >
                  <input
                    type="checkbox"
                    checked={draft.assignment.includes(r.revision_id)}
                    onChange={(e) => {
                      setDraft({
                        ...draft,
                        assignment: e.target.checked
                          ? [...draft.assignment, r.revision_id]
                          : draft.assignment.filter(
                              (id) => id !== r.revision_id,
                            ),
                      });
                      setReveal((v) => v + 1);
                    }}
                  />
                  <span>
                    <strong>{r.name}</strong>
                    <small>
                      {r.lesson?.area || "自分のレシピ"} · v{r.version}
                      {snapshot.recipes.some(
                        (c) => c.id === r.id && c.revision_id !== r.revision_id,
                      )
                        ? " · 固定した旧版"
                        : ""}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <div>
          {metadataDirty ? (
            <section className="panel">
              <h2>名前・利用環境を保存してください</h2>
              <p>
                保存すると、その環境でのプレビューと制約検査に切り替わります。
              </p>
            </section>
          ) : saved ? (
            <Composer
              project={saved}
              ids={draft.assignment}
              values={values}
              setValues={setValues}
              notice={notice}
              revealToken={reveal}
            />
          ) : (
            <section className="panel">
              <h2>まずプロジェクトを保存</h2>
              <p>名前・環境・セットを保存するとプレビューを利用できます。</p>
            </section>
          )}
          <p className="hint">
            参照先のファイルを自動で読み取りません。AIへ渡せる場所を指定してください。環境や割当の変更は保存すると小窓にも反映します。
          </p>
        </div>
      </div>
    </>
  );
}
