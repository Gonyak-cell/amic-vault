#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
APP_NAME="AMIC Vault"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE22_BIN="/Users/jws/.hermes/node/bin"

if [[ -d "$NODE22_BIN" ]]; then
  export PATH="$NODE22_BIN:$PATH"
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "Rust/Cargo is required for Desktop Phase 3 Tauri build." >&2
  echo "Install Rust with rustup, then rerun ./script/build_and_run.sh." >&2
  exit 69
fi

export AMIC_VAULT_DESKTOP_ORIGIN_CONFIG="${AMIC_VAULT_DESKTOP_ORIGIN_CONFIG:-$ROOT_DIR/apps/desktop/src-tauri/config/local.signed.json}"

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

pnpm --filter @amic-vault/desktop tauri:build

APP_BUNDLE="$(find "$ROOT_DIR/apps/desktop/src-tauri/target/release/bundle/macos" -maxdepth 1 -name '*.app' -print -quit 2>/dev/null || true)"
APP_BINARY="$(find "$ROOT_DIR/apps/desktop/src-tauri/target/release" -maxdepth 1 -type f -perm -111 -name 'amic-vault-desktop' -print -quit 2>/dev/null || true)"

open_app() {
  if [[ -n "$APP_BUNDLE" ]]; then
    /usr/bin/open -n "$APP_BUNDLE"
    return
  fi
  if [[ -n "$APP_BINARY" ]]; then
    "$APP_BINARY" &
    return
  fi
  echo "Built Tauri app artifact was not found." >&2
  exit 70
}

case "$MODE" in
  run)
    open_app
    ;;
  --debug|debug)
    if [[ -z "$APP_BINARY" ]]; then
      echo "Tauri debug binary was not found." >&2
      exit 70
    fi
    lldb -- "$APP_BINARY"
    ;;
  --logs|logs)
    open_app
    /usr/bin/log stream --info --style compact --predicate "process CONTAINS \"AMIC\""
    ;;
  --telemetry|telemetry)
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"com.amicvault.desktop\""
    ;;
  --verify|verify)
    open_app
    sleep 2
    pgrep -if "AMIC Vault|amic-vault-desktop" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
