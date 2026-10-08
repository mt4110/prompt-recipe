import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Composition } from "./types";
export const desktop = isTauri();
export async function request<T>(kind: string, data?: unknown): Promise<T> {
  const req = data === undefined ? { kind } : { kind, data };
  if (desktop) return invoke<T>("dispatch", { request: req });
  if (!import.meta.env.DEV || location.origin !== "http://127.0.0.1:1420")
    throw new Error(
      "デスクトップアプリで開いてください。開発用通信は無効です。",
    );
  const response = await fetch("/__recipe_preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  const result = await response.json();
  if (result.error) throw result.error;
  return result.ok as T;
}
export const message = (e: unknown) =>
  typeof e === "object" && e && "message" in e ? String(e.message) : String(e);
export async function copy(
  composition: Composition,
  project_id: string,
  values: Record<string, string>,
  standalone = false,
): Promise<string | null> {
  if (desktop) {
    const result = await invoke<{ copied: boolean; warning: string | null }>(
      "copy_prompt",
      {
        request: {
          project_id,
          revision_ids: composition.revision_ids,
          values,
          expected_hash: composition.hash,
          operation_id: crypto.randomUUID(),
          standalone,
        },
      },
    );
    return result.warning;
  }
  const fresh = await request<Composition>("compose", {
    project_id,
    standalone,
    revision_ids: composition.revision_ids,
    values,
  });
  if (fresh.hash !== composition.hash || fresh.blocked)
    throw new Error("内容が変わりました。プレビューを確認してください。");
  await navigator.clipboard.writeText(fresh.body);
  return "開発用ブラウザでは利用履歴を記録しません。";
}
export async function readMaterial(): Promise<{
  text: string;
  is_previous_output: boolean;
}> {
  if (desktop) return invoke("read_material");
  return {
    text: await navigator.clipboard.readText(),
    is_previous_output: false,
  };
}
export function events(name: string, fn: () => void) {
  return desktop ? listen(name, fn) : Promise.resolve(() => {});
}
export function paletteAction(action: string) {
  return desktop ? invoke("palette_action", { action }) : Promise.resolve();
}
