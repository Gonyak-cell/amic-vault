#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use amic_vault_desktop::{origin::OriginConfig, origin_guard::is_allowed_navigation};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(move |app| {
            let bundled_origin_config = app
                .path()
                .resource_dir()
                .map(|resource_dir| resource_dir.join("origin.signed.json"))
                .unwrap_or_else(|error| {
                    block_startup(&format!("failed to locate bundled origin config: {error}"))
                });
            let (approved_origin, vault_url) =
                OriginConfig::load_from_env_or_path(&bundled_origin_config)
                    .and_then(|config| {
                        let approved_origin = config.approved_origin()?;
                        let vault_url = config.vault_url()?;
                        Ok((approved_origin, vault_url))
                    })
                    .unwrap_or_else(|message| block_startup(&message));

            let navigation_origin = approved_origin.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(vault_url))
                .title("AMIC Vault")
                .inner_size(1280.0, 860.0)
                .min_inner_size(1024.0, 720.0)
                .resizable(true)
                .on_navigation(move |url| {
                    let allowed = is_allowed_navigation(&navigation_origin, url);
                    if !allowed {
                        eprintln!("AMIC_VAULT_DESKTOP_NAV_BLOCKED: UNAPPROVED_ORIGIN");
                    }
                    allowed
                })
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

fn block_startup(message: &str) -> ! {
    eprintln!(
        "AMIC_VAULT_DESKTOP_START_BLOCKED: {}",
        startup_block_reason(message)
    );
    std::process::exit(78);
}

fn startup_block_reason(message: &str) -> &'static str {
    if message.contains("AMIC_VAULT_DESKTOP_ORIGIN_CONFIG is required")
        || message.contains("bundled origin config is unavailable")
        || message.contains("failed to locate bundled origin config")
    {
        return "MISSING_ORIGIN_CONFIG";
    }
    if message.contains("signature") {
        return "INVALID_ORIGIN_SIGNATURE";
    }
    "ORIGIN_CONFIG_REJECTED"
}
