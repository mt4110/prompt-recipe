use crate::{
    application::{revision, storage_error},
    domain::*,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RecipeSet {
    pub id: String,
    pub name: String,
    pub revision_ids: Vec<String>,
    pub version: u32,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Archive {
    pub schema_version: u32,
    pub recipes: Vec<Recipe>,
    pub heads: Vec<String>,
    pub sets: Vec<RecipeSet>,
}
fn encoded<T: Serialize>(v: &T) -> Result<String> {
    serde_json::to_string(v).map_err(|_| Error::new("archive", "書き出し形式を作れません。"))
}
fn decode<T: for<'a> Deserialize<'a>>(s: &str) -> Result<T> {
    serde_json::from_str(s).map_err(|_| Error::new("archive", "保存されたセットの形式が不正です。"))
}
pub fn sets(c: &Connection) -> Result<Vec<RecipeSet>> {
    let mut q = c
        .prepare("SELECT value FROM settings WHERE key LIKE 'recipe_set:%' ORDER BY rowid")
        .map_err(storage_error)?;
    let result = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(storage_error)?
        .map(|r| decode(&r.map_err(storage_error)?))
        .collect();
    result
}
fn validate_set(s: &RecipeSet) -> Result<()> {
    if s.id.is_empty()
        || s.id.len() > 128
        || s.name.trim().is_empty()
        || s.name.len() > 200
        || s.version == 0
        || s.version == u32::MAX
        || s.revision_ids.len() > 32
        || s.revision_ids.iter().collect::<BTreeSet<_>>().len() != s.revision_ids.len()
    {
        return Err(Error::new(
            "set",
            "セットの名前・版・件数を確認してください。",
        ));
    }
    Ok(())
}
pub fn save_set(c: &mut Connection, mut s: RecipeSet, expected: u32) -> Result<RecipeSet> {
    let tx = c.transaction().map_err(storage_error)?;
    if s.id.is_empty() {
        s.id = uuid::Uuid::new_v4().to_string();
        s.version = 1;
    } else {
        let old: Option<String> = tx
            .query_row(
                "SELECT value FROM settings WHERE key=?1",
                [format!("recipe_set:{}", s.id)],
                |r| r.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        let old: RecipeSet =
            decode(&old.ok_or_else(|| Error::new("set", "セットが見つかりません。"))?)?;
        if expected != old.version {
            return Err(Error::new(
                "stale",
                "セットが更新されています。確認し直してください。",
            ));
        }
        s.version = old
            .version
            .checked_add(1)
            .ok_or_else(|| Error::new("set", "版の上限です。"))?;
    }
    validate_set(&s)?;
    for id in &s.revision_ids {
        revision(&tx, id)?;
    }
    tx.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value",params![format!("recipe_set:{}",s.id),encoded(&s)?]).map_err(storage_error)?;
    tx.commit().map_err(storage_error)?;
    Ok(s)
}
pub fn export(c: &Connection) -> Result<Archive> {
    let selected = sets(c)?;
    let mut q = c
        .prepare("SELECT data FROM revisions ORDER BY rowid")
        .map_err(storage_error)?;
    let mut recipes: Vec<Recipe> = q
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(storage_error)?
        .map(|r| decode(&r.map_err(storage_error)?))
        .collect::<Result<_>>()?;
    let mut headsq = c
        .prepare("SELECT current_revision FROM recipes ORDER BY rowid")
        .map_err(storage_error)?;
    let mut heads: Vec<String> = headsq
        .query_map([], |r| r.get(0))
        .map_err(storage_error)?
        .collect::<std::result::Result<_, _>>()
        .map_err(storage_error)?;
    let pack = Archive {
        schema_version: 3,
        recipes: std::mem::take(&mut recipes),
        heads: std::mem::take(&mut heads),
        sets: selected,
    };
    if encoded(&pack)?.len() > 1024 * 1024 || pack.recipes.len() > 512 || pack.sets.len() > 128 {
        return Err(Error::new(
            "archive",
            "台帳パックは512版・1 MiB以内です。選択したセットだけのExportを使ってください。",
        ));
    }
    Ok(pack)
}
pub fn export_set(c: &Connection, id: String) -> Result<Archive> {
    let s = sets(c)?
        .into_iter()
        .find(|s| s.id == id)
        .ok_or_else(|| Error::new("set", "セットが見つかりません。"))?;
    let mut wanted = BTreeSet::new();
    let mut pending = s.revision_ids.clone();
    let mut recipes = Vec::new();
    while let Some(id) = pending.pop() {
        if !wanted.insert(id.clone()) {
            continue;
        }
        if wanted.len() > 512 {
            return Err(Error::new("archive", "セットの履歴が上限を超えています。"));
        }
        let r = revision(c, &id)?;
        if let Some(parent) = &r.parent_revision_id {
            pending.push(parent.clone());
        }
        recipes.push(r);
    }
    let mut chosen = BTreeMap::<String, &Recipe>::new();
    for r in &recipes {
        if s.revision_ids.contains(&r.revision_id)
            && chosen.get(&r.id).is_none_or(|old| old.version < r.version)
        {
            chosen.insert(r.id.clone(), r);
        }
    }
    let heads = chosen.values().map(|r| r.revision_id.clone()).collect();
    let pack = Archive {
        schema_version: 3,
        recipes,
        heads,
        sets: vec![s],
    };
    if encoded(&pack)?.len() > 1024 * 1024 {
        return Err(Error::new("archive", "パックは1 MiB以内です。"));
    }
    Ok(pack)
}
pub fn inspect(c: &Connection, pack: &Archive) -> Result<Value> {
    if pack.schema_version != 3
        || pack.recipes.len() > 512
        || pack.sets.len() > 128
        || pack.heads.len() > 512
        || encoded(pack)?.len() > 1024 * 1024
    {
        return Err(Error::new(
            "archive",
            "移行パックの版・件数・サイズに対応していません。",
        ));
    }
    let mut by_id = BTreeMap::new();
    let mut changes = Vec::new();
    for r in &pack.recipes {
        validate_recipe(r)?;
        if by_id.insert(&r.revision_id, r).is_some() {
            return Err(Error::new("archive", "パック内の版が重複しています。"));
        }
        let old: Option<String> = c
            .query_row(
                "SELECT data FROM revisions WHERE id=?1",
                [&r.revision_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        if let Some(old) = &old {
            if encoded(&decode::<Recipe>(old)?)? != encoded(r)? {
                return Err(Error::new(
                    "immutable",
                    "同じ版IDで本文・分類が異なります。上書きできません。",
                ));
            }
        }
        changes.push(json!({"name":r.name,"from":0,"to":r.version,"action":if old.is_some(){"導入済み"}else{"版を追加"}}));
    }
    for r in &pack.recipes {
        let mut seen = BTreeSet::new();
        let mut current = r;
        while let Some(parent) = &current.parent_revision_id {
            if !seen.insert(parent) {
                return Err(Error::new("archive", "派生元に循環があります。"));
            }
            let ancestor = by_id
                .get(parent)
                .copied()
                .ok_or_else(|| Error::new("archive", "派生元の版がパックに不足しています。"))?;
            if ancestor.id == current.id && ancestor.version >= current.version {
                return Err(Error::new(
                    "archive",
                    "同じプロンプトの派生元は古い版である必要があります。",
                ));
            }
            current = ancestor;
        }
    }
    let mut seen = BTreeSet::new();
    for id in &pack.heads {
        let r = by_id
            .get(id)
            .ok_or_else(|| Error::new("archive", "現在の版の参照が不足しています。"))?;
        if !seen.insert(&r.id) {
            return Err(Error::new(
                "archive",
                "同じプロンプトに複数の現在版があります。",
            ));
        }
        let current: Option<String> = c
            .query_row(
                "SELECT current_revision FROM recipes WHERE id=?1",
                [&r.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        let from = if let Some(id) = &current {
            revision(c, id)?.version
        } else {
            0
        };
        changes.push(json!({"name":r.name,"from":from,"to":r.version,"action":if from>r.version {"新しい既存版を保持"}else{"台帳の採用版"}}));
        if let Some(current) = current {
            let old = revision(c, &current)?;
            if old.version < r.version && old.revision_id != r.revision_id {
                let mut next = r.parent_revision_id.as_ref();
                let mut found = false;
                while let Some(parent) = next {
                    if parent == &old.revision_id {
                        found = true;
                        break;
                    }
                    next = by_id
                        .get(parent)
                        .and_then(|p| p.parent_revision_id.as_ref());
                }
                if !found {
                    return Err(Error::new("archive", "既存の採用版から派生していない更新です。別プロンプトとして複製してください。"));
                }
            }
            if old.builtin != r.builtin {
                return Err(Error::new(
                    "archive",
                    "組み込み／個人の区別が一致しません。",
                ));
            }
            if old.version == r.version && old.revision_id != r.revision_id {
                return Err(Error::new(
                    "archive",
                    "同じプロンプトの版が分岐しています。別の名前で複製してください。",
                ));
            }
        }
    }
    let mut set_ids = BTreeSet::new();
    for s in &pack.sets {
        validate_set(s)?;
        if !set_ids.insert(&s.id) || s.revision_ids.iter().any(|id| !by_id.contains_key(id)) {
            return Err(Error::new(
                "archive",
                "セットの重複または参照不足があります。",
            ));
        }
        let old: Option<String> = c
            .query_row(
                "SELECT value FROM settings WHERE key=?1",
                [format!("recipe_set:{}", s.id)],
                |r| r.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        if let Some(old) = old {
            if encoded(&decode::<RecipeSet>(&old)?)? != encoded(s)? {
                return Err(Error::new(
                    "set_conflict",
                    "同じIDのセットが異なります。現在のセットを保持して導入を止めました。",
                ));
            }
        }
        changes.push(json!({"name":s.name,"from":0,"to":s.version,"action":"セットを導入"}));
    }
    let hash = format!(
        "{:x}",
        Sha256::digest(encoded(&(pack, &changes))?.as_bytes())
    );
    Ok(json!({"changes":changes,"plan_hash":hash}))
}
pub fn import(c: &mut Connection, pack: Archive, expected: String) -> Result<()> {
    let tx = c.transaction().map_err(storage_error)?;
    let plan = inspect(&tx, &pack)?;
    if plan["plan_hash"].as_str() != Some(&expected) {
        return Err(Error::new(
            "stale",
            "導入先が変わりました。差分を再確認してください。",
        ));
    }
    for r in &pack.recipes {
        tx.execute("INSERT OR IGNORE INTO revisions(id,recipe_id,data,reason) VALUES(?1,?2,?3,'移行パックからImport')",params![r.revision_id,r.id,encoded(r)?]).map_err(storage_error)?;
    }
    for id in &pack.heads {
        let r = revision(&tx, id)?;
        let existing: Option<String> = tx
            .query_row(
                "SELECT current_revision FROM recipes WHERE id=?1",
                [&r.id],
                |row| row.get(0),
            )
            .optional()
            .map_err(storage_error)?;
        if let Some(old) = existing {
            if revision(&tx, &old)?.version >= r.version {
                continue;
            }
        }
        tx.execute("INSERT INTO recipes(id,current_revision) VALUES(?1,?2) ON CONFLICT(id) DO UPDATE SET current_revision=excluded.current_revision",params![r.id,id]).map_err(storage_error)?;
    }
    for s in &pack.sets {
        tx.execute(
            "INSERT OR IGNORE INTO settings(key,value) VALUES(?1,?2)",
            params![format!("recipe_set:{}", s.id), encoded(s)?],
        )
        .map_err(storage_error)?;
    }
    tx.commit().map_err(storage_error)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn database() -> Connection {
        let mut c = Connection::open_in_memory().expect("db");
        crate::application::initialize(&mut c).expect("init");
        c
    }
    fn personal(c: &Connection) -> Recipe {
        let mut r = revision(c, "builtin-01-v1").expect("fixture");
        r.id = "personal-note".into();
        r.revision_id = "personal-note-v1".into();
        r.builtin = false;
        r.parent_revision_id = None;
        c.execute(
            "INSERT INTO revisions(id,recipe_id,data,reason) VALUES(?1,?2,?3,'fixture')",
            params![r.revision_id, r.id, encoded(&r).expect("encode")],
        )
        .expect("insert");
        c.execute(
            "INSERT INTO recipes(id,current_revision) VALUES(?1,?2)",
            params![r.id, r.revision_id],
        )
        .expect("head");
        r
    }
    #[test]
    fn set_export_and_import_preserve_order_versions_and_exclude_paths() {
        let mut c = database();
        let r = personal(&c);
        let set = save_set(
            &mut c,
            RecipeSet {
                id: "".into(),
                name: "普段の依頼".into(),
                revision_ids: vec!["builtin-03-v2".into(), r.revision_id.clone()],
                version: 1,
            },
            0,
        )
        .expect("save set");
        c.execute(
            "INSERT INTO settings(key,value) VALUES('repository:example','/private/client-repo')",
            [],
        )
        .expect("private metadata");
        let pack = export_set(&c, set.id.clone()).expect("export");
        assert_eq!(pack.recipes.len(), 3);
        assert!(!encoded(&pack)
            .expect("encode")
            .contains("/private/client-repo"));
        let mut fresh = database();
        let plan = inspect(&fresh, &pack).expect("inspect");
        import(
            &mut fresh,
            pack.clone(),
            plan["plan_hash"].as_str().expect("hash").into(),
        )
        .expect("import");
        assert_eq!(
            sets(&fresh).expect("sets")[0].revision_ids,
            set.revision_ids
        );
        assert_eq!(
            revision(&fresh, &r.revision_id).expect("recipe").body,
            r.body
        );
        let repeat = inspect(&fresh, &pack).expect("repeat plan");
        import(
            &mut fresh,
            pack,
            repeat["plan_hash"].as_str().expect("hash").into(),
        )
        .expect("idempotent");
        assert_eq!(sets(&fresh).expect("sets").len(), 1);
        let all = export(&c).expect("all");
        assert!(all.heads.contains(&r.revision_id));
        assert_eq!(all.sets.len(), 1);
    }
    #[test]
    fn conflicting_and_stale_imports_preserve_database() {
        let mut c = database();
        let r = personal(&c);
        let set = save_set(
            &mut c,
            RecipeSet {
                id: "".into(),
                name: "Set".into(),
                revision_ids: vec![r.revision_id.clone()],
                version: 1,
            },
            0,
        )
        .expect("save");
        let pack = export_set(&c, set.id.clone()).expect("pack");
        let mut fresh = database();
        let plan = inspect(&fresh, &pack).expect("plan");
        assert_eq!(
            import(&mut fresh, pack.clone(), "bad hash".into())
                .expect_err("stale")
                .code,
            "stale"
        );
        assert!(revision(&fresh, &r.revision_id).is_err());
        import(
            &mut fresh,
            pack.clone(),
            plan["plan_hash"].as_str().expect("hash").into(),
        )
        .expect("import");
        let mut bad = pack.clone();
        bad.recipes[0].body.push_str("tampered");
        assert_eq!(
            inspect(&fresh, &bad).expect_err("immutable").code,
            "immutable"
        );
        bad = pack.clone();
        bad.sets[0].name = "Different".into();
        assert_eq!(
            inspect(&fresh, &bad).expect_err("conflict").code,
            "set_conflict"
        );
        bad = pack.clone();
        let mut child = bad.recipes[0].clone();
        child.revision_id = "invalid-child".into();
        child.parent_revision_id = Some(bad.recipes[0].revision_id.clone());
        bad.recipes.push(child);
        assert_eq!(
            inspect(&fresh, &bad)
                .expect_err("non-increasing history")
                .code,
            "archive"
        );
        bad = pack;
        bad.sets[0].revision_ids.push("missing".into());
        assert!(inspect(&fresh, &bad).is_err());
        assert_eq!(sets(&fresh).expect("unchanged")[0].name, "Set");
    }
}
