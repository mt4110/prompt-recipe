#[cfg(test)]
mod tests {
    use glib::variant::ToVariant;

    #[derive(Clone, Debug, PartialEq, glib::Boxed)]
    #[boxed_type(name = "PromptRecipeSecurityProbe")]
    struct Probe(String);

    #[test]
    fn migrated_macro_expands_and_preserves_boxed_values() {
        use glib::value::ToValue;
        let probe = Probe("日本語".into());
        assert_eq!(probe.to_value().get::<Probe>().unwrap(), probe);
    }

    #[test]
    fn string_array_iteration_preserves_values_and_boundaries() {
        let values = ["電話: 03-1234-5678", "", "日本語", "last"];
        let variant = values.to_variant();
        let mut iter = variant.array_iter_str().unwrap();
        assert_eq!(iter.next(), Some(values[0]));
        assert_eq!(iter.next_back(), Some(values[3]));
        assert_eq!(iter.next(), Some(values[1]));
        assert_eq!(iter.next_back(), Some(values[2]));
        assert_eq!(iter.next(), None);
        assert_eq!(iter.next_back(), None);
        assert_eq!(
            variant.array_iter_str().unwrap().collect::<Vec<_>>(),
            values
        );
        assert_eq!(variant.array_iter_str().unwrap().nth(2), Some(values[2]));
        assert_eq!(
            variant.array_iter_str().unwrap().nth_back(2),
            Some(values[1])
        );
        assert_eq!(variant.array_iter_str().unwrap().last(), Some(values[3]));
    }

    #[test]
    fn empty_string_array_iterator_is_exhausted() {
        let variant = Vec::<&str>::new().to_variant();
        let mut iter = variant.array_iter_str().unwrap();
        assert_eq!(iter.next(), None);
        assert_eq!(iter.next_back(), None);
    }
}
