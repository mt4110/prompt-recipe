import { ui } from "./i18n";
import { isMac } from "./platform";
import { matchesShortcut, shortcutLabel } from "./shortcut";
import { ShortcutProvider, ShortcutSettings, useShortcut } from "./features/ShortcutSettings";
import { Activity, useCallback, useEffect, useState } from "react";
import { BookOpen, Folder, MessageSquare, Search } from "lucide-react";
import { desktop, events, message, paletteAction, request } from "./api";
import appIcon from "./assets/app-icon-v1.png";
import type { Snapshot } from "./types";
import { Projects } from "./features/Projects";
import { Library } from "./features/Library";
import { FeedbackView } from "./features/Feedback";
import { Palette } from "./features/Palette";
import { AiComparison } from "./features/AiComparison";
import { Onboarding } from "./features/Onboarding";
import { Overlay } from "./features/Overlay";
const isPalette =
  new URLSearchParams(location.search).get("window") === "palette";
export default function App() {return <ShortcutProvider><AppContent /></ShortcutProvider>;}
function AppContent() {
  const {status: shortcut, busy: shortcutBusy}=useShortcut();
  const [showSettings,setShowSettings]=useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiDeferred, setAiDeferred] = useState(false);
  const [guide, setGuide] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("library");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [palette, setPalette] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setSnapshot(await request<Snapshot>("snapshot"));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }, []);
  useEffect(() => {
    void refresh();
    let cleanup: () => void = () => {};
    let disposed = false;
    void events("workspace-changed", () => {
      void refresh();
    }).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        !desktop && !shortcutBusy && matchesShortcut(e, shortcut.binding)
      ) {
        e.preventDefault();
        setPalette((v) => !v);
      }
      if (e.defaultPrevented || e.isComposing || e.repeat ||
          e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return;
      // React's local handlers run first. This fallback also covers row/search
      // focus, while visible dialogs own copy and hidden pages never do.
      const modal = Array.from(document.querySelectorAll<HTMLElement>(
        '.modal-backdrop, [aria-modal="true"]',
      )).filter(element => element.getClientRects().length).at(-1);
      const previews = Array.from(document.querySelectorAll<HTMLElement>(".panel.preview"))
        .filter(panel => panel.getClientRects().length && !panel.closest("[inert]") &&
          (!modal || modal.contains(panel)));
      if (previews.length !== 1) return;
      const button = previews[0].querySelector<HTMLButtonElement>(".footer button.primary");
      if (!button || button.disabled) return;
      e.preventDefault();
      button.click();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcut.binding, shortcutBusy]);
  if (!snapshot)
    return (
      <main className="loading">
        <h1>Prompt Recipe</h1>
        <p role="status">{error || ui.loadingPrompts}</p>
        {error && <button onClick={() => void refresh()}>再試行</button>}
      </main>
    );
  const close = () => {
    if (desktop)
      void paletteAction("close").catch((e) => setNotice(message(e)));
    else setPalette(false);
  };
  if (isPalette)
    return (
      <>
        <Palette snapshot={snapshot} notice={setNotice} close={close} />
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </>
    );
  const comparing = showAi;
  const comparison = comparing && (
    <AiComparison
      snapshot={snapshot}
      refresh={refresh}
      notice={setNotice}
      close={() => {
        setShowAi(false);
        setAiDeferred(true);
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, behavior: "instant" });
          document.querySelector<HTMLButtonElement>(".ai-open")?.focus();
        });
      }}
    />
  );
  return (
    <>
      <div className="app" inert={comparing || showSettings || !snapshot.onboarded || guide}>
        <header>
          <div className="brand">
            <img
              className="app-icon"
              src={appIcon}
              alt=""
              width={32}
              height={32}
            />
            <strong>Prompt Recipe</strong>
            <span className="badge">初期実装</span>
          </div>
          <div className="actions">
            <button onClick={()=>setShowSettings(true)}>設定</button>
            <button className="ai-open" onClick={() => setShowAi(true)}>
              AIを比較・選択
            </button>
            <button
              onClick={() => {
                if (desktop)
                  void paletteAction("open").catch((e) =>
                    setNotice(message(e)),
                  );
                else setPalette(true);
              }}
            >
              <Search size={15} />
              小窓を開く <kbd>{shortcutLabel(shortcut.binding,isMac())}</kbd>
            </button>
          </div>
        </header>
        <div className="shell">
          <aside>
            <nav>
              {[
                ["library", "プロンプト台帳", BookOpen],
                ["projects", "プロジェクト", Folder],
                ["feedback", "改善の記録", MessageSquare],
              ].map(([id, label, Icon]) => {
                const Symbol = Icon as typeof Folder;
                return (
                  <button
                    key={String(id)}
                    className={page === id ? "active" : ""}
                    onClick={() => setPage(String(id))}
                  >
                    <Symbol size={17} />
                    {String(label)}
                  </button>
                );
              })}
            </nav>
            <div className="sidebar-note">
              <button className="text-button" onClick={() => setGuide(true)}>
                使い方を開く
              </button>
              <br />
              <strong>ローカル保存</strong>
              <p>
                {desktop
                  ? (shortcut.error || (shortcut.registered ? `小窓のキー ${shortcutLabel(shortcut.binding,isMac())} 登録済み` : "小窓のキーは未登録です。設定を確認してください。"))
                  : "ブラウザで操作確認中。Rustコアと開発用DBを使用。"}
              </p>
              <details><summary>このアプリについて</summary><p>検査はアプリを通した文章のパターン検出です。未知の形式や言い換えは見逃し、誤検知もあります。自由文の意味検査やDLPの代わりにはなりません。本文と保存済みプロンプトは平文です。無視設定には値ではなくハッシュを保存します。</p></details>
            </div>
          </aside>
          <main>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <Activity mode={page === "projects" ? "visible" : "hidden"}>
              {
                <Projects
                  key={`${snapshot.active_project}:${snapshot.projects.find((p) => p.id === snapshot.active_project)?.version}`}
                  snapshot={snapshot}
                  refresh={refresh}
                  notice={setNotice}
                />
              }
            </Activity>
            <Activity mode={page === "library" ? "visible" : "hidden"}>
              {
                <Library
                  snapshot={snapshot}
                  refresh={refresh}
                  notice={setNotice}
                />
              }
            </Activity>
            <Activity mode={page === "feedback" ? "visible" : "hidden"}>
              {
                <FeedbackView
                  snapshot={snapshot}
                  refresh={refresh}
                  notice={setNotice}
                />
              }
            </Activity>
          </main>
        </div>
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
        {palette && !comparing && (
          <div className="modal-backdrop">
            <Palette
              snapshot={snapshot}
              notice={setNotice}
              close={() => setPalette(false)}
            />
          </div>
        )}
      </div>
      {showSettings && <Overlay label="設定"><div className="panel"><div className="section-title"><h1>設定</h1><button onClick={()=>setShowSettings(false)}>設定を閉じる</button></div><ShortcutSettings /></div></Overlay>}
      {comparison && <Overlay label="AIを比較・選択">{comparison}</Overlay>}
      {(!snapshot.onboarded || guide) && <Overlay label="初回案内"><Onboarding snapshot={snapshot} refresh={refresh} notice={setNotice} finish={()=>setGuide(false)} compare={()=>setShowAi(true)} /></Overlay>}
    </>
  );
}
