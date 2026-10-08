import { useEffect, useRef, useState } from "react";
import { message, request } from "../api";
import type { AiTarget, Snapshot } from "../types";

export function AiComparison({
  snapshot,
  refresh,
  notice,
  close,
}: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
  close: () => void;
}) {
  const catalog = snapshot.ai_catalog;
  const project =
    snapshot.projects.find((p) => p.id === snapshot.active_project) ||
    snapshot.projects[0];
  const [target, setTarget] = useState<AiTarget>(
    snapshot.ai_target || {
      profile_id: "openai",
      surface: project.environment === "chat" ? "chat" : "agent",
      task: "implementation",
      format: "markdown",
      catalog_version: catalog.version,
    },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const detail = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    heading.current?.focus({ preventScroll: true });
  }, []);
  const profile =
    catalog.profiles.find((p) => p.id === target.profile_id) ||
    catalog.profiles[0];
  const task =
    catalog.tasks.find((t) => t.id === target.task) || catalog.tasks[0];
  const stale = new Date().toISOString().slice(0, 10) >= catalog.review_due;
  function select(id: string) {
    const p = catalog.profiles.find((p) => p.id === id);
    if (!p) return;
    setTarget((t) => ({
      ...t,
      profile_id: id,
      format: p.format,
      catalog_version: catalog.version,
    }));
    requestAnimationFrame(() => {
      const r = detail.current?.getBoundingClientRect();
      if (r && (r.top < 0 || r.bottom > innerHeight))
        detail.current?.scrollIntoView({
          block: "start",
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
    });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await request("save_ai_target", {
        project_id: project.id,
        expected_version: project.version,
        target: { ...target, catalog_version: catalog.version },
      });
      await refresh();
      close();
      notice(
        "渡すAI・環境・用途を保存しました。AIへの接続やモデルの切り替えは行っていません。",
      );
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="ai-comparison">
      <div className="onboarding-top">
        <span className="brand">
          Prompt Recipe <span className="badge">AIガイド</span>
        </span>
        <button disabled={busy} onClick={close}>
          {snapshot.ai_target ? "作業に戻る" : "あとで選ぶ"}
        </button>
      </div>
      <div className="ai-intro">
        <p className="eyebrow">使い方の、その一歩前に</p>
        <h1 ref={heading} tabIndex={-1}>
          どのAIに、何を任せる？
        </h1>
        <p className="onboarding-lead">
          モデルの能力と、作業できる環境をセットで見る。自分の依頼に合う入口を選びます。
        </p>
        <div className="ai-meta">
          <span className="badge">公式情報の確認：{catalog.checked_at}</span>
          <span>比較資料 v{catalog.version}</span>
          <span>
            {stale ? "再確認が必要" : `次の確認目安：${catalog.review_due}`}
          </span>
        </div>
        <p className="hint">
          個人向け上位プランを基準にした案内です。常時最新の表示ではありません。利用枠・地域・管理者設定は契約画面で確認してください。
        </p>
      </div>
      <div
        className="ai-table-scroll"
        tabIndex={0}
        aria-label="AIの比較表。横にスクロールできます"
      >
        <table className="ai-table">
          <caption>
            4つの入口を比較 · 公式仕様と使い方の提案を分けています
          </caption>
          <thead>
            <tr>
              <th scope="col">AI / 開発環境</th>
              <th scope="col">公式で確認したこと</th>
              <th scope="col">
                任せる候補 <span className="muted">提案・未実測</span>
              </th>
              <th scope="col">苦手と決める前に</th>
            </tr>
          </thead>
          <tbody>
            {catalog.profiles.map((p) => (
              <tr
                key={p.id}
                className={p.id === target.profile_id ? "selected" : ""}
              >
                <th scope="row">
                  <button
                    aria-pressed={p.id === target.profile_id}
                    onClick={() => select(p.id)}
                  >
                    {p.name}
                    <span>
                      {p.id === target.profile_id ? "選択中" : "このAIを見る →"}
                    </span>
                  </button>
                  <p className="muted">{p.plan}</p>
                </th>
                <td>
                  <strong>{p.models}</strong>
                  <p>{p.facts}</p>
                </td>
                <td>{p.strength}</td>
                <td>{p.caution}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section
        ref={detail}
        className="panel ai-selection"
        aria-labelledby="ai-selection-heading"
      >
        <div className="page-heading">
          <div>
            <p className="eyebrow">{project.name} に割り当てる</p>
            <h2 id="ai-selection-heading">{profile.name} の使い方を選ぶ</h2>
          </div>
          <span className="badge">選択内容を下に表示</span>
        </div>
        <fieldset>
          <legend>どこへ渡しますか？</legend>
          <div className="ai-surfaces">
            {(["chat", "agent"] as const).map((surface) => (
              <label
                key={surface}
                className={target.surface === surface ? "chosen" : ""}
              >
                <input
                  type="radio"
                  name="ai-surface"
                  checked={target.surface === surface}
                  onChange={() => setTarget((t) => ({ ...t, surface }))}
                />
                <span>
                  <strong>{profile[surface]}</strong>
                  <small>
                    {surface === "chat"
                      ? "資料を添えて、分析・計画から"
                      : "権限を確認して、変更・検証へ"}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="ai-options">
          <label>
            最初に取り組むこと
            <select
              value={target.task}
              onChange={(e) =>
                setTarget((t) => ({ ...t, task: e.target.value }))
              }
            >
              {catalog.tasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            指示の形式
            <select
              value={target.format}
              onChange={(e) =>
                setTarget((t) => ({
                  ...t,
                  format: e.target.value as AiTarget["format"],
                }))
              }
            >
              <option value="markdown">Markdown（標準）</option>
              <option value="xml">XML（内容の境界を明示）</option>
            </select>
          </label>
        </div>
        <div className="ai-guidance" aria-live="polite">
          <strong>{task.name} なら、ここから</strong>
          <p>{task.guidance}</p>
          <p>
            {target.surface === "chat"
              ? "資料の添付と、理解の確認から始めます。実行やサブエージェントを使えると推測しません。"
              : "資料を実際に読めるか、テストを実行できるかを確認します。使えるツールは実環境に依存します。"}
          </p>
          <div className="actions">
            {task.recipe_ids.map((id) => {
              const r = snapshot.recipes.find((r) => r.id === id);
              return (
                r && (
                  <span className="badge" key={id}>
                    {r.name}
                  </span>
                )
              );
            })}
          </div>
        </div>
        <p className="hint">
          {target.format === "xml"
            ? "ClaudeではXMLによる区分が公式に推奨されています。タグで遵守を保証したり、トークンが減ると保証したりはしません。"
            : "短い見出しで環境・目的・レシピを区分します。必要な指示だけを渡します。"}{" "}
          保存すると、このプロジェクトの利用環境と出力形式へ反映します。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="onboarding-actions">
          <span className="muted">APIキー・ログインは不要</span>
          <button
            disabled={busy}
            className="primary"
            onClick={() => void save()}
          >
            {busy
              ? "保存中…"
              : snapshot.onboarded
                ? "この選択をプロジェクトに保存"
                : "このAIでレシピを試す →"}
          </button>
        </div>
        <details className="ai-sources">
          <summary>{profile.name} の公式出典を見る</summary>
          {profile.sources.map((id) => {
            const s = catalog.sources.find((s) => s.id === id);
            return (
              s && (
                <p key={id}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.title} ↗
                  </a>
                  <br />
                  <small>{s.url}</small>
                </p>
              )
            );
          })}
          <p className="hint">
            リンクは外部サイトです。アプリは自動でアクセスしません。
          </p>
        </details>
      </section>
      <details className="panel ai-evidence">
        <summary>なぜ「得意・不得意」を断定しない？</summary>
        <p>
          同じ依頼でも、モデルの版、資料へのアクセス、ツール、推論設定、停止条件で結果が変わります。ベンダーの用途説明は、4社を同条件で試した順位ではありません。
        </p>
        <p>
          Claudeの並列作業で困った経験は改善の出発点です。読んだ資料の参照先と変更範囲を先に説明させ、小さな変更を対象テストで確かめます。低レイヤー・本番インフラの判断と最終承認は人が担います。
        </p>
        <p>
          この資料は {catalog.status}
          。節約率・電力削減・安全性の保証を掲載しません。
        </p>
      </details>
    </main>
  );
}
