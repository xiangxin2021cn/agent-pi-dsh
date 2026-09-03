throw new Error(
  'release/push-workflow.mjs is retired and intentionally fails closed. ' +
  'For v3.6.0, first run `node release/publish-v3.6.0-release.mjs --create-draft`, then ' +
  '`powershell -File scripts/publish-win-and-trigger-platforms.ps1 -Tag v3.6.0`; ' +
  'that script dispatches build-desktop-assets.yml from the exact tag. After all assets ' +
  'verify, run the publisher with `--publish`. This helper must not commit workflows to ' +
  'or dispatch them from the default branch.',
)
