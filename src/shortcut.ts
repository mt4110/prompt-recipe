export type ShortcutStatus = { binding: string; registered: boolean; error: string | null };
const modifiers = ["Control", "Alt", "Shift", "Super"];
export const defaultShortcut = (mac: boolean) => mac ? "Alt+Space" : "Control+Shift+Space";
export function normalizeShortcut(value: string): string {
  if (value.length > 64) throw new Error("キーの指定が長すぎます。");
  const parts = value.split("+"); const key = parts.pop() || "";
  if (parts.some(m => !modifiers.includes(m)) || new Set(parts).size !== parts.length ||
      !parts.some(m => ["Control", "Alt", "Super"].includes(m)))
    throw new Error("Control・Option/Alt・Commandのいずれかを組み合わせてください。");
  if (!/^(Space|Enter|Tab|Escape|Backspace|Delete|Home|End|PageUp|PageDown|Arrow(Up|Down|Left|Right)|Key[A-Z]|Digit[0-9]|F([1-9]|1[0-9]|2[0-4]))$/.test(key))
    throw new Error("このキーは記録できません。英数字・Space・ファンクションキーなどを使ってください。");
  return [...modifiers.filter(m => parts.includes(m)), key].join("+");
}
export function shortcutFromEvent(e: Pick<KeyboardEvent, "code"|"ctrlKey"|"altKey"|"shiftKey"|"metaKey">): string {
  return normalizeShortcut([e.ctrlKey && "Control", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Super", e.code].filter(Boolean).join("+"));
}
export function shortcutLabel(value: string, mac: boolean): string {
  const parts = normalizeShortcut(value).split("+");
  const names: Record<string,string> = mac ? {Control:"⌃",Alt:"⌥",Shift:"⇧",Super:"⌘"} : {Control:"Ctrl",Alt:"Alt",Shift:"Shift",Super:"Win"};
  return parts.map(k => names[k] || k.replace(/^(Key|Digit)/, "")).join(mac ? "" : "+");
}
export function shortcutWarning(value: string, mac: boolean): string | null {
  const binding = normalizeShortcut(value);
  return mac && ["Control+Space", "Control+Alt+Space"].includes(binding)
    ? "日本語の入力ソース切り替えと競合する可能性があります。別のキーをおすすめします。" : null;
}
export function matchesShortcut(e: KeyboardEvent, binding: string): boolean {
  if (e.isComposing || e.repeat) return false;
  try { return shortcutFromEvent(e) === normalizeShortcut(binding); } catch { return false; }
}
