import { invoke } from "@tauri-apps/api/core";
import { desktop } from "./api";
export async function downloadPack(
  pack: unknown,
  name = "prompt-recipe.json",
): Promise<boolean> {
  if (desktop) return invoke<boolean>("save_export", { pack });
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
