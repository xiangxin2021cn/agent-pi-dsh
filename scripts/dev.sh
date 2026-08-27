#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSH="$ROOT/vendor/deepseek-harness"
export DSH_HOME="$ROOT/.dsh-home"
export DSH_CHECKOUT="$DSH"
export DSH_BUNDLED_SKILL_DIR="$ROOT/skills"
mkdir -p "$DSH_HOME"
cd "$DSH"
if [[ ! -d node_modules ]]; then
  corepack enable
  pnpm install
fi
# Seed in-box web-app into the tender profile, then link local bundles.
PROFILE="$DSH_HOME/profiles/tender"
mkdir -p "$PROFILE"
python - <<'PY' || true
print("see scripts/init-tender-profile.ps1 on Windows")
PY
pnpm dsh plugin --profile tender add "$ROOT/bundles/tender-host"
pnpm dsh plugin --profile tender add "$ROOT/bundles/tender-web"
if [[ "${1:-}" == "--dump-only" ]]; then
  exec pnpm dsh --profile tender --dump-config
fi
exec pnpm dsh --profile tender
