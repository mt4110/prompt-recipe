export function copySuccess(characters: number, warning: string | null): string {
  return `コピーしました（${characters}文字）${warning ? ` · ${warning}` : ""}`;
}
export function copyFailure(detail: string): string {
  return detail.startsWith("コピーできませんでした。")
    ? detail
    : `コピーできませんでした。${detail}`;
}
