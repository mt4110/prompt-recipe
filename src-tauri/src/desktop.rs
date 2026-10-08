use crate::{application, domain::*, infrastructure::Store};
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, sync::Mutex};
use tauri::{Emitter, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct State {
    store: Store,
    shortcut: Mutex<String>,
    copy: Mutex<()>,
    last_output_hash: Mutex<Option<String>>,
}
fn authorized(window: &tauri::WebviewWindow) -> Result<()> {
    if ["main", "palette"].contains(&window.label()) {
        Ok(())
    } else {
        Err(Error::new("permission", "この画面からは実行できません。"))
    }
}
#[tauri::command]
async fn dispatch(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: application::Request,
) -> Result<Value> {
    authorized(&window)?;
    if window.label() == "palette" && !request.palette_allowed() {
        return Err(Error::new("permission", "編集は通常画面で行ってください。"));
    }
    let store = app.state::<State>().store.clone();
    let mutating = request.is_mutation();
    let result = tauri::async_runtime::spawn_blocking(move || {
        store.call(move |conn| application::dispatch(conn, request))
    })
    .await
    .map_err(|_| Error::new("worker", "処理が停止しました。"))??;
    if mutating {
        app.emit("workspace-changed", ())
            .map_err(|_| Error::new("event", "保存済みですが画面更新の通知に失敗しました。"))?;
    }
    Ok(result)
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CopyRequest {
    #[serde(default)]
    standalone: bool,
    project_id: String,
    revision_ids: Vec<String>,
    values: BTreeMap<String, String>,
    expected_hash: String,
    operation_id: String,
}
#[tauri::command]
async fn copy_prompt(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    request: CopyRequest,
) -> Result<Value> {
    authorized(&window)?;
    uuid::Uuid::parse_str(&request.operation_id)
        .map_err(|_| Error::new("operation", "コピー操作のIDが不正です。"))?;
    let label = window.label().to_owned();
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<State>();
        let _lock = state
            .copy
            .lock()
            .map_err(|_| Error::new("copy", "コピーを再試行してください。"))?;
        let ids = request.revision_ids.clone();
        let composed = state.store.call(move |conn| {
            if request.standalone {
                application::ledger_composition(conn, &request.revision_ids, &request.values)
            } else {
                application::composition(
                    conn,
                    &request.project_id,
                    &request.revision_ids,
                    &request.values,
                )
            }
        })?;
        if composed.blocked || composed.revision_ids.is_empty() {
            return Err(Error::new(
                "blocked",
                "入力不足・衝突を解消してからコピーしてください。",
            ));
        }
        if composed.hash != request.expected_hash {
            return Err(Error::new(
                "stale",
                "プレビューが変わりました。内容を確認して再試行してください。",
            ));
        }
        app.clipboard().write_text(&composed.body).map_err(|_| {
            Error::new(
                "clipboard",
                "コピーできませんでした。入力は保持されています。",
            )
        })?;
        if let Ok(mut last) = state.last_output_hash.lock() {
            *last = Some(format!("{:x}", Sha256::digest(composed.body.as_bytes())));
        }
        let warning = state
            .store
            .call(move |conn| application::record_use(conn, &request.operation_id, &ids))
            .err()
            .map(|_| "コピー済みですが利用記録を保存できませんでした。");
        if label == "palette" {
            if let Some(w) = app.get_webview_window("palette") {
                w.hide().map_err(|_| {
                    Error::new("window", "コピー済みですが小窓を閉じられませんでした。")
                })?;
            }
        }
        Ok(json!({"copied":true,"warning":warning}))
    })
    .await
    .map_err(|_| Error::new("worker", "コピー処理が停止しました。"))?
}
fn open_palette(app: &tauri::AppHandle) -> Result<()> {
    let w = if let Some(w) = app.get_webview_window("palette") {
        w
    } else {
        let config = app
            .config()
            .app
            .windows
            .iter()
            .find(|w| w.label == "palette")
            .ok_or_else(|| Error::new("window", "小窓の設定が見つかりません。"))?;
        build_window(app, config).map_err(|_| Error::new("window", "小窓を作成できません。"))?
    };
    w.show()
        .and_then(|_| w.set_focus())
        .map_err(|_| Error::new("window", "小窓を開けません。"))?;
    if let Some(main) = app.get_webview_window("main") {
        if main.hide().is_err() {
            let _ = w.hide();
            return Err(Error::new("window", "通常画面を隠せませんでした。"));
        }
    }
    w.emit("palette-open", ())
        .map_err(|_| Error::new("event", "小窓を更新できません。"))
}
fn build_window(
    app: &tauri::AppHandle,
    config: &tauri::utils::config::WindowConfig,
) -> tauri::Result<tauri::WebviewWindow> {
    let w = tauri::WebviewWindowBuilder::from_config(app, config)?
        .on_navigation(|url| {
            url.username().is_empty()
                && url.password().is_none()
                && navigation_allowed(url.scheme(), url.host_str(), url.port(), cfg!(dev))
        })
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()?;
    let window = w.clone();
    w.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window.hide();
        }
    });
    Ok(w)
}
#[tauri::command]
fn palette_action(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    action: String,
) -> Result<()> {
    authorized(&window)?;
    match action.as_str() {
        "open" => open_palette(&app),
        "close" => app
            .get_webview_window("palette")
            .ok_or_else(|| Error::new("window", "小窓が見つかりません。"))?
            .hide()
            .map_err(|_| Error::new("window", "小窓を閉じられません。")),
        "manage" => {
            let w = app
                .get_webview_window("main")
                .ok_or_else(|| Error::new("window", "通常画面が見つかりません。"))?;
            w.show()
                .and_then(|_| w.set_focus())
                .map_err(|_| Error::new("window", "通常画面を開けません。"))?;
            if let Some(palette) = app.get_webview_window("palette") {
                if palette.hide().is_err() {
                    let _ = w.hide();
                    return Err(Error::new("window", "小窓を隠せませんでした。"));
                }
            }
            Ok(())
        }
        _ => Err(Error::new("action", "操作が不正です。")),
    }
}
#[tauri::command]
fn shortcut_status(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<String> {
    authorized(&window)?;
    app.state::<State>()
        .shortcut
        .lock()
        .map(|s| s.clone())
        .map_err(|_| Error::new("shortcut", "登録状態を取得できません。"))
}
#[tauri::command]
fn read_material(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<Value> {
    authorized(&window)?;
    let text = app
        .clipboard()
        .read_text()
        .map_err(|_| Error::new("clipboard", "テキストを読み取れませんでした。"))?;
    text_limit(&text)?;
    let state = app.state::<State>();
    let previous = state
        .last_output_hash
        .lock()
        .map_err(|_| Error::new("clipboard", "コピー状態を取得できません。"))?;
    let digest = format!("{:x}", Sha256::digest(text.as_bytes()));
    Ok(json!({"text":text,"is_previous_output":previous.as_ref()==Some(&digest)}))
}
#[tauri::command]
async fn save_export(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    pack: Value,
) -> Result<bool> {
    authorized(&window)?;
    if window.label() != "main" {
        return Err(Error::new("permission", "通常画面からExportしてください。"));
    }
    let bytes = serde_json::to_vec_pretty(&pack)
        .map_err(|_| Error::new("export", "JSONに変換できません。"))?;
    if bytes.len() > 1024 * 1024 {
        return Err(Error::new(
            "export",
            "JSONファイルは1 MiB以内です。セット単位のExportを使ってください。",
        ));
    }
    tauri::async_runtime::spawn_blocking(move || {
        use std::io::Write;
        let Some(path) = app.dialog().file().set_title("プロンプトのJSONを保存")
            .set_file_name("prompt-recipe.json").add_filter("JSON", &["json"])
            .blocking_save_file() else { return Ok(false); };
        let path = path.into_path().map_err(|_| Error::new("export", "ローカルの保存先を選んでください。"))?;
        let mut file = std::fs::OpenOptions::new().write(true).create_new(true).open(path)
            .map_err(|_| Error::new("export", "新しいファイル名を選んでください。既存ファイルは上書きしません。"))?;
        file.write_all(&bytes).and_then(|_| file.sync_all())
            .map_err(|_| Error::new("export", "保存に失敗しました。未完のファイルが残る場合があります。別名で再保存してください。"))?;
        Ok(true)
    }).await.map_err(|_| Error::new("export", "保存ダイアログを開けませんでした。"))?
}
#[tauri::command]
async fn open_repository(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
) -> Result<Option<Project>> {
    authorized(&window)?;
    if window.label() != "main" {
        return Err(Error::new("permission", "通常画面から開いてください。"));
    }
    let dialog_app = app.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        dialog_app
            .dialog()
            .file()
            .set_title("Git作業ツリーを開く")
            .blocking_pick_folder()
    })
    .await
    .map_err(|_| Error::new("dialog", "フォルダ選択を開けませんでした。"))?;
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| Error::new("repository", "ローカルフォルダを選んでください。"))?;
    let store = app.state::<State>().store.clone();
    let p = tauri::async_runtime::spawn_blocking(move || {
        let root = crate::repository::verify(&path)?;
        store.call(move |conn| crate::repository::open(conn, &root))
    })
    .await
    .map_err(|_| Error::new("worker", "プロジェクトを開けませんでした。"))??;
    app.emit("workspace-changed", ())
        .map_err(|_| Error::new("event", "保存済みですが画面通知に失敗しました。"))?;
    Ok(Some(p))
}
pub fn run() -> std::result::Result<(), Box<dyn std::error::Error>> {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(w) = app.get_webview_window("palette") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = w.hide();
                            } else {
                                let _ = open_palette(app);
                            }
                        } else {
                            let _ = open_palette(app);
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            let path = app.path().app_data_dir()?;
            std::fs::create_dir_all(&path)?;
            app.manage(State {
                store: Store::open(&path.join("recipes.sqlite"))?,
                shortcut: Mutex::new(String::new()),
                copy: Mutex::new(()),
                last_output_hash: Mutex::new(None),
            });
            for config in app
                .config()
                .app
                .windows
                .iter()
                .filter(|w| w.label == "main")
            {
                build_window(app.handle(), config)?;
            }
            let modifiers = if cfg!(target_os = "macos") {
                Modifiers::SUPER | Modifiers::SHIFT
            } else {
                Modifiers::CONTROL | Modifiers::SHIFT
            };
            let status = match app
                .global_shortcut()
                .register(Shortcut::new(Some(modifiers), Code::Space))
            {
                Ok(()) => "グローバルショートカット登録済み".to_owned(),
                Err(_) => "ショートカットを登録できません。画面の「小窓を開く」を使ってください。"
                    .to_owned(),
            };
            if let Ok(mut s) = app.state::<State>().shortcut.lock() {
                *s = status;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            dispatch,
            copy_prompt,
            palette_action,
            shortcut_status,
            read_material,
            open_repository,
            save_export
        ])
        .build(tauri::generate_context!())?;
    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            if let Some(w) = app.get_webview_window("main") {
                if w.show().and_then(|_| w.set_focus()).is_ok() {
                    if let Some(p) = app.get_webview_window("palette") {
                        let _ = p.hide();
                    }
                }
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
    Ok(())
}
