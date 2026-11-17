import { type Region } from './regions.ts';
/**
 * A package-like catalog name can point to the workspace root by mistake
 * (#1208). Check a commit's manifest before handing that root to the host:
 * Desktop can unpack it before refusing a package with no bundle.
 *
 * The curated catalog also lists entire collections (#18) and uses display
 * names for ordinary Git plugins. Only a declared workspace with no DSH
 * surface and a different root name gives enough evidence to refuse the add.
 */
export declare function mismatchedWorkspaceRoot(target: string, name: string, region: Region): Promise<string | null>;
