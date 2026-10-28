# Prompt Recipe

A lightweight local-first desktop tool for saving reusable prompts, filling variables and copying the composed text. Built with Tauri, Rust, React and SQLite.

Register a name and prompt body, enter values for `{{variable}}`, preview and copy. Cross-tab selection chips support removal and ordering. Advanced controls and examples are optional. Context headers and AI-specific formatting are off by default. The palette opens empty, supports keyboard search and can close after a successful copy.

Local advisory pattern checks highlight possible credentials and personal data. Choose masked copying or explicitly copy the original. Detection does not store matched values. Prompts explicitly saved by the user remain plaintext. Ignored findings store revision-scoped hashes in local WebView storage; hashes are not an anonymization guarantee.

Checks cover only text passing through this app. Unknown formats may be missed and false positives occur. This is not semantic analysis or DLP. See [rule provenance, storage boundaries and validation limits](docs/ADVISORY-CHECKS.md). The tested macOS clipboard and configurable global shortcut paths are documented in the [native validation record](docs/MAC-NATIVE-VALIDATION-2026-10-28.md). Windows/Linux application runtime remains unverified.

See the [Japanese README](README.md) for build commands and development notes.

Development requires Node.js >=22.18.0. Use `nvm install && nvm use` and `npm test` for frontend regression tests. See the third-round section in the validation notes for masking, overlapping findings, OS detection and known dependency audit limitations.

The palette shortcut defaults to Option+Space on macOS and Ctrl+Shift+Space on Windows/Linux. Open Settings to select a preset or record a key combination, then apply and save it. Failed registration preserves the previous binding and displays the error. macOS may allow shared hotkeys across apps, so successful registration cannot guarantee absence of conflicts.
