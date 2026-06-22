use crate::origin_guard::reject_disallowed_remote_origin;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::Deserialize;
use std::{env, fs, path::Path};
use url::Url;

pub const CONFIG_PATH_ENV: &str = "AMIC_VAULT_DESKTOP_ORIGIN_CONFIG";
const SIGNING_PUBLIC_KEY_B64: &str = "Zq8zUIIX+J++3wVfw4VgyCvgMe4spb2fHdd3qoMTPAE=";

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OriginConfig {
    pub schema_version: u8,
    pub release_channel: String,
    pub origin_ref: String,
    pub origin: String,
    pub signature: String,
}

impl OriginConfig {
    pub fn load_from_env() -> Result<Self, String> {
        let path = env::var(CONFIG_PATH_ENV)
            .map_err(|_| format!("{CONFIG_PATH_ENV} is required for the desktop shell"))?;
        Self::load_from_path(path)
    }

    pub fn load_from_env_or_path(fallback_path: &Path) -> Result<Self, String> {
        if env::var_os(CONFIG_PATH_ENV).is_some() {
            return Self::load_from_env();
        }
        Self::load_from_path(fallback_path).map_err(|error| {
            format!(
                "{CONFIG_PATH_ENV} is required or bundled origin config is unavailable: {error}"
            )
        })
    }

    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self, String> {
        let content = fs::read_to_string(path.as_ref())
            .map_err(|error| format!("failed to read origin config: {error}"))?;
        let config: OriginConfig = serde_json::from_str(&content)
            .map_err(|error| format!("invalid origin config: {error}"))?;
        config.verify_signature()?;
        config.validate_origin()?;
        Ok(config)
    }

    pub fn vault_url(&self) -> Result<Url, String> {
        let mut url = self.approved_origin()?;
        url.set_path("/dashboard");
        url.set_query(Some("source=tauri"));
        url.set_fragment(None);
        Ok(url)
    }

    pub fn approved_origin(&self) -> Result<Url, String> {
        self.validate_origin()
    }

    pub fn verify_signature(&self) -> Result<(), String> {
        if self.schema_version != 1 {
            return Err("origin config schemaVersion must be 1".to_string());
        }

        let public_key = STANDARD
            .decode(SIGNING_PUBLIC_KEY_B64)
            .map_err(|error| format!("invalid signing public key: {error}"))?;
        let public_key: [u8; 32] = public_key
            .try_into()
            .map_err(|_| "signing public key must be 32 bytes".to_string())?;
        let verifying_key = VerifyingKey::from_bytes(&public_key)
            .map_err(|error| format!("invalid public key: {error}"))?;

        let signature = STANDARD
            .decode(&self.signature)
            .map_err(|error| format!("invalid config signature: {error}"))?;
        let signature: [u8; 64] = signature
            .try_into()
            .map_err(|_| "config signature must be 64 bytes".to_string())?;
        let signature = Signature::from_bytes(&signature);

        verifying_key
            .verify(self.signature_payload().as_bytes(), &signature)
            .map_err(|_| "origin config signature verification failed".to_string())
    }

    pub fn validate_origin(&self) -> Result<Url, String> {
        validate_origin_ref(&self.origin_ref)?;
        let url =
            Url::parse(&self.origin).map_err(|error| format!("invalid origin URL: {error}"))?;
        if !url.username().is_empty() || url.password().is_some() {
            return Err("origin URL must not contain credentials".to_string());
        }
        if url.query().is_some() || url.fragment().is_some() {
            return Err("origin URL must not contain query or fragment".to_string());
        }
        if url.path() != "/" {
            return Err("origin URL must be an origin, not an application path".to_string());
        }

        match self.release_channel.as_str() {
            "local" => {
                if self.origin_ref != "LOCAL-DEV" {
                    return Err("local origin config must use LOCAL-DEV originRef".to_string());
                }
                if !is_local_http_origin(&url) {
                    return Err(
                        "local origin must be http://localhost:<port> or http://127.0.0.1:<port>"
                            .to_string(),
                    );
                }
            }
            "staging" => {
                if !self.origin_ref.starts_with("STAGE-") {
                    return Err("staging originRef must start with STAGE-".to_string());
                }
                require_https(&url, "staging")?;
                reject_disallowed_remote_origin(&url, "staging")?;
            }
            "pilot" => {
                if !self.origin_ref.starts_with("PILOT-") {
                    return Err("pilot originRef must start with PILOT-".to_string());
                }
                require_https(&url, "pilot")?;
                reject_disallowed_remote_origin(&url, "pilot")?;
            }
            "production" => {
                if !self.origin_ref.starts_with("PROD-") {
                    return Err("production originRef must start with PROD-".to_string());
                }
                require_https(&url, "production")?;
                reject_disallowed_remote_origin(&url, "production")?;
            }
            _ => {
                return Err(
                    "releaseChannel must be local, staging, pilot, or production".to_string(),
                )
            }
        }

        Ok(url)
    }

    fn signature_payload(&self) -> String {
        format!(
            "schemaVersion={}\nreleaseChannel={}\noriginRef={}\norigin={}\n",
            self.schema_version, self.release_channel, self.origin_ref, self.origin
        )
    }
}

fn validate_origin_ref(origin_ref: &str) -> Result<(), String> {
    if !(2..=120).contains(&origin_ref.len()) {
        return Err("originRef length is outside the allowed range".to_string());
    }
    if !origin_ref.chars().all(|character| {
        character.is_ascii_uppercase()
            || character.is_ascii_digit()
            || matches!(character, '-' | '_' | '.' | '/')
    }) {
        return Err("originRef contains unsupported characters".to_string());
    }
    Ok(())
}

fn is_local_http_origin(url: &Url) -> bool {
    if url.scheme() != "http" {
        return false;
    }
    matches!(url.host_str(), Some("localhost" | "127.0.0.1")) && url.port().is_some()
}

fn require_https(url: &Url, channel: &str) -> Result<(), String> {
    if url.scheme() != "https" {
        return Err(format!("{channel} origin must use https"));
    }
    if matches!(url.host_str(), Some("localhost" | "127.0.0.1") | None) {
        return Err(format!("{channel} origin must not be local"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::OriginConfig;

    fn signed_local_config() -> OriginConfig {
        OriginConfig {
            schema_version: 1,
            release_channel: "local".to_string(),
            origin_ref: "LOCAL-DEV".to_string(),
            origin: "http://localhost:3000".to_string(),
            signature: "BnP37iB+8EiO4h0Gey1gLgbWpUizTlGwEcGXmnd+rWgLLZ+a+Ae6J3CdLTblupKbp4l7OrtdLnLEOqcy7pO4AQ=="
                .to_string(),
        }
    }

    fn local_config_with(origin: &str) -> OriginConfig {
        OriginConfig {
            origin: origin.to_string(),
            ..signed_local_config()
        }
    }

    fn staging_config_with(origin: &str) -> OriginConfig {
        OriginConfig {
            release_channel: "staging".to_string(),
            origin_ref: "STAGE-TEMP-TARGET-AWS-001".to_string(),
            origin: origin.to_string(),
            ..signed_local_config()
        }
    }

    fn pilot_config_with(origin: &str) -> OriginConfig {
        OriginConfig {
            release_channel: "pilot".to_string(),
            origin_ref: "PILOT-APPROVED-ORIGIN-001".to_string(),
            origin: origin.to_string(),
            ..signed_local_config()
        }
    }

    #[test]
    fn accepts_signed_local_origin() {
        let config = signed_local_config();
        config.verify_signature().expect("signature should verify");
        assert_eq!(
            config.vault_url().expect("origin should validate").as_str(),
            "http://localhost:3000/dashboard?source=tauri"
        );
    }

    #[test]
    fn loads_signed_origin_from_path() {
        let config_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("config")
            .join("local.signed.json");
        let config = OriginConfig::load_from_path(config_path).expect("fixture should load");
        assert_eq!(
            config.vault_url().expect("origin should validate").as_str(),
            "http://localhost:3000/dashboard?source=tauri"
        );
    }

    #[test]
    fn rejects_unsigned_or_tampered_origin() {
        let mut config = signed_local_config();
        config.origin = "http://localhost:3100".to_string();
        assert!(config.verify_signature().is_err());
    }

    #[test]
    fn rejects_http_staging_origin() {
        let config = staging_config_with("http://example.invalid");
        assert!(config.validate_origin().is_err());
    }

    #[test]
    fn accepts_public_https_pilot_origin_policy() {
        let config = pilot_config_with("https://vault.example.com");
        assert!(config.validate_origin().is_ok());
    }

    #[test]
    fn rejects_non_local_http_origin_for_local_channel() {
        let config = local_config_with("http://192.168.1.10:3000");
        assert!(config.validate_origin().is_err());
    }

    #[test]
    fn rejects_unknown_scheme() {
        let config = local_config_with("file:///tmp/amic-vault");
        assert!(config.validate_origin().is_err());
    }

    #[test]
    fn rejects_private_remote_origin() {
        let config = staging_config_with("https://10.0.0.8");
        assert!(config.validate_origin().is_err());
    }

    #[test]
    fn rejects_external_idp_as_vault_origin() {
        let config = staging_config_with("https://login.microsoftonline.com");
        assert!(config.validate_origin().is_err());
    }
}
