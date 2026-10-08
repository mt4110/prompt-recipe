import { useState } from "react";
import { message, request } from "../api";
type Issue = { line: number; severity: string; message: string };
export function LintPanel({ text }: { text: string }) {
  const [format, setFormat] = useState("markdown");
  const [result, setResult] = useState<{
    text: string;
    format: string;
    issues: Issue[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fresh = result?.text === text && result.format === format;
  return (
    <details className="lint-panel">
      <summary>XML／Markdownを検査</summary>
      <div className="actions">
        <label>
          形式
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="markdown">Markdown（基本ルール）</option>
            <option value="xml">XML文書</option>
          </select>
        </label>
        <button
          disabled={busy}
          type="button"
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const issues = await request<Issue[]>("lint", { text, format });
              setResult({ text, format, issues });
            } catch (e) {
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "検査中…" : "Lintを実行"}
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {fresh && (
        <div role="status">
          {result.issues.length ? (
            result.issues.map((i, index) => (
              <p
                className={i.severity === "error" ? "error" : "hint"}
                key={index}
              >
                {i.line}行目：{i.message}
              </p>
            ))
          ) : (
            <p className="hint">
              この検査範囲では指摘なし。安全性やAIの遵守を保証するものではありません。
            </p>
          )}
        </div>
      )}
      {result && !fresh && (
        <p className="hint">
          本文または形式が変わりました。再検査してください。
        </p>
      )}
      <p className="muted">
        本文は変更しません。Markdownは見出し・行末空白・コードフェンスの基本検査です。XML断片は文書検査の対象外です。
      </p>
    </details>
  );
}
