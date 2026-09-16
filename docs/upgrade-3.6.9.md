# 3.6.9 upgrade decisions

Checked official GitHub releases and npm metadata on 2026-09-16. DSH's latest published tag remains dsh-v0.1.6-alpha.1 (0a15e36e7f82b6ed45af6fa9759f29b40dcd965d). Master has additional unreleased work; this release retains the published core and matching official packages.

| Component | Before | 3.6.9 |
|---|---|---|
| DSH / official Teams | 0.1.6-alpha.1 | unchanged, latest published |
| Univer Office | 0.3.0 | unchanged, latest published |
| Plugin market | 1.10.1 | 1.47.0 with preserved desktop/managed-plugin boundaries |
| AnySearch | 0.1.1 | 0.1.4, native search/fetch API checked on alpha.1 |
| Super injector | 0.3.1 | 0.3.3, legacy settings renderer remains disabled |
| Router Standard | b39112d | unchanged, current upstream head |
| GenUI / vision router | retired | remain outside factory distribution |

IM 4.21.2 and mail 0.10.7 were visible in npm. They are optional user installations, not factory core bundles; no user profile is mutated by the release work. Availability is not a claim that every optional plugin's external account workflow has been tested.

Research is implemented as a concise `systemPrompt.context` addition plus the file-delivery skill and targeted report guidance. No Claude tool names, platform assumptions or automatic long-term memory are transplanted. The core stays clean. Ordinary tasks remain ordinary; optional professional depth and manual templates keep their existing controls.

Professional depth records final bytes and hashes, checks OOXML ZIP directories/CRCs/document parts, parses PDF page structures, rejects renamed legacy Office files, and distinguishes unsupported formats from checked formats. These checks do not certify professional correctness, rendered layout or editing; the skill explicitly requires appropriate viewer/render/save/reopen evidence and native present delivery. File changes invalidate earlier check evidence as before.

Report routing now excludes reading, summarizing, translating, explanations and report-generation troubleshooting examples. Creation/revision still activates huashu-report only from actual human input; references load as needed and tender specifications retain priority.

Sources: https://github.com/deepseek-ai/deepseek-harness/releases ; https://github.com/dream-num/dsh-univer-office/releases ; https://github.com/dsh-market/dsh-market ; https://github.com/anysearch-team/anysearch-dsh/releases/tag/v0.1.4 ; https://github.com/yjh051108/dsh-super-injector/releases/tag/v0.3.3 . Exact package integrity is retained in vendor/core-plugins.pin.json.
