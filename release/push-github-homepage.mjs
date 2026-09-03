throw new Error(
  'release/push-github-homepage.mjs is retired and intentionally fails closed. ' +
  'README.md must be updated through the normal reviewed branch/PR flow; ' +
  'use `node release/publish-v3.6.0-release.mjs --create-draft` and `--publish` ' +
  'for the gated v3.6.0 Release flow. ' +
  'This helper must not write the default branch directly.',
)
