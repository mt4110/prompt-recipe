import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
export function validateBoundary(config, capability) {
  assert.deepEqual(config.app.security.capabilities, ["desktop"]);
  assert.equal(capability.remote, undefined);
  assert.deepEqual(capability.windows, ["main", "palette"]);
  assert.deepEqual(
    [...capability.permissions].sort(),
    [
      "core:event:allow-listen",
      "core:event:allow-unlisten",
      "allow-dispatch",
      "allow-copy-prompt",
      "allow-palette-action",
      "allow-shortcut-status",
      "allow-read-material",
      "allow-open-repository",
      "allow-save-export",
    ].sort(),
  );
  const directives = Object.fromEntries(
    config.app.security.csp
      .split(";")
      .map((s) => s.trim().split(/\s+/))
      .filter((a) => a[0])
      .map(([key, ...values]) => [key, values.join(" ")]),
  );
  assert.equal(directives["default-src"], "'self'");
  assert.equal(directives["script-src"], "'self'");
  assert.equal(directives["style-src"], "'self' 'unsafe-inline'");
  assert.equal(directives["img-src"], "'self' data:");
  assert.equal(directives["connect-src"], "ipc: http://ipc.localhost");
  for (const key of [
    "object-src",
    "base-uri",
    "form-action",
    "frame-src",
    "worker-src",
  ])
    assert.equal(directives[key], "'none'");
  assert.ok(config.app.windows.every((w) => w.create === false));
}
const config = JSON.parse(read("src-tauri/tauri.conf.json"));
const capability = JSON.parse(read("src-tauri/capabilities/desktop.json"));
validateBoundary(config, capability);
// Prove that known boundary regressions fail instead of only checking the current configuration.
assert.throws(() =>
  validateBoundary(
    {
      ...config,
      app: {
        ...config.app,
        security: {
          ...config.app.security,
          csp: config.app.security.csp.replace(
            "connect-src ipc: http://ipc.localhost",
            "connect-src *",
          ),
        },
      },
    },
    capability,
  ),
);
assert.throws(() =>
  validateBoundary(config, {
    ...capability,
    permissions: [...capability.permissions, "http:default"],
  }),
);
assert.match(read("src-tauri/src/desktop.rs"), /on_navigation/);
assert.match(read("src-tauri/src/desktop.rs"), /NewWindowResponse::Deny/);
assert.match(read("src/api.ts"), /!import\.meta\.env\.DEV/);
console.log(
  "Local boundary: CSP, capabilities, navigation hooks and dev transport guard passed.",
);
