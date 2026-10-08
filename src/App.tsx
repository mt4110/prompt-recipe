import { Activity, useCallback, useEffect, useState } from "react";
import { BookOpen, Folder, MessageSquare, Search } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { desktop, events, message, paletteAction, request } from "./api";
import appIcon from "./assets/app-icon-v1.png";
import type { Snapshot } from "./types";
import { Projects } from "./features/Projects";
import { Library } from "./features/Library";
import { FeedbackView } from "./features/Feedback";
import { Palette } from "./features/Palette";
import { AiComparison } from "./features/AiComparison";
import { Onboarding } from "./features/Onboarding";
const isPalette =
  new URLSearchParams(location.search).get("window") === "palette";
export default function App() {
  const [showAi, setShowAi] = useState(false);
  const [aiDeferred, setAiDeferred] = useState(false);
  const [guide, setGuide] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [page, setPage] = useState("library");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [palette, setPalette] = useState(false);
  const [shortcut, setShortcut] = useState("");
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
    if (desktop)
      void invoke<string>("shortcut_status")
        .then(setShortcut)
        .catch((e) => setShortcut(message(e)));
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
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.code === "Space" &&
        !desktop
      ) {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (!snapshot)
    return (
      <main className="loading">
        <h1>Prompt Recipe</h1>
        <p role="status">{error || "レシピを読み込んでいます…"}</p>
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
  if (!snapshot.onboarded || guide)
    return (
      <>
        <div hidden={comparing}>
          <Onboarding
            snapshot={snapshot}
            refresh={refresh}
            notice={setNotice}
            finish={() => setGuide(false)}
            compare={() => setShowAi(true)}
          />
        </div>
        {comparison}
        {notice && (
          <div className="toast" role="status">
            {notice}
          </div>
        )}
      </>
    );
  return (
    <>
      <div className="app" hidden={comparing}>
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
              小窓を開く <kbd>⌘⇧Space</kbd>
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
                  ? shortcut
                  : "ブラウザで操作確認中。Rustコアと開発用DBを使用。"}
              </p>
              <span>教材の効果は未検証</span>
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
      {comparison}
    </>
  );
}
