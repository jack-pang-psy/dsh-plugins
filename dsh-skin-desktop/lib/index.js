/**
 * dsh-skin-desktop host half: pre-plugin index bootstrap.
 *
 * The Electron shell owns persistence at `$DSH_HOME/desktop/theme.json`.
 * This host plugin reads that document while serving the Web GUI index and
 * injects the saved skin before the browser client bundle loads, so the first
 * paint already carries the selected skin. When no desktop theme document
 * exists (plain web profile), the injector stays passive and the client half
 * keeps its cookie/localStorage fallback.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SKIN, isSupportedDesktopSkin, resolveSkinDefinition } from './skins.js'

/** Directory under `$DSH_HOME` holding desktop-owned preferences. */
const DESKTOP_PREFERENCES_DIR = 'desktop'
/** File name inside {@link DESKTOP_PREFERENCES_DIR}. */
const DESKTOP_THEME_FILENAME = 'theme.json'

/** Resolve the stable Harness home, matching the desktop shell. */
function resolveDshHome(environment = process.env) {
  const explicit = environment.DSH_HOME?.trim()
  return explicit !== undefined && explicit !== '' ? explicit : join(homedir(), '.dsh')
}

/** Read the persisted skin id; defaults to `system` for missing/bad documents. */
function readSavedSkin(environment = process.env) {
  try {
    const path = join(resolveDshHome(environment), DESKTOP_PREFERENCES_DIR, DESKTOP_THEME_FILENAME)
    const raw = JSON.parse(readFileSync(path, 'utf8'))
    const skin = raw !== null && typeof raw === 'object' ? raw.skin : undefined
    return typeof skin === 'string' && isSupportedDesktopSkin(skin) ? skin : DEFAULT_SKIN
  } catch {
    return DEFAULT_SKIN
  }
}

/** Build the inline script that paints one persisted skin before first paint. */
function bootThemeScript(skin) {
  const definition = resolveSkinDefinition(skin)
  const dark = skin === 'dark' || definition?.colorScheme === 'dark'
  const tokens = definition === null ? {} : definition.tokens
  return `<script data-dsh-skin-desktop-boot>(() => {
  const skin = ${JSON.stringify(skin)}
  const dark = ${JSON.stringify(dark)}
  const tokens = ${JSON.stringify(tokens)}
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  document.body.toggleAttribute('data-ds-dark-theme', dark)
  for (const [name, value] of Object.entries(tokens)) {
    document.body.style.setProperty(name, value)
  }
})()</script>`
}

/**
 * Inject the skin bootstrap at the end of the body. End-of-body placement
 * makes it run after the built-in ui-theme bootstrap, so the desktop skin's
 * color scheme and alias tokens win for the pre-plugin first paint.
 */
export function injectDesktopSkinBoot(html, skin) {
  if (skin === DEFAULT_SKIN || isSupportedDesktopSkin(skin) === false) return html
  const script = bootThemeScript(skin)
  const bodyClose = /<\/body>/i.exec(html)
  if (bodyClose === null) return `${html}${script}`
  return `${html.slice(0, bodyClose.index)}${script}${html.slice(bodyClose.index)}`
}

/** Host loader entry: tap every index response with the saved desktop skin. */
export function apply(ctx) {
  ctx.inject(['webServer'], (httpCtx) => {
    httpCtx.effect(
      () => httpCtx.webServer.tapIndex(html => injectDesktopSkinBoot(html, readSavedSkin())),
      'dsh-skin-desktop: pre-plugin skin bootstrap',
    )
  })
}
