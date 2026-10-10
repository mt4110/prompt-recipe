use prompt_recipe::domain::{compose, validate_recipe, Catalog, Project};
use std::collections::{BTreeMap, BTreeSet};

const PACK: &str = include_str!("../../content/packs/resource-efficiency.json");

fn pack() -> Catalog {
    serde_json::from_str(PACK).expect("resource efficiency catalog must match the domain schema")
}

#[test]
fn shared_pack_is_bounded_and_valid_without_revising_existing_recipes() {
    assert!(PACK.len() < 1024 * 1024);
    let pack = pack();
    assert_eq!(pack.schema_version, 2);
    assert_eq!(pack.recipes.len(), 9);
    let mut ids = BTreeSet::new();
    let mut revisions = BTreeSet::new();
    for recipe in &pack.recipes {
        validate_recipe(recipe).expect("valid shared recipe");
        assert!(ids.insert(recipe.id.clone()));
        assert!(revisions.insert(recipe.revision_id.clone()));
        assert!(!recipe.builtin, "shared pack must remain explicitly imported");
        assert_eq!(recipe.version, 1);
        assert!(recipe.parent_revision_id.is_none());
        assert!(recipe.variables.is_empty());
        assert!(recipe.constraints.is_empty(), "free-text advice is not a machine-enforced permission");
        let lesson = recipe.lesson.as_ref().expect("rereadable lesson metadata");
        assert!(lesson.evidence.contains("未検証"));
    }
    for source in [
        include_str!("../../content/catalog-v1.json"),
        include_str!("../../content/catalog.json"),
    ] {
        let existing: Catalog = serde_json::from_str(source).expect("existing catalog");
        for recipe in existing.recipes {
            assert!(!ids.contains(&recipe.id));
            assert!(!revisions.contains(&recipe.revision_id));
        }
    }
}

#[test]
fn shared_recipes_compose_individually_without_missing_variables_or_false_enforcement() {
    let project = Project {
        id: "efficiency-test".into(),
        name: "Efficiency fixture".into(),
        environment: "chat".into(),
        reference: String::new(),
        assignment: vec![],
        version: 1,
    };
    for recipe in pack().recipes {
        let body = recipe.body.clone();
        let result = compose(&[recipe], &project, &BTreeMap::new()).expect("composition");
        assert!(!result.blocked);
        assert!(result.variables.is_empty());
        assert!(result.body.contains(&body));
        assert!(result.diagnostics.iter().any(|d| d.kind == "unchecked"));
        assert!(result.diagnostics.iter().all(|d| d.kind == "unchecked"));
    }
}

#[test]
fn global_excerpt_is_small_and_has_a_single_managed_boundary() {
    let excerpt = include_str!("../../examples/agents/resource-efficiency.md");
    assert!(excerpt.len() < 8 * 1024, "Global excerpt must stay bounded in bytes, not claimed tokens");
    assert_eq!(excerpt.matches("<!-- prompt-recipe:resource-efficiency:start -->").count(), 1);
    assert_eq!(excerpt.matches("<!-- prompt-recipe:resource-efficiency:end -->").count(), 1);
    assert!(!excerpt.contains("/Users/"));
}
