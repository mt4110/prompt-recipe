import { useEffect, useRef, useState } from "react";
import { message, request } from "../api";
import type { Snapshot } from "../types";
import { Composer } from "./Composer";

export function Onboarding({
  snapshot,
  refresh,
  notice,
  finish,
  compare,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
  finish: () => void;
  compare: () => void;
}) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  const recipe =
    snapshot.recipes.find((r) => r.id === "builtin-01") || snapshot.recipes[0];
  const project =
    snapshot.projects.find((p) => p.id === snapshot.active_project) ||
    snapshot.projects[0];
  const target = snapshot.ai_target;
  const profile = snapshot.ai_catalog.profiles.find(
    (p) => p.id === target?.profile_id,
  );
  const task = snapshot.ai_catalog.tasks.find((t) => t.id === target?.task);
  const recommended = snapshot.recipes.filter((r) =>
    task?.recipe_ids.includes(r.id),
  );
  const [name, setName] = useState("開発の基本");
  function advance(n: number) {
    setStep(n);
    requestAnimationFrame(() => heading.current?.focus());
  }
  async function complete(save: boolean) {
    setBusy(true);
    try {
      if (save) {
        await request("save_set", {
          set: {
            id: "",
            name,
            version: 1,
            revision_ids: [
              ...new Set([
                recipe.revision_id,
                ...recommended.map((r) => r.revision_id),
              ]),
            ],
          },
          expected_version: 0,
        });
      }
      await request("complete_onboarding");
      await refresh();
      finish();
      notice(
        save
          ? "最初のセットを保存しました。台帳から使うか、Gitプロジェクトへ割り当てられます。"
          : "案内は「使い方」からいつでも開けます。",
      );
    } catch (e) {
      notice(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="onboarding">
      <div className="onboarding-top">
        <span className="brand">Prompt Recipe</span>
        <button className="ai-open" onClick={compare}>
          AIを比較・選択
        </button>
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void complete(false)}
        >
          案内をスキップ
        </button>
      </div>
      {profile && target && (
        <section className="ai-context">
          <strong>{profile[target.surface]}</strong>
          <span>
            {task?.name} · {target.format === "xml" ? "XML" : "Markdown"}
          </span>
          <p>{task?.guidance}</p>
        </section>
      )}
      <ol className="steps" aria-label="初回の案内">
        {["ひとつ知る", "自分の依頼で使う", "次も使えるようにする"].map(
          (label, i) => (
            <li
              key={label}
              aria-current={step === i ? "step" : undefined}
              className={step === i ? "current" : ""}
            >
              <span>{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      {step === 0 && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            いつもの依頼を、ひとつのレシピに。
          </h1>
          <p className="onboarding-lead">
            まずは「指示書を読んだことを、今回の依頼に結び付けて説明してもらう」を試します。
          </p>
          <section className="panel start-example">
            <p className="badge">最初のレシピ · 着手前の理解確認</p>
            <h2>「読んで」だけで、意図は伝わった？</h2>
            <p>
              参照した資料、変更する範囲、守る制約、未確認の点を説明してもらい、着手前に一度止めます。
            </p>
            <div className="example-result">
              <strong>返ってきてほしいもの</strong>
              <p>
                「タイムアウトの修正はAPI層に置く。ドメイン層へHTTP依存は持ち込まない。指定された正本が読めないので、参照先を確認したい。」
              </p>
              <span className="muted">架空のAPI修正を使った成果物例です。</span>
            </div>
            <p className="hint">
              説明が正しくても、実装が守られる保証にはなりません。結果を確かめる入口を作るレシピです。
            </p>
          </section>
          <div className="onboarding-actions">
            <span className="muted">AIへの送信は行いません</span>
            <button className="primary" onClick={() => advance(1)}>
              自分の依頼に合わせる →
            </button>
          </div>
        </>
      )}
      {step === 1 && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            指示書と正本の参照先を入れる。
          </h1>
          <p className="onboarding-lead">
            AIがアクセスできるファイル名や資料を指定します。会話だけのAIには、その資料の内容も一緒に渡してください。
          </p>
          <Composer
            standalone
            project={project}
            ids={[recipe.revision_id]}
            values={values}
            setValues={(v) => {
              setValues(v);
              setCopied(false);
            }}
            notice={notice}
            onCopied={() => setCopied(true)}
            materialEnabled={false}
          />
          <p className="hint">
            入力例：AGENTS.md と
            docs/ARCHITECTURE.md。実際にある参照先へ置き換えてください。コピー後は、いつものAIの依頼に添えて貼り付けます。
          </p>
          <div className="onboarding-actions">
            <button onClick={() => advance(0)}>戻る</button>
            <button className="primary" onClick={() => advance(2)}>
              {copied ? "次も使えるようにする →" : "保存の手順へ →"}
            </button>
          </div>
        </>
      )}
      {step === 2 && (
        <>
          <h1 ref={heading} tabIndex={-1}>
            次から、選んでコピーするだけに。
          </h1>
          <p className="onboarding-lead">
            このレシピと選んだ用途の候補を、名前付きセットとして保存できます。参照先や今回の素材は保存しません。Gitプロジェクトを開いた後、セットを割り当てられます。
          </p>
          <section className="panel">
            <label>
              セットの名前
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="saved-summary">
              <strong>{recipe.name}</strong>
              <p className="muted">
                {(values.reference ?? project.reference) ||
                  "参照先は未入力。利用時に入力します。"}
              </p>
              <span className="badge">この版を固定 · v{recipe.version}</span>
            </div>
          </section>
          <div className="next-learning">
            <strong>今回追加する候補</strong>
            <p>{recommended.map((r) => r.name).join(" / ") || recipe.name}</p>
            <strong>慣れてきたら</strong>
            <p>台帳に自分の指示を登録する → 名前と本文だけで使う。</p>
            <p>手直ししたら → 「改善の記録」に残して、自分用の新版を作る。</p>
            <p>素早く使う → 小窓から検索し、Tabで入力、⌘Enterでコピー。</p>
          </div>
          <div className="onboarding-actions">
            <button disabled={busy} onClick={() => advance(1)}>
              戻る
            </button>
            <div className="actions">
              <button disabled={busy} onClick={() => void complete(false)}>
                保存せずに始める
              </button>
              <button
                className="primary"
                disabled={busy || !name.trim()}
                onClick={() => void complete(true)}
              >
                {busy ? "保存中…" : "このセットで始める"}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
