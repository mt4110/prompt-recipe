fn main() {
    #[cfg(feature = "desktop")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "dispatch",
            "copy_prompt",
            "palette_action",
            "shortcut_status",
            "read_material",
            "open_repository",
            "save_export",
        ]),
    ))
    .expect("failed to validate Tauri build configuration");
}
