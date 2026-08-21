/**
 * Generated skin catalog shared by the host-side index bootstrap.
 * Source of truth: the curated SKINS table embedded in lib/client.js.
 * Regenerate with: node scripts/generate-skins.mjs
 */

/** Sentinel meaning "no custom skin; follow the built-in appearance". */
export const DEFAULT_SKIN = 'system'

/** Curated skins, mirrored from the client bundle's SKINS table. */
export const SKINS = Object.freeze([
  {
    "id": "ocean",
    "colorScheme": "dark",
    "tokens": {
      "--dsw-alias-bg-base": "#0a101f",
      "--dsw-alias-bg-layer-1": "#101a30",
      "--dsw-alias-bg-layer-2": "#16233e",
      "--dsw-alias-bg-layer-3": "#1c2c4d",
      "--dsw-alias-bg-overlay": "#1e2c49",
      "--dsw-alias-border-l1": "rgba(148, 163, 184, 0.14)",
      "--dsw-alias-border-l2": "rgba(148, 163, 184, 0.26)",
      "--dsw-alias-label-primary": "#e9eef9",
      "--dsw-alias-label-secondary": "#a5b3cc",
      "--dsw-alias-label-tertiary": "#7e8da8",
      "--dsw-alias-brand-primary": "#4d86f8",
      "--dsw-alias-brand-text": "#ffffff",
      "--dsw-alias-button-primary-hover": "#6d9dfa",
      "--dsw-alias-button-primary-dimmed": "#16233e",
      "--dsw-alias-state-business-primary": "#4d86f8",
      "--dsw-alias-state-business-tertiary": "#16233e",
      "--dsw-alias-interactive-bg-hover": "rgba(77, 134, 248, 0.12)",
      "--dsw-alias-interactive-bg-active": "rgba(77, 134, 248, 0.2)",
      "--dsw-alias-markdown-code-block": "#0d1426",
      "--dsw-alias-markdown-inline-code": "#16233e",
      "--dsw-specific-sidebar-fill": "#0d1426",
      "--dsw-specific-sidebar-nav-item-active": "#16233e",
      "--dsw-specific-sidebar-nav-item-hover": "#121c31",
      "--dsw-alias-scrollbar-bg-l1": "#1c2c4d",
      "--dsw-alias-scrollbar-bg-l2": "#23365e",
      "--dsw-alias-scrollbar-hover-l1": "#2a3f6d",
      "--dsw-alias-scrollbar-hover-l2": "#2a3f6d"
    }
  },
  {
    "id": "graphite",
    "colorScheme": "dark",
    "tokens": {
      "--dsw-alias-bg-base": "#0f0f11",
      "--dsw-alias-bg-layer-1": "#17171a",
      "--dsw-alias-bg-layer-2": "#1e1e22",
      "--dsw-alias-bg-layer-3": "#26262b",
      "--dsw-alias-bg-overlay": "#27272c",
      "--dsw-alias-border-l1": "rgba(255, 255, 255, 0.07)",
      "--dsw-alias-border-l2": "rgba(255, 255, 255, 0.14)",
      "--dsw-alias-label-primary": "#ededf0",
      "--dsw-alias-label-secondary": "#a2a2ab",
      "--dsw-alias-label-tertiary": "#82828c",
      "--dsw-alias-brand-primary": "#b9bdc8",
      "--dsw-alias-brand-text": "#101012",
      "--dsw-alias-button-primary-hover": "#d2d5de",
      "--dsw-alias-button-primary-dimmed": "#26262b",
      "--dsw-alias-state-business-primary": "#b9bdc8",
      "--dsw-alias-state-business-tertiary": "#26262b",
      "--dsw-alias-interactive-bg-hover": "rgba(255, 255, 255, 0.08)",
      "--dsw-alias-interactive-bg-active": "rgba(255, 255, 255, 0.14)",
      "--dsw-alias-markdown-code-block": "#141417",
      "--dsw-alias-markdown-inline-code": "#1e1e22",
      "--dsw-specific-sidebar-fill": "#141417",
      "--dsw-specific-sidebar-nav-item-active": "#1e1e22",
      "--dsw-specific-sidebar-nav-item-hover": "#1a1a1e",
      "--dsw-alias-scrollbar-bg-l1": "#2e2e34",
      "--dsw-alias-scrollbar-bg-l2": "#383840",
      "--dsw-alias-scrollbar-hover-l1": "#45454e",
      "--dsw-alias-scrollbar-hover-l2": "#45454e"
    }
  },
  {
    "id": "forest",
    "colorScheme": "dark",
    "tokens": {
      "--dsw-alias-bg-base": "#0a120d",
      "--dsw-alias-bg-layer-1": "#101a13",
      "--dsw-alias-bg-layer-2": "#17241a",
      "--dsw-alias-bg-layer-3": "#1e2e22",
      "--dsw-alias-bg-overlay": "#203024",
      "--dsw-alias-border-l1": "rgba(134, 239, 172, 0.1)",
      "--dsw-alias-border-l2": "rgba(134, 239, 172, 0.2)",
      "--dsw-alias-label-primary": "#e7f5eb",
      "--dsw-alias-label-secondary": "#9dc4a9",
      "--dsw-alias-label-tertiary": "#7ba68a",
      "--dsw-alias-brand-primary": "#34d37b",
      "--dsw-alias-brand-text": "#04120a",
      "--dsw-alias-button-primary-hover": "#5ae295",
      "--dsw-alias-button-primary-dimmed": "#17241a",
      "--dsw-alias-state-business-primary": "#34d37b",
      "--dsw-alias-state-business-tertiary": "#17241a",
      "--dsw-alias-interactive-bg-hover": "rgba(52, 211, 123, 0.12)",
      "--dsw-alias-interactive-bg-active": "rgba(52, 211, 123, 0.2)",
      "--dsw-alias-markdown-code-block": "#0c1510",
      "--dsw-alias-markdown-inline-code": "#17241a",
      "--dsw-specific-sidebar-fill": "#0c1510",
      "--dsw-specific-sidebar-nav-item-active": "#17241a",
      "--dsw-specific-sidebar-nav-item-hover": "#111d15",
      "--dsw-alias-scrollbar-bg-l1": "#1e2e22",
      "--dsw-alias-scrollbar-bg-l2": "#26402e",
      "--dsw-alias-scrollbar-hover-l1": "#2f5038",
      "--dsw-alias-scrollbar-hover-l2": "#2f5038"
    }
  },
  {
    "id": "sunset",
    "colorScheme": "dark",
    "tokens": {
      "--dsw-alias-bg-base": "#150f1f",
      "--dsw-alias-bg-layer-1": "#1d152b",
      "--dsw-alias-bg-layer-2": "#261c38",
      "--dsw-alias-bg-layer-3": "#302346",
      "--dsw-alias-bg-overlay": "#312548",
      "--dsw-alias-border-l1": "rgba(233, 213, 255, 0.1)",
      "--dsw-alias-border-l2": "rgba(233, 213, 255, 0.2)",
      "--dsw-alias-label-primary": "#f4edfc",
      "--dsw-alias-label-secondary": "#c2aee0",
      "--dsw-alias-label-tertiary": "#9f8cc2",
      "--dsw-alias-brand-primary": "#c084fc",
      "--dsw-alias-brand-text": "#1a0f26",
      "--dsw-alias-button-primary-hover": "#d4a4fd",
      "--dsw-alias-button-primary-dimmed": "#261c38",
      "--dsw-alias-state-business-primary": "#c084fc",
      "--dsw-alias-state-business-tertiary": "#261c38",
      "--dsw-alias-interactive-bg-hover": "rgba(192, 132, 252, 0.14)",
      "--dsw-alias-interactive-bg-active": "rgba(192, 132, 252, 0.24)",
      "--dsw-alias-markdown-code-block": "#181022",
      "--dsw-alias-markdown-inline-code": "#261c38",
      "--dsw-specific-sidebar-fill": "#181022",
      "--dsw-specific-sidebar-nav-item-active": "#261c38",
      "--dsw-specific-sidebar-nav-item-hover": "#1d1429",
      "--dsw-alias-scrollbar-bg-l1": "#302346",
      "--dsw-alias-scrollbar-bg-l2": "#3d2d5a",
      "--dsw-alias-scrollbar-hover-l1": "#4a3770",
      "--dsw-alias-scrollbar-hover-l2": "#4a3770"
    }
  },
  {
    "id": "midnight",
    "colorScheme": "dark",
    "tokens": {
      "--dsw-alias-bg-base": "#000000",
      "--dsw-alias-bg-layer-1": "#0b0b0f",
      "--dsw-alias-bg-layer-2": "#141419",
      "--dsw-alias-bg-layer-3": "#1c1c23",
      "--dsw-alias-bg-overlay": "#1d1d24",
      "--dsw-alias-border-l1": "rgba(255, 255, 255, 0.06)",
      "--dsw-alias-border-l2": "rgba(255, 255, 255, 0.12)",
      "--dsw-alias-label-primary": "#e8e8ee",
      "--dsw-alias-label-secondary": "#9d9daa",
      "--dsw-alias-label-tertiary": "#7c7c88",
      "--dsw-alias-brand-primary": "#7c8cff",
      "--dsw-alias-brand-text": "#05050a",
      "--dsw-alias-button-primary-hover": "#9aa7ff",
      "--dsw-alias-button-primary-dimmed": "#141419",
      "--dsw-alias-state-business-primary": "#7c8cff",
      "--dsw-alias-state-business-tertiary": "#141419",
      "--dsw-alias-interactive-bg-hover": "rgba(124, 140, 255, 0.12)",
      "--dsw-alias-interactive-bg-active": "rgba(124, 140, 255, 0.2)",
      "--dsw-alias-markdown-code-block": "#08080b",
      "--dsw-alias-markdown-inline-code": "#141419",
      "--dsw-specific-sidebar-fill": "#08080b",
      "--dsw-specific-sidebar-nav-item-active": "#141419",
      "--dsw-specific-sidebar-nav-item-hover": "#0e0e13",
      "--dsw-alias-scrollbar-bg-l1": "#1c1c23",
      "--dsw-alias-scrollbar-bg-l2": "#26262f",
      "--dsw-alias-scrollbar-hover-l1": "#31313c",
      "--dsw-alias-scrollbar-hover-l2": "#31313c"
    }
  },
  {
    "id": "paper",
    "colorScheme": "light",
    "tokens": {
      "--dsw-alias-bg-base": "#faf7f1",
      "--dsw-alias-bg-layer-1": "#ffffff",
      "--dsw-alias-bg-layer-2": "#f4efe5",
      "--dsw-alias-bg-layer-3": "#ebe3d4",
      "--dsw-alias-bg-overlay": "#fffdf8",
      "--dsw-alias-border-l1": "rgba(120, 96, 48, 0.1)",
      "--dsw-alias-border-l2": "rgba(120, 96, 48, 0.18)",
      "--dsw-alias-label-primary": "#2e2a22",
      "--dsw-alias-label-secondary": "#6f675a",
      "--dsw-alias-label-tertiary": "#8e8578",
      "--dsw-alias-brand-primary": "#b45309",
      "--dsw-alias-brand-text": "#ffffff",
      "--dsw-alias-button-primary-hover": "#d97706",
      "--dsw-alias-button-primary-dimmed": "#f4efe5",
      "--dsw-alias-state-business-primary": "#b45309",
      "--dsw-alias-state-business-tertiary": "#f4efe5",
      "--dsw-alias-interactive-bg-hover": "rgba(180, 83, 9, 0.08)",
      "--dsw-alias-interactive-bg-active": "rgba(180, 83, 9, 0.14)",
      "--dsw-alias-markdown-code-block": "#f4efe5",
      "--dsw-alias-markdown-inline-code": "#f0e9da",
      "--dsw-specific-sidebar-fill": "#f4efe5",
      "--dsw-specific-sidebar-nav-item-active": "#ebe3d4",
      "--dsw-specific-sidebar-nav-item-hover": "#eee7d8",
      "--dsw-alias-scrollbar-bg-l1": "#e0d6c2",
      "--dsw-alias-scrollbar-bg-l2": "#d8ccb4",
      "--dsw-alias-scrollbar-hover-l1": "#cdbfa3",
      "--dsw-alias-scrollbar-hover-l2": "#cdbfa3"
    }
  },
  {
    "id": "sakura",
    "colorScheme": "light",
    "tokens": {
      "--dsw-alias-bg-base": "#fdf5f7",
      "--dsw-alias-bg-layer-1": "#ffffff",
      "--dsw-alias-bg-layer-2": "#f9e8ee",
      "--dsw-alias-bg-layer-3": "#f2dae3",
      "--dsw-alias-bg-overlay": "#fffbfc",
      "--dsw-alias-border-l1": "rgba(190, 80, 120, 0.1)",
      "--dsw-alias-border-l2": "rgba(190, 80, 120, 0.18)",
      "--dsw-alias-label-primary": "#3b2530",
      "--dsw-alias-label-secondary": "#8b6576",
      "--dsw-alias-label-tertiary": "#a27f8f",
      "--dsw-alias-brand-primary": "#db2777",
      "--dsw-alias-brand-text": "#ffffff",
      "--dsw-alias-button-primary-hover": "#ec4899",
      "--dsw-alias-button-primary-dimmed": "#f9e8ee",
      "--dsw-alias-state-business-primary": "#db2777",
      "--dsw-alias-state-business-tertiary": "#f9e8ee",
      "--dsw-alias-interactive-bg-hover": "rgba(219, 39, 119, 0.08)",
      "--dsw-alias-interactive-bg-active": "rgba(219, 39, 119, 0.14)",
      "--dsw-alias-markdown-code-block": "#f9e8ee",
      "--dsw-alias-markdown-inline-code": "#f2dae3",
      "--dsw-specific-sidebar-fill": "#f9e8ee",
      "--dsw-specific-sidebar-nav-item-active": "#f2dae3",
      "--dsw-specific-sidebar-nav-item-hover": "#f6e0e8",
      "--dsw-alias-scrollbar-bg-l1": "#eccfda",
      "--dsw-alias-scrollbar-bg-l2": "#e4c0cf",
      "--dsw-alias-scrollbar-hover-l1": "#d9afc1",
      "--dsw-alias-scrollbar-hover-l2": "#d9afc1"
    }
  }
])

/** Resolve a skin id to its definition (null for built-in or unknown ids). */
export function resolveSkinDefinition(id) {
  return SKINS.find(skin => skin.id === id) ?? null
}

/** Whether a theme id is built-in or a registered desktop skin. */
export function isSupportedDesktopSkin(id) {
  return id === 'system' || id === 'light' || id === 'dark'
    || SKINS.some(skin => skin.id === id)
}
