import { useEffect, useRef, useState } from "react";
import { LintPanel } from "./LintPanel";
import { copy, message, readMaterial, request } from "../api";
import type { Composition, Project, Recipe } from "../types";

export function Composer({
  project,
  ids,
  values,
  setValues,
  notice,
  onCopied,
  revealToken = 0,
  materialEnabled = true,
  focusToken = 0,
  standalone = false,
}: {
  project: Project;
  ids: string[];
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  notice: (s: string) => void;
  onCopied?: () => void;
  revealToken?: number;
  materialEnabled?: boolean;
  focusToken?: number;
  standalone?: boolean;
}) {
  const [result, setResult] = useState<Composition | null>(null);
  const [pending, setPending] = useState(true);
  const [copying, setCopying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastReveal = useRef(0);
  const lastFocus = useRef(0);
  const [error, setError] = useState("");
  const lastContext = useRef("");
  useEffect(() => {
    let active = true;
    const context = JSON.stringify([project.id, project.version, ids]);
    const inputOnly = lastContext.current === context;
    lastContext.current = context;
    setPending(true);
    setError("");
    if (!ids.length) {
      setResult(null);
      setPending(false);
      return;
    }
    // Selection is immediate; consecutive text edits share one trailing IPC request.
    const timer = setTimeout(
      () => {
        request<Composition>("compose", {
          project_id: project.id,
          standalone,
          revision_ids: ids,
          values,
        })
          .then((r) => {
            if (active) {
              setResult(r);
              setPending(false);
            }
          })
          .catch((e) => {
            if (active) {
              setError(message(e));
              setPending(false);
            }
          });
      },
      inputOnly ? 120 : 0,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [project.id, project.version, ids, values, standalone]);
  useEffect(() => {
    if (pending || revealToken === lastReveal.current) return;
    lastReveal.current = revealToken;
    const bounds = heading.current?.getBoundingClientRect();
    if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight))
      heading.current?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [pending, revealToken]);
  useEffect(() => {
    if (
      pending ||
      !result ||
      focusToken === lastFocus.current ||
      result.revision_ids.join(",") !== ids.join(",")
    )
      return;
    lastFocus.current = focusToken;
    const root = heading.current?.closest("section");
    const target = root?.querySelector<HTMLElement>(
      ".fields textarea, .footer button",
    );
    target?.focus();
  }, [pending, result, focusToken, ids]);
  async function doCopy() {
    if (!result || copying || pending || result.blocked || !ids.length) return;
    setCopying(true);
    try {
      const warning = await copy(result, project.id, values, standalone);
      notice(warning || "コピーしました");
      onCopied?.();
    } catch (e) {
      notice(message(e));
    } finally {
      setCopying(false);
    }
  }
  return (
    <section
      className="panel preview"
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          (e.metaKey || e.ctrlKey) &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          void doCopy();
        }
      }}
    >
      <div className="section-title">
        <h2 ref={heading}>依頼のプレビュー</h2>
        <span className="muted">{ids.length}本を合成</span>
      </div>
      {!!result?.variables.length && (
        <div className="fields">
          {result.variables.map((v) => (
            <label key={v.name}>
              {v.name === "reference"
                ? "指示書・正本の参照先"
                : v.name === "clipboard"
                  ? "今回の素材"
                  : v.name}
              {v.required ? " *" : ""}
              <textarea
                rows={2}
                placeholder={
                  v.default ||
                  (v.name === "reference"
                    ? "AIが読める資料の参照先"
                    : "この依頼の入力")
                }
                value={
                  values[v.name] ??
                  (v.name === "reference" ? project.reference : v.default) ??
                  ""
                }
                onChange={(e) =>
                  setValues({ ...values, [v.name]: e.target.value })
                }
              />
            </label>
          ))}
        </div>
      )}
      {materialEnabled &&
        result?.variables.some((v) => v.name === "clipboard") && (
          <button
            className="text-button"
            onClick={async () => {
              try {
                const material = await readMaterial();
                if (material.is_previous_output) {
                  notice(
                    "直前の出力です。素材として使う場合は入力欄へ貼り付けてください。",
                  );
                  return;
                }
                setValues({ ...values, clipboard: material.text });
                notice("素材を読み取りました。clipboard変数で使用します。");
              } catch (e) {
                notice(message(e));
              }
            }}
          >
            クリップボードを素材として読む
          </button>
        )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {result?.diagnostics.map((d, i) => (
        <p key={i} className={d.kind === "unchecked" ? "hint" : "error"}>
          {d.message}
        </p>
      ))}
      <pre aria-busy={pending}>
        {result?.body || "レシピを選ぶと、ここに最終的な依頼が表示されます。"}
      </pre>
      {result && <LintPanel text={result.body} />}
      <div className="footer">
        <span className="muted">コピー時に本文・入力値を記録しません</span>
        <button
          className="primary"
          disabled={
            !result || pending || copying || result.blocked || !ids.length
          }
          onClick={() => void doCopy()}
        >
          {copying ? "コピー中…" : "コピー"} <kbd>⌘↵</kbd>
        </button>
      </div>
    </section>
  );
}
export function LessonView({ recipe }: { recipe: Recipe }) {
  const lesson = recipe.lesson;
  return (
    <section className="panel lesson">
      <div className="section-title">
        <h2>{recipe.name}</h2>
        <span className="badge">v{recipe.version}</span>
      </div>
      <p className="muted">{recipe.description}</p>
      {lesson && (
        <>
          <p className="badge">
            {lesson.level} · {lesson.area}
          </p>
          {(
            ["purpose", "example", "why", "verify", "limitations"] as const
          ).map((k, i) => (
            <div key={k}>
              <h3>
                {
                  [
                    "目的",
                    "具体例と成果物",
                    "なぜこの指示か",
                    "結果を確かめる",
                    "限界",
                  ][i]
                }
              </h3>
              <p>{lesson[k]}</p>
            </div>
          ))}
          <p className="hint">
            {lesson.evidence}
            <br />
            確認日：{lesson.reviewed_at}
          </p>
        </>
      )}
      <details>
        <summary>レシピ本文・構造化制約</summary>
        <pre>{recipe.body}</pre>
        <p className="muted">
          {recipe.constraints.map((c) => `${c.key}: ${c.value}`).join(" / ") ||
            "構造化制約なし。自由文の意味の衝突は未検査。"}
        </p>
      </details>
    </section>
  );
}
