/**
 * dsh-skin-desktop client half types: curated skins, the settings rows, and
 * the client plugin body. Persistence uses `window.dshDesktopTheme` when the
 * Electron preload bridge is present and falls back to dsh-skin's web keys.
 */
import type { Context } from "@deepseek-ai/cordis";
import type { ThemeDefinition } from "@deepseek-ai/dsh-client-ui-theme/client";
/** One selectable skin (a registered third-party theme). */
export declare const SKINS: readonly ThemeDefinition[];
/** The settings row's locale namespace. */
export declare const SETTINGS_NS: "settings.skin-desktop";
/** Sentinel meaning "follow the built-in appearance/system scheme". */
export declare const DEFAULT_SKIN: "system";
/** Required services (cordis fiber inject). */
export declare const inject: string[];
/** Client plugin body: register skins, restore the saved skin, mount the picker row. */
export declare function apply(ctx: Context): void;
