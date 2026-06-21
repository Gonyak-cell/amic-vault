use std::net::IpAddr;
use url::Url;

const EXTERNAL_IDP_HOSTS: &[&str] = &[
    "login.microsoftonline.com",
    "accounts.google.com",
    "login.okta.com",
    "okta.com",
    "auth0.com",
];

pub fn is_allowed_navigation(approved_origin: &Url, next_url: &Url) -> bool {
    if !next_url.username().is_empty() || next_url.password().is_some() {
        return false;
    }

    approved_origin.scheme() == next_url.scheme()
        && normalized_host(approved_origin) == normalized_host(next_url)
        && approved_origin.port_or_known_default() == next_url.port_or_known_default()
}

pub fn reject_disallowed_remote_origin(url: &Url, channel: &str) -> Result<(), String> {
    if is_private_or_local_endpoint(url) {
        return Err(format!("{channel} origin must not be private or local"));
    }
    if is_external_idp_origin(url) {
        return Err(format!(
            "{channel} origin must not be an external identity provider"
        ));
    }
    Ok(())
}

fn normalized_host(url: &Url) -> Option<String> {
    url.host_str().map(|host| host.to_ascii_lowercase())
}

fn is_external_idp_origin(url: &Url) -> bool {
    let Some(host) = normalized_host(url) else {
        return false;
    };
    EXTERNAL_IDP_HOSTS
        .iter()
        .any(|idp_host| host == *idp_host || host.ends_with(&format!(".{idp_host}")))
}

fn is_private_or_local_endpoint(url: &Url) -> bool {
    let Some(host) = normalized_host(url) else {
        return true;
    };

    if host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") {
        return true;
    }

    let ip_host = host.trim_start_matches('[').trim_end_matches(']');

    match ip_host.parse::<IpAddr>() {
        Ok(IpAddr::V4(address)) => {
            address.is_private()
                || address.is_loopback()
                || address.is_link_local()
                || address.is_unspecified()
        }
        Ok(IpAddr::V6(address)) => {
            let first_segment = address.segments()[0];
            address.is_loopback()
                || address.is_unspecified()
                || (first_segment & 0xfe00) == 0xfc00
                || (first_segment & 0xffc0) == 0xfe80
        }
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::{is_allowed_navigation, reject_disallowed_remote_origin};
    use url::Url;

    fn parse(url: &str) -> Url {
        Url::parse(url).expect("test URL should parse")
    }

    #[test]
    fn allows_navigation_within_approved_origin() {
        let approved = parse("https://vault.example.com/");
        let next = parse("https://vault.example.com/matters/123?source=tauri");
        assert!(is_allowed_navigation(&approved, &next));
    }

    #[test]
    fn rejects_navigation_to_different_origin() {
        let approved = parse("https://vault.example.com/");
        assert!(!is_allowed_navigation(
            &approved,
            &parse("https://evil.example.com/")
        ));
        assert!(!is_allowed_navigation(
            &approved,
            &parse("http://vault.example.com/")
        ));
    }

    #[test]
    fn rejects_navigation_with_credentials() {
        let approved = parse("https://vault.example.com/");
        assert!(!is_allowed_navigation(
            &approved,
            &parse("https://user:pass@vault.example.com/")
        ));
    }

    #[test]
    fn rejects_private_and_local_remote_origins() {
        for origin in [
            "https://localhost",
            "https://127.0.0.1",
            "https://10.0.0.12",
            "https://192.168.0.12",
            "https://[fd00::1]",
            "https://vault.internal.local",
        ] {
            assert!(
                reject_disallowed_remote_origin(&parse(origin), "staging").is_err(),
                "{origin} should be rejected"
            );
        }
    }

    #[test]
    fn rejects_external_identity_provider_origins() {
        for origin in [
            "https://login.microsoftonline.com",
            "https://accounts.google.com",
            "https://tenant.okta.com",
            "https://example.auth0.com",
        ] {
            assert!(
                reject_disallowed_remote_origin(&parse(origin), "staging").is_err(),
                "{origin} should be rejected"
            );
        }
    }
}
