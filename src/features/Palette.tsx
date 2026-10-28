import { shortcutLabel } from "../shortcut";
import { useShortcut } from "./ShortcutSettings";
import { ui } from "../i18n";
import { isMac } from "../platform";
import { useEffect, useRef, useState } from "react";
import { events, paletteAction } from "../api";
import type { Snapshot } from "../types";
import { discover, emptyFilter } from "../discovery";
import { RecipeFilters } from "./RecipeFilters";
import { Composer } from "./Composer";
type PaletteSession = { ids: string[]; values: Record<string, string> };
const previousSessions = new Map<string, PaletteSession>();
export function Palette({
  snapshot,
  notice,
  close,
}: {
  snapshot: Snapshot;
  notice: (s: string) => void;
  close: () => void;
}) {
  const {status: shortcut}=useShortcut();
  const project =
    snapshot.projects.find((p) => p.id === snapshot.active_project) ||
    snapshot.projects[0];
  const [focusToken, setFocusToken] = useState(0);
  const [filter, setFilter] = useState(emptyFilter);
  const query = filter.query;
  const [selected, setSelected] = useState(0);
  const [ids, setIds] = useState<string[]>([]);
  const [previousIds, setPreviousIds] = useState<string[]>(previousSessions.get(project.id)?.ids || []);
  const [closeAfterCopy, setCloseAfterCopy] = useState(() => localStorage.getItem("palette-close-after-copy") !== "false");
  const sessionProject = useRef(project.id);
  const currentIds = useRef<string[]>([]);
  const previousValues = useRef<Record<string,string>>(previousSessions.get(project.id)?.values || {});
  const currentValues = useRef<Record<string,string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const input = useRef<HTMLInputElement>(null);
  const filtered = discover(snapshot.recipes, filter);
  const browsing = !!(query || filter.action || filter.goal);
  useEffect(() => {
    if (sessionProject.current === project.id && ids.length) previousSessions.set(project.id, {ids, values});
  }, [project.id, ids, values]);
  currentIds.current = ids;
  currentValues.current = values;
  useEffect(() => {
    input.current?.focus();
    let cleanup: () => void = () => {};
    let disposed = false;
    void events("palette-open", () => {
      if(currentIds.current.length) { setPreviousIds(currentIds.current); previousValues.current=currentValues.current; }
      setIds([]); setValues({}); setFilter(emptyFilter); setSelected(0);
      input.current?.focus();
    }).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    setIds([]);
    setValues({});
    sessionProject.current=project.id;
    const previous=previousSessions.get(project.id);
    setPreviousIds(previous?.ids || []);
    previousValues.current=previous?.values || {};
  }, [project.id, project.version]);
  return (
    <div
      className="palette"
      role="dialog"
      aria-modal="true"
      aria-label={ui.paletteLabel}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
        if (e.key === "Tab") {
          const els = Array.from(
            e.currentTarget.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input,textarea,select",
            ),
          );
          const first = els[0],
            last = els.at(-1);
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
      <div className="section-title">
        <strong>Prompt Recipe</strong>
        <button
          className="text-button"
          onClick={async () => {
            try {
              await paletteAction("manage");
              close();
            } catch (e) {
              notice(e instanceof Error ? e.message : String(e));
            }
          }}
        >
          通常画面へ
        </button>
        <button aria-label="小窓を閉じる" onClick={close}>
          Esc
        </button>
      </div>
      <p className="muted">小窓を開くキー: <kbd>{shortcutLabel(shortcut.binding,isMac())}</kbd></p>
      <p className="muted">
        {snapshot.repositories[project.id] ? project.name : ui.noProject} · {ids.length}本選択中
      </p>
      <div className="palette-resume">
        <button className="text-button" disabled={!previousIds.length} onClick={() => {setIds(previousIds);setValues(previousValues.current);setFocusToken(v=>v+1);}}>前回の続き</button>
        <span className="muted">{previousIds.length ? "このプロジェクトで前回使った小窓の内容に戻ります。" : "このプロジェクトで小窓を使うと、前回の内容に戻れます。"}アプリを閉じると消えます。</span>
      </div>
      <input
        ref={input}
        type="search"
        aria-label="プロンプトを検索"
        placeholder="プロンプトを検索…"
        value={query}
        onChange={(e) => {
          setFilter({ ...filter, query: e.target.value });
          setSelected(0);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSelected((v) =>
              Math.max(0, Math.min(v + 1, filtered.length - 1)),
            );
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelected((v) => Math.max(0, v - 1));
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            document
              .querySelector<HTMLButtonElement>(".palette .footer button")
              ?.click();
            return;
          }
          if (e.key === "Enter" && !browsing) {
            e.preventDefault();
            document
              .querySelector<HTMLTextAreaElement>(".palette .fields textarea")
              ?.focus();
            return;
          }
          if (e.key === "Enter" && filtered[selected]) {
            e.preventDefault();
            setIds([filtered[selected].revision_id]);
            setFilter(emptyFilter);
            setValues({});
            setFocusToken((v) => v + 1);
          }
        }}
      />
      <p className="muted palette-keys">
        ↑↓で移動 / Enterで選択 / {isMac() ? "⌘" : "Ctrl"}+Enterでコピー / Escで閉じる
      </p>
      <RecipeFilters
        search={false}
        value={filter}
        onChange={(f) => {
          setFilter(f);
          setSelected(0);
        }}
      />
      <details className="selected-set">
        <summary>選択済み {ids.length}本 · 合成順</summary>
        <ol>
          {ids.map((id) => {
            const r = snapshot.revisions.find(
              (r) => r.recipe.revision_id === id,
            )?.recipe;
            return (
              <li key={id}>
                {r?.name || id} · v{r?.version}
              </li>
            );
          })}
        </ol>
      </details>
      {browsing && (
        <div className="palette-results">
          {filtered.map((r, i) => (
            <button
              key={r.id}
              className={i === selected ? "selected" : ""}
              onClick={() => {
                setIds([r.revision_id]);
                setFilter(emptyFilter);
                setValues({});
                setFocusToken((v) => v + 1);
              }}
            >
              {r.name}
            </button>
          ))}
          {!filtered.length && (
            <p className="muted">{ui.noPrompts}</p>
          )}
        </div>
      )}
      <label><input type="checkbox" checked={closeAfterCopy} onChange={e=>{setCloseAfterCopy(e.target.checked);localStorage.setItem("palette-close-after-copy",String(e.target.checked));}} />コピー後に小窓を閉じる</label>
      <Composer
        standalone
        project={project}
        ids={ids}
        values={values}
        setValues={setValues}
        notice={notice}
        onCopied={() => {setPreviousIds(ids);previousValues.current=values;if(closeAfterCopy)close();}}
        focusToken={focusToken}
      />
    </div>
  );
}
