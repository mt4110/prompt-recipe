import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { desktop, events, message } from "../api";
import { isMac } from "../platform";
import { ui } from "../i18n";
import { defaultShortcut, normalizeShortcut, shortcutFromEvent, shortcutLabel, shortcutWarning, type ShortcutStatus } from "../shortcut";
const Context = createContext<{status: ShortcutStatus; busy: boolean; apply: (value: string)=>Promise<ShortcutStatus> } | null>(null);
export function ShortcutProvider({children}: {children: ReactNode}) {
  const [status,setStatus]=useState<ShortcutStatus>({binding:defaultShortcut(isMac()),registered:false,error:null});
  const [busy,setBusy]=useState(true);
  useEffect(()=>{
    let active=true; let cleanup=()=>{};
    const load=async()=>{
      try {
        const next=desktop ? await invoke<ShortcutStatus>("shortcut_status") : {binding:normalizeShortcut(localStorage.getItem("palette-shortcut") || defaultShortcut(isMac())),registered:false,error:null};
        if(active)setStatus(next);
      } catch(e){if(active)setStatus(s=>({...s,error:message(e)}));}
      finally {if(active)setBusy(false);}
    };
    void load();
    void events("shortcut-changed",()=>{void load();}).then(fn=>{if(active)cleanup=fn;else fn();});
    return ()=>{active=false;cleanup();};
  },[]);
  async function apply(value: string): Promise<ShortcutStatus> {
    setBusy(true);
    try {
      const binding=normalizeShortcut(value);
      if(desktop){const next=await invoke<ShortcutStatus>("set_shortcut",{binding});setStatus(next);return next;}
      localStorage.setItem("palette-shortcut",binding);
      const next={binding,registered:false,error:null};setStatus(next);return next;
    }catch(e){const next={...status,error:message(e)};setStatus(next);return next;}
    finally{setBusy(false);}
  }
  return <Context.Provider value={{status,busy,apply}}>{children}</Context.Provider>;
}
export function useShortcut(){const value=useContext(Context);if(!value)throw new Error("ShortcutProvider missing");return value;}
export function ShortcutSettings(){
  const {status,busy,apply}=useShortcut();
  const [candidate,setCandidate]=useState(status.binding);
  const [recording,setRecording]=useState(false);
  const [error,setError]=useState("");
  const [saved,setSaved]=useState("");
  useEffect(()=>{setCandidate(status.binding);},[status.binding]);
  const mac=isMac();
  let warning:string|null=null;try{warning=shortcutWarning(candidate,mac);}catch{ /* show recording validation separately */ }
  return <section className="panel shortcut-settings" aria-label={ui.shortcutSetting}>
    <h2>{ui.shortcutSetting}</h2>
    <p>現在の設定: <kbd>{shortcutLabel(status.binding,mac)}</kbd> · {busy ? "確認中…" : desktop ? status.registered ? "登録済み" : "未登録" : "ブラウザ内でのみ有効"}</p>
    <label>プリセット<select aria-label="小窓のキーのプリセット" disabled={busy||recording} value={candidate} onChange={e=>{setCandidate(e.target.value);setError("");setSaved("");}}>
      {[...new Set([defaultShortcut(mac),"Alt+Space","Control+Alt+KeyP","Shift+Super+KeyK",candidate])].map(value=><option value={value} key={value}>{shortcutLabel(value,mac)}</option>)}
    </select></label>
    <button type="button" disabled={busy} aria-pressed={recording} onClick={()=>{setRecording(true);setError("");setSaved("");}}>{ui.recordShortcut}</button>
    {recording && <div role="dialog" aria-modal="true" aria-label="キーを記録" className="shortcut-recorder" onKeyDown={e=>{
      e.preventDefault();e.stopPropagation();
      if(e.key==="Escape"){setRecording(false);return;}
      if(e.nativeEvent.isComposing||e.repeat||["Meta","Control","Alt","Shift"].includes(e.key))return;
      try{setCandidate(shortcutFromEvent(e.nativeEvent));setRecording(false);setError("");}catch(err){setError(message(err));}
    }}>
      <p>組み合わせるキーを押してください。Escでキャンセルします。</p>
      <input aria-label="記録するキー" readOnly autoFocus value="" placeholder="例: Control + Option + P" />
      <button type="button" onClick={()=>setRecording(false)}>記録をキャンセル</button>
    </div>}
    <p>変更先: <kbd>{shortcutLabel(candidate,mac)}</kbd></p>
    {mac&&<p className="muted">⌃Space と ⌃⌥Space は、日本語の入力ソース切り替えと競合することがあります。</p>}
    {warning&&<p role="alert" className="hint">{warning}</p>}
    {(error||status.error)&&<p role="alert" className="error">{error||status.error}</p>}
    {saved&&<p role="status">{saved}</p>}
    <div className="actions"><button disabled={busy||recording} onClick={async()=>{
      setError("");setSaved("");const result=await apply(candidate);setCandidate(result.binding);
      if(!result.error)setSaved(desktop ? "キーを変更・保存しました。" : "ブラウザ内のキーを保存しました。");
    }}>{busy ? "適用中…" : "キーを変更して保存"}</button>
    <button disabled={busy||recording} onClick={()=>{setCandidate(defaultShortcut(mac));setError("");setSaved("");}}>既定のキーを選ぶ</button></div>
    <p className="muted">登録に失敗した場合は元の設定を維持します。画面の「小窓を開く」も利用できます。</p>
  </section>;
}
