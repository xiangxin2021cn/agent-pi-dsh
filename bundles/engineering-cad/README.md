# CAD tool plugin

`cad_read` is independently registered through the native DSH tool interface. `inventory` returns complete counts and paginated layer/layout/block catalogs, then `query` retrieves full record pages or expanded instance pages. Repeat with `sourceHash` from the inventory to reject changed source versions.

The reader accepts actual execution-session workspace DWG/DXF paths, validates real paths (including conversion-cache parents), and rejects symlink traversal. DWG uses the existing `convertDwgToDxf` without changing the original. Source and derived hashes remain separate. External references are listed as missing, outside workspace, or present but not loaded; they are not silently read outside the scope. Size limits reject whole files rather than clipping text.

When engineering is active, `recordObservation` stores only layout/layer directory metadata, counts and gaps; no entity dump enters the shared ledger. The result states whether synchronization succeeded. Observation is not professional review or acceptance. The professional capability registration follows plugin lifecycle.

Real local project validation on 2026-10-05 used the existing pump-room DWG (SHA256 `0293a8467ae2657fae4a9414eaeb5d6b0a9357a0fc6802ed1de1c0da25de378b`); the original hash was unchanged. Its converted DXF yielded 142,696 entity records: 17,915 model-space, 0 paper-space and 124,781 in block definitions (799 auxiliary VERTEX/SEQEND records overall), 221 layers, 3 layouts, and 2,756 blocks. Native decoder unknown entities/objects: 0 in the converted DXF; 10 OLE2FRAME records need separate inspection; XREF records: 0. Expansion reached the explicit 200,000-instance budget and was correctly marked incomplete. These counts do not prove original DWG proprietary objects survived conversion or that engineering takeoff is complete. Full source records remain pageable. Actual drawings are not packaged as fixtures.

Re-run with `node bundles/engineering-cad/tests/real-cad-smoke.mjs <workspace> <drawing-relative-path>`; the command verifies the original hash before/after reading. See the core README for coordinate semantics and limitations.
