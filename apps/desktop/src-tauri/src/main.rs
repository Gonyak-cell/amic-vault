#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use amic_vault_desktop::origin::OriginConfig;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    let vault_url = match OriginConfig::load_from_env().and_then(|config| config.vault_url()) {
        Ok(url) => url,
        Err(message) => {
            eprintln!(
                "AMIC_VAULT_DESKTOP_START_BLOCKED: {}",
                startup_block_reason(&message)
            );
            std::process::exit(78);
        }
    };

    tauri::Builder::default()
        .setup(move |app| {
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

fn startup_block_reason(message: &str) -> &'static str {
    if message.contains("AMIC_VAULT_DESKTOP_ORIGIN_CONFIG is required") {
        return "MISSING_ORIGIN_CONFIG";
    }
    if message.contains("signature") {
        return "INVALID_ORIGIN_SIGNATURE";
    }
    "ORIGIN_CONFIG_REJECTED"
}
