use prompt_recipe::domain::{compose, validate_recipe, Catalog, Project};
use std::collections::{BTreeMap, BTreeSet};

fn pack() -> Catalog {
    serde_json::from_str(include_str!("../../content/packs/resource-efficiency.json"))
        .expect("resource-efficiency catalog")
}

#[test]
fn resource_pack_uses_the_actual_recipe_validator_without_builtin_id_collisions() {
    let pack = pack();
    assert_eq!(pack.schema_version, 2);
    assert_eq!(pack.recipes.len(), 9);
    let mut ids = BTreeSet::new();
    let mut revisions = BTreeSet::new();
    for recipe in &pack.recipes {
        validate_recipe(recipe).expect("valid resource-efficiency recipe");
        assert!(!recipe.builtin);
        assert!(ids.insert(recipe.id.clone()));
        assert!(revisions.insert(recipe.revision_id.clone()));
    }
    for source in [
        include_str!("../../content/catalog-v1.json"),
        include_str!("../../content/catalog.json"),
    ] {
        let bundled: Catalog = serde_json::from_str(source).expect("bundled catalog");
        for recipe in &bundled.recipes {
            assert!(!ids.contains(&recipe.id));
            assert!(!revisions.contains(&recipe.revision_id));
        }
    }
}

#[test]
fn composing_a_selected_recipe_does_not_copy_its_lesson_or_hide_unchecked_semantics() {
    let project = Project {
        id: "resource-test".into(),
        name: "Resource test".into(),
        environment: "chat".into(),
        reference: String::new(),
        assignment: Vec::new(),
        version: 1,
    };
    for recipe in pack().recipes {
        let result = compose(std::slice::from_ref(&recipe), &project, &BTreeMap::new())
            .expect("composition");
        assert!(!result.blocked);
        assert!(result.body.contains(&recipe.body));
        assert!(!result.body.contains(&recipe.lesson.as_ref().expect("lesson").why));
        assert!(result.diagnostics.iter().any(|item| item.kind == "unchecked"));
    }
}
