import { isMac } from "../platform";
import { useEffect, useRef, useState } from "react";
import { advisoryRuleLabel, ui } from "../i18n";
import { copySuccess, copyFailure } from "../copyMessages";
import { LintPanel } from "./LintPanel";
import { AdvisoryCheckError, copy, message, readMaterial, request } from "../api";
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
  draft,
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
  draft?: { name: string; body: string };
}) {
  const [includeContext, setIncludeContext] = useState(() => localStorage.getItem(`context:${project.id}`) === "true");
  const [aiFormat, setAiFormat] = useState(false);
  const [ignored, setIgnored] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("advisory-ignores") || "[]"); } catch { return []; } });
  const scope = ids.join(":");
  const [result, setResult] = useState<Composition | null>(null);
  const [pending, setPending] = useState(true);
  const [copying, setCopying] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const lastReveal = useRef(0);
  const lastFocus = useRef(0);
  const [error, setError] = useState("");
  const lastContext = useRef("");
  const inputKey=JSON.stringify([project.id,project.version,ids,values,standalone,includeContext,aiFormat,draft]);
  const resolvedKey=useRef("");
  useEffect(() => {
    let active = true;
    const context = JSON.stringify([project.id, project.version, ids, standalone, includeContext, aiFormat, draft]);
    const inputOnly = lastContext.current === context;
    lastContext.current = context;
    if (!inputOnly) setResult(null);
    setPending(true);
    setError("");
    if (!ids.length) {
      resolvedKey.current = inputKey;
      setResult(null);
      setPending(false);
      return;
    }
    // Selection is immediate; consecutive text edits share one trailing IPC request.
    const timer = setTimeout(
      () => {
        request<Composition>(draft ? "compose_draft" : "compose", draft ? {draft, values} : {
          project_id: project.id,
          standalone,
          include_context: includeContext,
          ai_format: aiFormat,
          revision_ids: ids,
          values,
        })
          .then((r) => {
            if (active) {
              resolvedKey.current=inputKey;
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
  }, [project.id, project.version, ids, values, standalone, includeContext, aiFormat, draft]);
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
  const [inspection, setInspection] = useState<{body:string; masked:string; findings:{rule:string;start:number;end:number;fingerprint:string;fingerprints:string[]}[]} | null>(null);
  const [inspectionFailure, setInspectionFailure] = useState<{body:string;message:string} | null>(null);
  const inspectionFailed = !!result && inspectionFailure?.body === result.body;
  const activeFindings = inspection?.findings || [];
  useEffect(() => {
    let active=true; setInspection(null); setInspectionFailure(null);
    if (!result) return;
    const body=result.body;
    const timer=setTimeout(() => { void request<{masked:string;findings:{rule:string;start:number;end:number;fingerprint:string;fingerprints:string[]}[]}>("check_text",{text:body,ignored:ignored.filter(v=>v.startsWith(`${scope}:`)).map(v=>v.slice(scope.length+1))}).then((r)=>{if(active)setInspection({...r,body});}).catch((e)=>{if(active){setInspection(null);setInspectionFailure({body,message:message(e)});}}); },120);
    return ()=>{active=false;clearTimeout(timer);};
  },[result,ignored,scope]);
  async function doCopy(maskSensitive = true) {
    if (!result || copying || pending || result.blocked || !ids.length || resolvedKey.current!==inputKey || (inspection?.body!==result.body && !inspectionFailed)) return;
    setCopying(true);
    try {
      const copied = await copy(result, project.id, values, standalone, maskSensitive && !inspectionFailed, ignored.filter((v) => v.startsWith(`${scope}:`)).map((v) => v.slice(scope.length + 1)), includeContext, aiFormat, draft);
      notice(copySuccess(copied.characters, copied.warning));
      onCopied?.();
    } catch (e) {
      if (e instanceof AdvisoryCheckError) {
        setInspectionFailure({body: result.body, message: message(e)});
        notice("秘密情報の検査に失敗しました。未検査でそのままコピーを選べます。");
      } else {
        notice(copyFailure(message(e)));
      }
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
      {!draft && <details><summary>コピーの設定</summary><label><input type="checkbox" checked={includeContext} onChange={(e)=>{setIncludeContext(e.target.checked);localStorage.setItem(`context:${project.id}`,String(e.target.checked));}} />コピーに文脈ヘッダーを含める</label>{!standalone && <label><input type="checkbox" checked={aiFormat} onChange={(e)=>setAiFormat(e.target.checked)} />プロジェクトで選んだAI向けに整形する（既定：整形なし）</label>}</details>}
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
      {result?.diagnostics.filter((d) => d.kind !== "unchecked").map((d, i) => (
        <p key={i} className={d.kind === "unchecked" ? "hint" : "error"}>
          {d.message}
        </p>
      ))}
      <pre aria-busy={pending}>
        {pending || resolvedKey.current !== inputKey ? "プレビューを更新しています…" : result && inspection?.body === result.body ? (() => { const bytes=new TextEncoder().encode(result.body); const decoder=new TextDecoder(); let cursor=0; const parts: React.ReactNode[]=[]; for(const f of activeFindings) { parts.push(decoder.decode(bytes.slice(cursor,f.start))); parts.push(<mark key={f.start} title={advisoryRuleLabel(f.rule)}>{decoder.decode(bytes.slice(f.start,f.end))}</mark>); cursor=f.end; } parts.push(decoder.decode(bytes.slice(cursor))); return parts; })() : result?.body || "プロンプトを選ぶと、ここに最終的な依頼が表示されます。"}
      </pre>
      {inspectionFailed && <p role="status" className="hint">秘密情報の検査を完了できませんでした。未検査の本文をそのままコピーできます。{inspectionFailure?.message}</p>}
      {!!activeFindings.length && <section className="advisory-review" aria-label="コピー前の検出確認">
        <h3>コピー前の確認</h3>
      {!!activeFindings.length && <p role="status">秘密情報・個人情報らしき文字列 {activeFindings.length}件。コピー前に確認してください。</p>}
      {!!activeFindings.length && <ul className="advisory-findings" aria-label="検出候補ごとの操作">{activeFindings.map((f, index) => <li key={f.fingerprint}><span>{advisoryRuleLabel(f.rule)} {index + 1}</span><button className="text-button" aria-label={`${advisoryRuleLabel(f.rule)} ${index + 1}をこのプロンプトでは無視`} onClick={() => { const next=[...ignored,`${scope}:${f.fingerprint}`].slice(-512); localStorage.setItem("advisory-ignores",JSON.stringify(next)); setIgnored(next); }}>このプロンプトでは無視</button></li>)}</ul>}
      </section>}
      <div className="footer">
        <span className="muted">コピー時に本文・入力値を記録しません</span>
        <button
          className="primary"
          disabled={
            !result || pending || copying || result.blocked || !ids.length || resolvedKey.current !== inputKey || (inspection?.body !== result.body && !inspectionFailed)
          }
          onClick={() => void doCopy()}
        >
          {copying ? "コピー中…" : inspectionFailed ? "未検査でそのままコピー" : activeFindings.length ? "マスクしてコピー" : "コピー"} <kbd>{isMac() ? "⌘Enter" : "Ctrl+Enter"}</kbd>
        </button>
        {!!activeFindings.length && <button disabled={pending || copying || !result || result.blocked} onClick={() => void doCopy(false)}>そのままコピー</button>}
      </div>
      {result && <details><summary>詳細・Lint</summary><LintPanel text={result.body} /><p>自由文の意味検査は行いません。</p></details>}
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
        <summary>{ui.promptBodyConstraints}</summary>
        <pre>{recipe.body}</pre>
        <p className="muted">
          {recipe.constraints.map((c) => `${c.key}: ${c.value}`).join(" / ") ||
            "構造化制約なし。自由文の意味の衝突は未検査。"}
        </p>
      </details>
    </section>
  );
}
