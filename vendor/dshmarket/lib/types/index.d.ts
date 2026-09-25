/**
 * dsh-market host entry: mounts the market's HTTP routes once the profile
 * composes the webServer and shell services.
 */
import type { Context, Volatile } from '@deepseek-ai/cordis';
import type z from '@deepseek-ai/schemastery';
export declare const name = "dsh-market";
/** Optional cordis.yml configuration; profile defaults to `web`. */
export interface Config { profile?: string; allowRestart?: Volatile<boolean | undefined>; maxSnapshots?: number }
export declare const Config: z<Config>;
export declare function apply(ctx: Context, config?: Config): void;
