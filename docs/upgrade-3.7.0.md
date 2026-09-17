# 3.7.0 upgrade decisions

Checked official release and npm metadata on 2026-09-17. Continue the existing release branch; preserve the user's separate dirty main checkout.

## Kernel and plugins

DSH is pinned to official tag `dsh-v0.1.6-alpha.2`, commit `ddefc45fbc7f8e46dd73185e68295696d1297887`. Its tree is identical to the user-linked version commit `6b1808f432adfa96ab6c2f033e158ca230422e16`. The upstream source remains unmodified. Core and experimental Teams packages travel together from this tag.

The release adds native plugin lifecycle management, file-change/diff review, Office/URL/subagent/plan side previews, session-independent side conversations and startup diagnostics. It also fixes pi-ai image input, Windows shell flashes, inbox recovery and removes retired default model entries. Desktop transport migration remains outside this change; the current product file rail, Office editor and CAD viewer are retained.

| Component | Previous | 3.7.0 |
|---|---|---|
| DSH and official Teams | 0.1.6-alpha.1 | 0.1.6-alpha.2 |
| Univer Office | 0.3.0 | 0.3.2 |
| dshmarket | 1.47.0 | unchanged |
| AnySearch | 0.1.4 | unchanged |
| Super injector | 0.3.3 | unchanged |
| Router Standard | b39112dce54b90e67b50b166c2773861d7945d1f | unchanged |

Office 0.3.1 forwards Viewer session-ticket query parameters and preserves WebSocket frame types; 0.3.2 declares the two native worker dependencies missing from earlier npm manifests. The official host is now used unchanged. Browser startup exposed another change: DSH alpha.2 changed `conversation.chat.turnTail` from a chain to a list. The narrowly checked product adapter supplies an id/order and moves matching into the card component; unrelated turns render nothing. Host authorization, workspace scope and licensing are unchanged. Archive integrity and every materialized file hash are recorded by the existing vendor receipt.

## Product integration

- Read main selection from native `retainedBy.mainView`; navigate through `uiWorkspace`. Session creation by background agents cannot claim the no-session knowledge draft.
- Restrict product composer controls to the main conversation, preserving native sidebar composers. Header progress and harvested artifacts use their own session identity.
- Archived conversation viewing owns and releases a separate native session reference, avoiding global main-selection overrides.
- Keep ordinary chat, explicit knowledge selection, optional professional depth, manual templates, report skills and native prompt extension boundaries.
- Render relocated product sidebar controls through React portals so native collapse/unmount retains correct DOM ownership; keep language placement stable when native tooltips appear.
- Copy the supplied Studio logo unchanged to the brand assets. Only the sidebar footer uses it: 112px expanded, 32px collapsed. Product icons and hero logo retain their current identity. Exact reviewed HTTP/CSS changes are added to the CAD compatibility gate; CAD build inputs and original source provenance remain otherwise pinned.

## Verification record

Official core host/client/web builds passed. An isolated source UI startup exercised Word/Excel/PPT/Univer previews and spreadsheet edit/save/reopen using synthetic files, without an external model call. Expanded/collapsed/narrow sidebar layouts, explicit knowledge selection across new sessions, and independent archive viewing passed with Teams enabled. Codex provider wire tests passed for model and reasoning overrides. Runtime packaging and extracted installer verification are recorded separately in the release build receipt and local QA evidence. Tests use fresh temporary application/profile/workspace directories; the installed application and user plugin profiles are not modified.

Sources:
- https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.1.6-alpha.2
- https://github.com/deepseek-ai/deepseek-harness/commit/6b1808f432adfa96ab6c2f033e158ca230422e16
- https://github.com/dream-num/dsh-univer-office/releases/tag/v0.3.2
- https://github.com/dream-num/dsh-univer-office/releases/tag/v0.3.1
