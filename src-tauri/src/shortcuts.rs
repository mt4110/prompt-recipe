use crate::domain::{Error, Result};
use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

pub fn default_binding(mac: bool) -> &'static str {
    if mac {
        "Alt+Space"
    } else {
        "Control+Shift+Space"
    }
}
pub fn normalize(value: &str) -> std::result::Result<String, String> {
    if value.len() > 64 {
        return Err("キーの指定が長すぎます。".into());
    }
    let parts: Vec<_> = value.split('+').collect();
    let key = parts.last().copied().unwrap_or("");
    let modifiers = &parts[..parts.len().saturating_sub(1)];
    let order = ["Control", "Alt", "Shift", "Super"];
    if modifiers.iter().any(|m| !order.contains(m))
        || modifiers
            .iter()
            .enumerate()
            .any(|(i, m)| modifiers[..i].contains(m))
        || !modifiers
            .iter()
            .any(|m| ["Control", "Alt", "Super"].contains(m))
    {
        return Err("Control・Option/Alt・Commandのいずれかを組み合わせてください。".into());
    }
    let valid_key = matches!(
        key,
        "Space"
            | "Enter"
            | "Tab"
            | "Escape"
            | "Backspace"
            | "Delete"
            | "Home"
            | "End"
            | "PageUp"
            | "PageDown"
            | "ArrowUp"
            | "ArrowDown"
            | "ArrowLeft"
            | "ArrowRight"
    ) || key
        .strip_prefix("Key")
        .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_uppercase())
        || key
            .strip_prefix("Digit")
            .is_some_and(|s| s.len() == 1 && s.as_bytes()[0].is_ascii_digit())
        || key
            .strip_prefix('F')
            .and_then(|s| s.parse::<u8>().ok())
            .is_some_and(|n| (1..=24).contains(&n) && key == format!("F{n}"));
    if !valid_key {
        return Err(
            "このキーは記録できません。英数字・Space・ファンクションキーなどを使ってください。"
                .into(),
        );
    }
    Ok(order
        .into_iter()
        .filter(|m| modifiers.contains(m))
        .chain([key])
        .collect::<Vec<_>>()
        .join("+"))
}
pub fn load(conn: &Connection, mac: bool) -> Result<String> {
    let saved: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key='palette_shortcut'",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|_| Error::new("storage", "キー設定を読めませんでした。"))?;
    normalize(saved.as_deref().unwrap_or(default_binding(mac)))
        .map_err(|message| Error::new("shortcut", &message))
}
pub fn save(conn: &Connection, binding: &str) -> Result<()> {
    let value = normalize(binding).map_err(|message| Error::new("shortcut", &message))?;
    conn.execute("INSERT INTO settings(key,value) VALUES('palette_shortcut',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[value]).map_err(|_|Error::new("storage","キー設定を保存できませんでした。"))?;
    Ok(())
}
#[derive(Clone, Debug, Serialize)]
pub struct Status {
    pub binding: String,
    pub registered: bool,
    pub error: Option<String>,
}
pub trait Registry {
    fn register(&self, binding: &str) -> std::result::Result<(), String>;
    fn unregister(&self, binding: &str) -> std::result::Result<(), String>;
}
pub fn change(
    registry: &impl Registry,
    state: &mut Status,
    value: &str,
    persist: impl FnOnce(&str) -> std::result::Result<(), String>,
) {
    let next = match normalize(value) {
        Ok(v) => v,
        Err(e) => {
            state.error = Some(e);
            return;
        }
    };
    if next == state.binding && state.registered {
        state.error = persist(&next)
            .err()
            .map(|e| format!("保存できませんでした: {e}。現在の登録は維持します。"));
        return;
    }
    if let Err(e) = registry.register(&next) {
        state.error = Some(format!(
            "登録できませんでした（ほかのアプリとの衝突など）: {e}。元の設定を維持します。"
        ));
        return;
    }
    let old = state.clone();
    if old.registered {
        if let Err(e) = registry.unregister(&old.binding) {
            let cleanup = registry.unregister(&next).err();
            state.error = Some(format!(
                "古いキーを解除できませんでした: {e}。元の設定を維持します。{}",
                cleanup
                    .map(|e| format!("新しいキーの解除にも失敗しました: {e}"))
                    .unwrap_or_default()
            ));
            return;
        }
    }
    if let Err(e) = persist(&next) {
        let cleanup = registry.unregister(&next).err();
        state.registered = old.registered && registry.register(&old.binding).is_ok();
        state.error = Some(format!(
            "保存できませんでした: {e}。{}{}",
            if state.registered {
                "元のキーに戻しました。"
            } else {
                "登録を復旧できません。設定を再適用するか、画面の「小窓を開く」を使ってください。"
            },
            cleanup
                .map(|e| format!("新しいキーの解除にも失敗しました: {e}"))
                .unwrap_or_default()
        ));
        return;
    }
    *state = Status {
        binding: next,
        registered: true,
        error: None,
    };
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{cell::RefCell, collections::BTreeSet};
    struct Fake {
        keys: RefCell<BTreeSet<String>>,
        blocked: BTreeSet<String>,
        fail_remove: bool,
    }
    impl Registry for Fake {
        fn register(&self, b: &str) -> std::result::Result<(), String> {
            if self.blocked.contains(b) {
                return Err("already registered".into());
            }
            self.keys.borrow_mut().insert(b.into());
            Ok(())
        }
        fn unregister(&self, b: &str) -> std::result::Result<(), String> {
            if self.fail_remove && b == "Alt+Space" {
                return Err("busy".into());
            }
            self.keys.borrow_mut().remove(b);
            Ok(())
        }
    }
    fn setup() -> (Fake, Status) {
        (
            Fake {
                keys: RefCell::new(BTreeSet::from(["Alt+Space".into()])),
                blocked: BTreeSet::new(),
                fail_remove: false,
            },
            Status {
                binding: "Alt+Space".into(),
                registered: true,
                error: None,
            },
        )
    }
    #[test]
    fn platform_defaults_and_validation() {
        assert_eq!(default_binding(true), "Alt+Space");
        assert_eq!(default_binding(false), "Control+Shift+Space");
        assert_eq!(normalize("Super+Shift+KeyK").unwrap(), "Shift+Super+KeyK");
        for b in [
            "Space",
            "Shift+KeyP",
            "Alt+Alt+Space",
            "Alt+Unknown",
            "Alt+F99",
        ] {
            assert!(normalize(b).is_err(), "{b}");
        }
    }
    #[test]
    fn saved_setting_survives_reload() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch("CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)")
            .unwrap();
        assert_eq!(load(&c, true).unwrap(), "Alt+Space");
        save(&c, "Control+Alt+KeyP").unwrap();
        assert_eq!(load(&c, true).unwrap(), "Control+Alt+KeyP");
        assert!(save(&c, "KeyP").is_err());
        assert_eq!(load(&c, true).unwrap(), "Control+Alt+KeyP");
    }
    #[test]
    fn successful_change_removes_old_key() {
        let (r, mut s) = setup();
        change(&r, &mut s, "Control+Alt+KeyP", |_| Ok(()));
        assert_eq!(
            *r.keys.borrow(),
            BTreeSet::from(["Control+Alt+KeyP".into()])
        );
        assert_eq!(s.binding, "Control+Alt+KeyP");
        assert!(s.registered);
        assert!(s.error.is_none());
    }
    #[test]
    fn conflict_preserves_old_registration_and_does_not_save() {
        let (mut r, mut s) = setup();
        r.blocked.insert("Super+KeyK".into());
        change(&r, &mut s, "Super+KeyK", |_| panic!("must not save"));
        assert_eq!(s.binding, "Alt+Space");
        assert!(r.keys.borrow().contains("Alt+Space"));
        assert!(s.error.unwrap().contains("衝突"));
    }
    #[test]
    fn persistence_failure_restores_old_key() {
        let (r, mut s) = setup();
        change(&r, &mut s, "Super+KeyK", |_| Err("disk full".into()));
        assert_eq!(s.binding, "Alt+Space");
        assert!(s.registered);
        assert_eq!(*r.keys.borrow(), BTreeSet::from(["Alt+Space".into()]));
        assert!(s.error.unwrap().contains("元のキーに戻しました"));
    }
    #[test]
    fn rollback_failure_is_not_reported_as_registered() {
        let (mut r, mut s) = setup();
        r.blocked.insert("Alt+Space".into());
        change(&r, &mut s, "Super+KeyK", |_| Err("disk full".into()));
        assert!(!s.registered);
        assert!(s.error.unwrap().contains("復旧できません"));
    }
    #[test]
    fn unregister_failure_keeps_original_and_cleans_new() {
        let (mut r, mut s) = setup();
        r.fail_remove = true;
        change(&r, &mut s, "Super+KeyK", |_| panic!("must not save"));
        assert_eq!(*r.keys.borrow(), BTreeSet::from(["Alt+Space".into()]));
        assert!(s.error.unwrap().contains("解除できません"));
    }
    #[test]
    fn reapplying_active_key_repersists_without_registering_twice() {
        let (r, mut s) = setup();
        let saved = RefCell::new(String::new());
        change(&r, &mut s, "Alt+Space", |value| {
            *saved.borrow_mut() = value.to_owned();
            Ok(())
        });
        assert_eq!(*saved.borrow(), "Alt+Space");
        assert_eq!(*r.keys.borrow(), BTreeSet::from(["Alt+Space".into()]));
        assert!(s.registered);
    }
}
