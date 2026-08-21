/**
 * dsh-skin-desktop host half types: pre-plugin index bootstrap.
 *
 * The host half reads the Electron shell's persisted theme document and
 * injects the saved skin into the served index, so the first paint already
 * carries the selected skin. Without a desktop theme document it stays
 * passive and the client half keeps its web fallback.
 */

/** Inject one persisted skin's bootstrap into an index HTML document. */
export declare function injectDesktopSkinBoot(html: string, skin: string): string;

/** Host loader entry: register the index transform on the webServer service. */
export declare function apply(ctx: any): void;
