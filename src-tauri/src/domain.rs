use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};

pub const MAX_TEXT: usize = 256 * 1024;

/// Only bundled assets, or the fixed loopback dev origin in a dev build.
pub fn navigation_allowed(scheme: &str, host: Option<&str>, port: Option<u16>, dev: bool) -> bool {
    (scheme == "tauri" && host == Some("localhost") && port.is_none())
        || (["http", "https"].contains(&scheme)
            && host == Some("tauri.localhost")
            && port.is_none())
        || (dev && scheme == "http" && host == Some("127.0.0.1") && port == Some(1420))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Error {
    pub code: String,
    pub message: String,
}
impl Error {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Constraint {
    pub key: String,
    pub value: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Variable {
    pub name: String,
    pub required: bool,
    pub default: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Lesson {
    pub purpose: String,
    pub example: String,
    pub why: String,
    pub verify: String,
    pub limitations: String,
    pub evidence: String,
    pub reviewed_at: String,
    pub level: String,
    pub area: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Recipe {
    pub id: String,
    pub revision_id: String,
    pub version: u32,
    pub parent_revision_id: Option<String>,
    pub name: String,
    pub description: String,
    pub body: String,
    pub builtin: bool,
    pub variables: Vec<Variable>,
    pub constraints: Vec<Constraint>,
    pub lesson: Option<Lesson>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub actions: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub goals: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Catalog {
    pub schema_version: u32,
    pub version: String,
    pub recipes: Vec<Recipe>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub environment: String,
    pub reference: String,
    pub assignment: Vec<String>,
    pub version: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Diagnostic {
    pub kind: String,
    pub message: String,
    pub revision_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Composition {
    pub body: String,
    pub hash: String,
    pub revision_ids: Vec<String>,
    pub variables: Vec<Variable>,
    pub diagnostics: Vec<Diagnostic>,
    pub blocked: bool,
}

pub fn text_limit(text: &str) -> Result<()> {
    if text.len() > MAX_TEXT {
        return Err(Error::new(
            "input_limit",
            "入力が上限（256 KiB）を超えています。",
        ));
    }
    Ok(())
}

pub fn names(body: &str) -> Result<Vec<String>> {
    text_limit(body)?;
    let mut rest = body;
    let mut result = Vec::new();
    while let Some(start) = rest.find("{{") {
        rest = &rest[start + 2..];
        let end = rest
            .find("}}")
            .ok_or_else(|| Error::new("placeholder", "変数の閉じ括弧がありません。"))?;
        let name = &rest[..end];
        if name.is_empty()
            || name.len() > 64
            || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
        {
            return Err(Error::new(
                "placeholder",
                "変数名は英数字とアンダースコアで指定してください。",
            ));
        }
        if !result.iter().any(|n| n == name) {
            result.push(name.to_owned());
        }
        rest = &rest[end + 2..];
    }
    Ok(result)
}

pub fn validate_recipe(recipe: &Recipe) -> Result<()> {
    for (values, allowed) in [
        (&recipe.actions, ["analyze", "fix", "design", "discuss"]),
        (&recipe.goals, ["quality", "time", "cost", "understanding"]),
    ] {
        let mut seen = BTreeSet::new();
        if values.len() > allowed.len()
            || values
                .iter()
                .any(|v| !allowed.contains(&v.as_str()) || !seen.insert(v))
        {
            return Err(Error::new(
                "classification",
                "依頼・目的の分類が未対応か重複しています。",
            ));
        }
    }
    if recipe.id.is_empty()
        || recipe.id.len() > 128
        || recipe.revision_id.is_empty()
        || recipe.revision_id.len() > 128
        || recipe.version == 0
        || recipe.version == u32::MAX
    {
        return Err(Error::new("recipe", "レシピのID・版が不正です。"));
    }
    if let Some(lesson) = &recipe.lesson {
        for field in [
            &lesson.purpose,
            &lesson.example,
            &lesson.why,
            &lesson.verify,
            &lesson.limitations,
            &lesson.evidence,
            &lesson.reviewed_at,
            &lesson.level,
            &lesson.area,
        ] {
            text_limit(field)?;
            if field.trim().is_empty() {
                return Err(Error::new(
                    "lesson",
                    "教材の目的・実例・根拠・確認日などの必須項目が不足しています。",
                ));
            }
        }
    }
    if recipe.name.trim().is_empty() || recipe.name.len() > 200 || recipe.body.trim().is_empty() {
        return Err(Error::new(
            "recipe",
            "名前と本文を入力してください（名前は200 byte以内）。",
        ));
    }
    text_limit(&recipe.description)?;
    let parsed = names(&recipe.body)?;
    let mut seen = BTreeSet::new();
    for variable in &recipe.variables {
        if !parsed.contains(&variable.name) || !seen.insert(variable.name.clone()) {
            return Err(Error::new(
                "variables",
                "変数定義が本文と一致しないか重複しています。",
            ));
        }
        if let Some(value) = &variable.default {
            text_limit(value)?;
        }
    }
    if parsed.len() != recipe.variables.len() {
        return Err(Error::new(
            "variables",
            "本文にある変数の定義が不足しています。",
        ));
    }
    let mut keys = BTreeSet::new();
    for constraint in &recipe.constraints {
        if ![
            "approval.before_implementation",
            "network.allowed",
            "parallel.allowed",
            "execution.required",
        ]
        .contains(&constraint.key.as_str())
            || !keys.insert(&constraint.key)
        {
            return Err(Error::new(
                "constraints",
                "未対応または重複した制約があります。",
            ));
        }
    }
    Ok(())
}

fn bounded_append(target: &mut String, value: &str) -> Result<()> {
    if target.len().saturating_add(value.len()) > MAX_TEXT {
        return Err(Error::new(
            "output_limit",
            "展開した指示が256 KiBを超えています。",
        ));
    }
    target.push_str(value);
    Ok(())
}

pub fn compose(
    recipes: &[Recipe],
    project: &Project,
    supplied: &BTreeMap<String, String>,
) -> Result<Composition> {
    text_limit(&project.name)?;
    text_limit(&project.reference)?;
    if recipes.len() > 32 || supplied.len() > 64 {
        return Err(Error::new(
            "input_limit",
            "一度に扱うレシピ／入力が多すぎます。",
        ));
    }
    for value in supplied.values() {
        text_limit(value)?;
    }
    let mut diagnostics = Vec::new();
    let mut variables: Vec<Variable> = Vec::new();
    let mut constraints: BTreeMap<String, (bool, String)> = BTreeMap::new();
    let mut revision_ids = Vec::new();
    let mut bodies = Vec::new();
    let mut total_size = 0;
    for recipe in recipes {
        validate_recipe(recipe)?;
        if revision_ids.contains(&recipe.revision_id) {
            continue;
        }
        revision_ids.push(recipe.revision_id.clone());
        for constraint in &recipe.constraints {
            if let Some((value, source)) = constraints.get(&constraint.key) {
                if value != &constraint.value {
                    diagnostics.push(Diagnostic {
                        kind: "conflict".into(),
                        message: format!(
                            "「{}」と「{}」で制約「{}」が衝突しています。使う指示を選び直すか、レシピの条件を修正してください。",
                            recipes.iter().find(|r| &r.revision_id == source).map(|r|r.name.as_str()).unwrap_or("別のレシピ"), recipe.name, constraint.key
                        ),
                        revision_ids: vec![source.clone(), recipe.revision_id.clone()],
                    });
                }
            } else {
                constraints.insert(
                    constraint.key.clone(),
                    (constraint.value, recipe.revision_id.clone()),
                );
            }
            if constraint.key == "execution.required"
                && constraint.value
                && project.environment == "chat"
            {
                diagnostics.push(Diagnostic {
                    kind: "incompatible".into(),
                    message: "チャットのみの環境では実行確認できません。".into(),
                    revision_ids: vec![recipe.revision_id.clone()],
                });
            }
        }
        if recipe.constraints.is_empty() {
            diagnostics.push(Diagnostic {
                kind: "unchecked".into(),
                message: format!("「{}」の自由文の意味検査は未実施です。", recipe.name),
                revision_ids: vec![recipe.revision_id.clone()],
            });
        }
        let mut values = BTreeMap::new();
        for variable in &recipe.variables {
            if let Some(previous) = variables.iter().find(|v| v.name == variable.name) {
                if previous.default != variable.default || previous.required != variable.required {
                    diagnostics.push(Diagnostic {
                        kind: "conflict".into(),
                        message: format!("変数「{}」の定義が一致しません。", variable.name),
                        revision_ids: vec![recipe.revision_id.clone()],
                    });
                }
            } else {
                variables.push(variable.clone());
            }
            let value = supplied.get(&variable.name).cloned().or_else(|| {
                if variable.name == "reference" && !project.reference.is_empty() {
                    Some(project.reference.clone())
                } else {
                    variable.default.clone()
                }
            });
            if variable.required && value.as_ref().is_none_or(|v| v.trim().is_empty()) {
                diagnostics.push(Diagnostic {
                    kind: "missing".into(),
                    message: format!("「{}」を入力してください。", variable.name),
                    revision_ids: vec![recipe.revision_id.clone()],
                });
            }
            values.insert(
                variable.name.clone(),
                value.unwrap_or_else(|| format!("{{{{{}}}}}", variable.name)),
            );
        }
        // Traverse the source once. Inserted material is never interpreted as a template.
        let mut rest = recipe.body.as_str();
        let mut expanded = String::new();
        while let Some(start) = rest.find("{{") {
            bounded_append(&mut expanded, &rest[..start])?;
            let after = &rest[start + 2..];
            let end = after
                .find("}}")
                .ok_or_else(|| Error::new("placeholder", "変数の形式が不正です。"))?;
            bounded_append(
                &mut expanded,
                values
                    .get(&after[..end])
                    .ok_or_else(|| Error::new("variables", "変数が定義されていません。"))?,
            )?;
            rest = &after[end + 2..];
        }
        bounded_append(&mut expanded, rest)?;
        total_size += expanded.len();
        if total_size > MAX_TEXT {
            return Err(Error::new(
                "output_limit",
                "展開した指示が256 KiBを超えています。",
            ));
        }
        bodies.push(format!("【{}】\n{}", recipe.name, expanded));
    }
    let body = format!(
        "【プロジェクト】{}\n【利用環境】{}\n\n{}",
        project.name,
        if project.environment == "chat" {
            "チャットのみ"
        } else {
            "コード参照あり"
        },
        bodies.join("\n\n")
    );
    text_limit(&body)?;
    let blocked = revision_ids.is_empty()
        || diagnostics
            .iter()
            .any(|d| ["conflict", "incompatible", "missing"].contains(&d.kind.as_str()));
    let hash_input = serde_json::to_vec(&(body.as_str(), &revision_ids, &diagnostics))
        .map_err(|_| Error::new("serialization", "指示の確認に失敗しました。"))?;
    let hash = format!("{:x}", Sha256::digest(hash_input));
    Ok(Composition {
        body,
        hash,
        revision_ids,
        variables,
        diagnostics,
        blocked,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn navigation_rejects_external_and_release_loopback() {
        assert!(navigation_allowed("tauri", Some("localhost"), None, false));
        assert!(navigation_allowed(
            "https",
            Some("tauri.localhost"),
            None,
            false
        ));
        assert!(navigation_allowed(
            "http",
            Some("127.0.0.1"),
            Some(1420),
            true
        ));
        for (scheme, host, port) in [
            ("https", Some("example.com"), None),
            ("https", Some("tauri.localhost.evil.test"), None),
            ("http", Some("127.0.0.1"), Some(1420)),
            ("file", None, None),
            ("data", None, None),
            ("tauri", Some("evil.test"), None),
        ] {
            assert!(!navigation_allowed(scheme, host, port, false));
        }
        assert!(!navigation_allowed(
            "http",
            Some("127.0.0.1"),
            Some(9000),
            true
        ));
    }
    fn recipe(body: &str) -> Recipe {
        Recipe {
            id: "r".into(),
            revision_id: "v1".into(),
            version: 1,
            parent_revision_id: None,
            name: "例".into(),
            description: "".into(),
            body: body.into(),
            builtin: false,
            variables: names(body)
                .expect("fixture")
                .into_iter()
                .map(|name| Variable {
                    name,
                    required: true,
                    default: None,
                })
                .collect(),
            constraints: vec![],
            lesson: None,
            actions: vec![],
            goals: vec![],
        }
    }
    fn project() -> Project {
        Project {
            id: "p".into(),
            name: "例".into(),
            environment: "code".into(),
            reference: "".into(),
            assignment: vec![],
            version: 1,
        }
    }
    #[test]
    fn bounds_output_before_allocating_repeated_material() {
        let r = recipe("{{x}}{{x}}");
        let values = BTreeMap::from([("x".into(), "a".repeat(MAX_TEXT))]);
        assert_eq!(
            compose(&[r], &project(), &values).expect_err("large").code,
            "output_limit"
        );
    }
    #[test]
    fn repeated_variables_have_one_input() {
        assert_eq!(names("{{a}}日本語{{a}}").expect("valid"), vec!["a"]);
    }
    #[test]
    fn rejects_malformed_templates() {
        assert!(names("{{a").is_err());
        assert!(names("{{$(x)}}").is_err());
    }
    #[test]
    fn does_not_expand_material_recursively() {
        let out = compose(
            &[recipe("{{log}}")],
            &project(),
            &BTreeMap::from([("log".into(), "{{secret}}".into())]),
        )
        .expect("valid");
        assert!(out.body.contains("{{secret}}"));
        assert!(!out.blocked);
    }
    #[test]
    fn missing_required_blocks_copy() {
        assert!(
            compose(&[recipe("{{log}}")], &project(), &BTreeMap::new())
                .expect("valid")
                .blocked
        );
    }
    #[test]
    fn detects_conflicts_without_dropping_instructions() {
        let mut a = recipe("承認を待つ");
        a.constraints = vec![Constraint {
            key: "approval.before_implementation".into(),
            value: true,
        }];
        let mut b = a.clone();
        b.revision_id = "v2".into();
        b.body = "承認不要".into();
        b.constraints[0].value = false;
        let out = compose(&[a, b], &project(), &BTreeMap::new()).expect("valid");
        assert!(out.blocked);
        assert!(out.body.contains("承認不要"));
    }
    #[test]
    fn deduplicates_only_the_same_revision() {
        let a = recipe("文");
        let out = compose(&[a.clone(), a], &project(), &BTreeMap::new()).expect("valid");
        assert_eq!(out.revision_ids.len(), 1);
    }
    #[test]
    fn rejects_inconsistent_variable_definitions() {
        let a = recipe("{{x}}");
        let mut b = a.clone();
        b.revision_id = "v2".into();
        b.variables[0].required = false;
        assert!(
            compose(&[a, b], &project(), &BTreeMap::new())
                .expect("valid")
                .blocked
        );
    }
    #[test]
    fn execution_is_not_claimed_in_chat() {
        let mut r = recipe("テストを実行");
        r.constraints = vec![Constraint {
            key: "execution.required".into(),
            value: true,
        }];
        let mut p = project();
        p.environment = "chat".into();
        assert!(compose(&[r], &p, &BTreeMap::new()).expect("valid").blocked);
    }
}
