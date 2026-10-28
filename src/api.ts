import { ui } from "./i18n";
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
export class AdvisoryCheckError extends Error {}

async function maskedCopyText(text: string, ignored: string[]): Promise<string> {
  try { return (await request<{ masked: string }>("check_text", { text, ignored })).masked; }
  catch (e) { throw new AdvisoryCheckError(message(e)); }
}

export async function copy(
  composition: Composition,
  project_id: string,
  values: Record<string, string>,
  standalone = false,
  maskSensitive = false,
  ignored: string[] = [],
  includeContext = false,
  aiFormat = false,
  draft?: { name: string; body: string },
): Promise<{ warning: string | null; characters: number }> {
  if (desktop) {
    const result = await invoke<{ copied: boolean; warning: string | null; characters: number }>(
      "copy_prompt",
      {
        request: {
          project_id,
          draft,
          revision_ids: composition.revision_ids,
          values,
          expected_hash: composition.hash,
          operation_id: crypto.randomUUID(),
          standalone,
          mask_sensitive: maskSensitive,
          ignored,
          include_context: includeContext,
          ai_format: aiFormat,
        },
      },
    );
    if(!draft)sessionStorage.setItem("recent-revisions",JSON.stringify(composition.revision_ids));
    window.dispatchEvent(new Event("prompt-copied"));
    return { warning: result.warning, characters: result.characters };
  }
  const fresh = await request<Composition>(draft ? "compose_draft" : "compose", draft ? {draft, values} : {
    project_id,
    standalone,
    include_context: includeContext,
    ai_format: aiFormat,
    revision_ids: composition.revision_ids,
    values,
  });
  if (fresh.hash !== composition.hash || fresh.blocked)
    throw new Error("内容が変わりました。プレビューを確認してください。");
  // Explicit original copying must not depend on the advisory checker.
  const output = maskSensitive
    ? await maskedCopyText(fresh.body, ignored)
    : fresh.body;
  await navigator.clipboard.writeText(output);
  if(!draft)sessionStorage.setItem("recent-revisions",JSON.stringify(composition.revision_ids));
    window.dispatchEvent(new Event("prompt-copied"));
  const previewWarning = sessionStorage.getItem("preview-copy-notice-seen") ? null : ui.previewCopyNotice;
  sessionStorage.setItem("preview-copy-notice-seen", "true");
  return { warning: previewWarning, characters: [...output].length };
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
