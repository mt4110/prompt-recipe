import { useState } from "react";
import { message, request } from "../api";
import type { Snapshot } from "../types";
export function FeedbackView({
  snapshot,
  refresh,
  notice,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [revision, setRevision] = useState(
    snapshot.recipes[0]?.revision_id || "",
  );
  const [outcome, setOutcome] = useState("手直しした");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>使った結果から整える</h1>
          <p className="muted">
            評価は任意。失敗した条件も、うまくいった理由も残せます。
          </p>
        </div>
      </div>
      <div className="columns">
        <section className="panel">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await request("feedback", {
                  revision_id: revision,
                  outcome,
                  note,
                });
                setNote("");
                await refresh();
                notice("この版へのフィードバックを保存しました。");
              } catch (err) {
                notice(message(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              使ったレシピの版
              <select
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              >
                {snapshot.revisions.map((r) => (
                  <option
                    value={r.recipe.revision_id}
                    key={r.recipe.revision_id}
                  >
                    {r.recipe.name} · v{r.recipe.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              結果
              <select
                value={outcome}
                onChange={(e) => setOutcome(e.target.value)}
              >
                {["そのまま使えた", "手直しした", "指示を守らなかった"].map(
                  (v) => (
                    <option key={v}>{v}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              次に直したいこと
              <textarea
                rows={6}
                placeholder="何を依頼し、どうズレたか。秘密や案件のログは含めないでください。"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button disabled={busy} className="primary">
              {busy ? "保存中…" : "結果を残す"}
            </button>
            <p className="hint">
              メモはローカル保存。自動送信・モデルの訓練は行いません。
            </p>
          </form>
        </section>
        <section className="panel">
          <h2>改善の記録</h2>
          {!snapshot.feedback.length && (
            <p className="muted">
              まだ記録がありません。必要なときに一件から。
            </p>
          )}
          {snapshot.feedback.map((f, i) => (
            <article className="feedback-row" key={i}>
              <strong>
                {snapshot.revisions.find(
                  (r) => r.recipe.revision_id === f.revision_id,
                )?.recipe.name || f.revision_id}
              </strong>
              <p className="badge">{f.outcome}</p>
              <p className="preserve">{f.note || "メモなし"}</p>
              <small className="muted">
                {f.created_at} UTC · 版に紐付いた記録
              </small>
            </article>
          ))}
          <p className="hint">
            修正は「レシピ」で新版を作り、プロジェクトで採用します。追加だけでなく短縮・条件付け・分割も検討してください。
          </p>
        </section>
      </div>
    </>
  );
}
