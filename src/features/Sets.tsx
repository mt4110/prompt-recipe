import { useState } from "react";
import { message, request } from "../api";
import { downloadPack } from "../export";
import type { RecipeSet, Snapshot } from "../types";
export function Sets({
  snapshot,
  ids,
  apply,
  refresh,
  notice,
}: {
  snapshot: Snapshot;
  ids: string[];
  apply: (ids: string[]) => void;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel">
      <h2>プロンプトセット</h2>
      <p className="muted">
        選択した順番と版を保存して、別のプロジェクトでも使えます。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await request("save_set", {
              set: { id: "", name, revision_ids: ids, version: 1 },
              expected_version: 0,
            });
            setName("");
            await refresh();
            notice("セットを保存しました。");
          } catch (err) {
            notice(message(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          セット名
          <input
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="開発の基本"
          />
        </label>
        <button disabled={busy || !ids.length}>
          選択中の{ids.length}本をセットとして保存
        </button>
      </form>
      {!snapshot.sets.length && (
        <p className="hint">まだ保存したセットはありません。</p>
      )}
      {snapshot.sets.map((s: RecipeSet) => (
        <div className="set-row" key={s.id}>
          <strong>{s.name}</strong>
          <small>
            {" "}
            · {s.revision_ids.length}本 · v{s.version}
          </small>
          <details>
            <summary>合成順を確認</summary>
            <ol>
              {s.revision_ids.map((id) => (
                <li key={id}>
                  {snapshot.revisions.find((r) => r.recipe.revision_id === id)
                    ?.recipe.name || id}
                </li>
              ))}
            </ol>
          </details>
          <div className="actions">
            <button onClick={() => apply([...s.revision_ids])}>
              このセットを使う
            </button>
            <button
              onClick={async () => {
                try {
                  const saved = await downloadPack(
                    await request("export_archive", { set_id: s.id }),
                    "prompt-recipe-set.json",
                  );
                  notice(
                    saved
                      ? "セットと必要な版履歴をExportしました。"
                      : "Exportをキャンセルしました。",
                  );
                } catch (e) {
                  notice(message(e));
                }
              }}
            >
              Export
            </button>
          </div>
        </div>
      ))}
    </section>
  );
}
