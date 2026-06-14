#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use amic_vault_desktop::origin::OriginConfig;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let origin_config = OriginConfig::load_from_env()
                .map_err(|message| tauri::Error::Anyhow(anyhow::anyhow!(message)))?;
            let vault_url = origin_config
                .vault_url()
                .map_err(|message| tauri::Error::Anyhow(anyhow::anyhow!(message)))?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(vault_url))
                .title("AMIC Vault")
                .inner_size(1280.0, 860.0)
                .min_inner_size(1024.0, 720.0)
                .resizable(true)
                .build()?;

            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![])
        .run(tauri::generate_context!())
        .expect("error while running AMIC Vault Desktop");
}
