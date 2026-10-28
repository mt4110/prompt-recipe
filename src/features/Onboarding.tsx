import { useState } from "react";
import { message, request } from "../api";
import type { Recipe, Snapshot } from "../types";
import { Composer } from "./Composer";

type DraftPrompt = { name: string; body: string };
export function Onboarding({ snapshot, refresh, notice, finish }: {
  snapshot: Snapshot;
  refresh: () => Promise<void>;
  notice: (s: string) => void;
  finish: () => void;
  compare: () => void;
}) {
  const sample = snapshot.recipes.find(r => r.builtin);
  const [name, setName] = useState("最初のプロンプト");
  const [body, setBody] = useState("次の文章を読み、要点を3つにまとめてください。\n\n{{text}}");
  const [draft, setDraft] = useState<DraftPrompt | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const existing = snapshot.recipes.find(r => !r.builtin && r.name === name && r.body === body);
  const registered = recipe && !recipe.builtin && recipe.name === name && recipe.body === body ? recipe : existing;

  async function complete() {
    try { await request("complete_onboarding"); await refresh(); finish(); }
    catch (e) { notice(message(e)); }
  }
  async function register() {
    if (registered || busy) return;
    setBusy(true);
    try {
      const saved = await request<Recipe>("save_recipe", {
        recipe_id: null, expected_revision: null, name, body, description: "",
        reason: "初回案内から明示登録", constraints: [], actions: [], goals: [],
      });
      setRecipe(saved);
      await refresh();
      notice("台帳に1本登録しました。");
    } catch (e) { notice(message(e)); }
    finally { setBusy(false); }
  }
  return <main className="onboarding">
    <div className="section-title"><h1>書く → 埋める → コピー</h1><button onClick={() => void complete()}>あとで試す</button></div>
    <ol className="steps">{["書く", "埋める", "コピー"].map((s, i) => <li key={s} aria-current={step === i ? "step" : undefined}>{s}</li>)}</ol>
    {step === 0 && <form onSubmit={e => { e.preventDefault(); setDraft({ name, body }); setRecipe(null); setStep(1); }}>
      <p>ここでは保存せずに試せます。台帳への登録は、コピーを試した後に選びます。</p>
      <label>名前<input autoFocus required value={name} onChange={e => setName(e.target.value)} /></label>
      <label>本文<textarea required rows={5} value={body} onChange={e => setBody(e.target.value)} /></label>
      <div className="actions"><button>保存せず入力へ</button>{sample && <button type="button" onClick={() => { setDraft(null); setRecipe(sample); setStep(1); }}>サンプルから始める</button>}</div>
    </form>}
    {step === 1 && (draft || recipe) && <>
      <p>入力欄を埋め、プレビューを確認してコピーしてください。下書きと入力値は台帳に保存しません。</p>
      <Composer standalone draft={draft || undefined} project={snapshot.projects[0]} ids={[draft ? "onboarding-draft" : recipe!.revision_id]} values={values} setValues={setValues} notice={notice} onCopied={() => setStep(2)} materialEnabled={false} />
      <button onClick={() => { setStep(0); setValues({}); }}>本文へ戻る</button>
    </>}
    {step === 2 && <>
      <h2>コピーできました</h2>
      <p>いつものAIへ貼り付けて使えます。下書きは、登録を選ばなければ台帳に増えません。</p>
      {draft && <div className="panel"><p>名前「{name}」の本文を台帳に1本登録します。入力値は登録しません。</p><button disabled={busy || !!registered} onClick={() => void register()}>{registered ? "台帳に登録済み" : busy ? "登録中…" : "この本文を台帳に登録する"}</button></div>}
      <p>検査はこのアプリを通した文字列のパターン確認です。見逃し・誤検知があり、意味検査やDLPの代わりにはなりません。</p>
      <button className="primary" onClick={() => void complete()}>案内を閉じる</button>
    </>}
  </main>;
}
