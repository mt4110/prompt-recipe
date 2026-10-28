import { isTauri } from "@tauri-apps/api/core";
import { platform } from "@tauri-apps/plugin-os";
export function isMac(): boolean {
  if (isTauri()) { try { return platform() === "macos"; } catch { /* fallback when plugin unavailable */ } }
  const info = navigator as Navigator & { userAgentData?: { platform?: string } };
  const name = info.userAgentData?.platform;
  if (name) return /mac/i.test(name);
  return /mac/i.test(navigator.platform || navigator.userAgent);
}
