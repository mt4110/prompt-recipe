import { useState } from "react";
import { message, request } from "../api";
import type { Recipe, Snapshot } from "../types";
import { Composer } from "./Composer";
export function Onboarding({snapshot,refresh,notice,finish}: {snapshot:Snapshot;refresh:()=>Promise<void>;notice:(s:string)=>void;finish:()=>void;compare:()=>void}) {
  const sample=snapshot.recipes.find(r=>r.builtin) || snapshot.recipes[0];
  const [name,setName]=useState("最初のプロンプト");
  const [body,setBody]=useState("次の文章を読み、要点を3つにまとめてください。\n\n{{text}}");
  const [recipe,setRecipe]=useState<Recipe|null>(null);
  const [step,setStep]=useState(0);
  const [values,setValues]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  async function complete() { try { await request("complete_onboarding"); await refresh(); finish(); } catch(e) {notice(message(e));} }
  return <main className="onboarding"><div className="section-title"><h1>登録 → 埋める → コピー</h1><button onClick={()=>void complete()}>あとで試す</button></div>
    <ol className="steps">{["登録","埋める","コピー"].map((s,i)=><li key={s} aria-current={step===i?"step":undefined}>{s}</li>)}</ol>
    {step===0 && <form onSubmit={async e=>{e.preventDefault();setBusy(true);try {const r=await request<Recipe>("save_recipe",{recipe_id:null,expected_revision:null,name,description:"",body,reason:"初回登録",constraints:[],actions:[],goals:[]});setRecipe(r);await refresh();setStep(1);}catch(e){notice(message(e));}finally{setBusy(false);}}}><p>名前と本文で、いつもの指示を登録できます。変数は {'{{text}}'} のように書きます。</p><label>名前<input autoFocus required value={name} onChange={e=>setName(e.target.value)} /></label><label>本文<textarea required rows={5} value={body} onChange={e=>setBody(e.target.value)} /></label><div className="actions"><button disabled={busy}>保存して入力へ</button>{sample && <button type="button" onClick={()=>{setRecipe(sample);setStep(1);}}>サンプルから始める</button>}</div></form>}
    {step===1 && recipe && <><p>入力欄を埋め、プレビューを確認してコピーしてください。</p><Composer standalone project={snapshot.projects[0]} ids={[recipe.revision_id]} values={values} setValues={v=>{setValues(v);setCopied(false);}} notice={notice} onCopied={()=>{setCopied(true);setStep(2);}} materialEnabled={false}/></>}
    {step===2 && copied && <><h2>コピーできました</h2><p>いつものAIへ貼り付けて使えます。セット・プロジェクト・改善の記録は必要になったら使えます。</p><p>検査はこのアプリを通した文字列のパターン確認です。見逃し・誤検知があり、意味検査やDLPの代わりにはなりません。</p><button className="primary" onClick={()=>void complete()}>使い始める</button></>}
  </main>;
}
