import { defineConfig } from "vite";
import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";

// Opt-in development transport. Never included in the desktop production app.
export default defineConfig({
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  plugins:
    process.env.PROMPT_RECIPE_PREVIEW === "1"
      ? [
          {
            name: "rust-core-preview",
            configureServer(server) {
              mkdirSync(".local", { recursive: true });
              server.middlewares.use("/__recipe_preview", (req, res) => {
                if (
                  req.method !== "POST" ||
                  req.headers.origin !== "http://127.0.0.1:1420" ||
                  req.headers["content-type"] !== "application/json"
                ) {
                  res.statusCode = 403;
                  res.end();
                  return;
                }
                let body = "";
                let exceeded = false;
                req.on("data", (data) => {
                  body += data;
                  if (body.length > 1024 * 1024) {
                    exceeded = true;
                    req.destroy();
                  }
                });
                req.on("end", () => {
                  if (exceeded) return;
                  const child = execFile(
                    resolve("src-tauri/target/debug/recipe-preview"),
                    [resolve(".local/preview.sqlite")],
                    { timeout: 15000, maxBuffer: 4 * 1024 * 1024 },
                    (error, stdout) => {
                      res.setHeader("Content-Type", "application/json");
                      if (error) {
                        res.statusCode = 500;
                        res.end(
                          JSON.stringify({
                            error: {
                              message:
                                "開発用Rustコアを起動できません。preview:coreを実行してください。",
                            },
                          }),
                        );
                      } else res.end(stdout);
                    },
                  );
                  child.stdin?.end(body);
                });
              });
            },
          },
        ]
      : [],
});
