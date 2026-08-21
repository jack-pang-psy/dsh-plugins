#!/usr/bin/env node
/**
 * Regenerate lib/skins.js from the curated SKINS table embedded in
 * lib/client.js. The client bundle is a self-contained CJS module-loader
 * bundle and cannot import this ESM catalog, so the catalog is mirrored; this
 * script keeps the host-side mirror byte-for-byte in sync.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const clientPath = join(root, 'lib', 'client.js')
const code = readFileSync(clientPath, 'utf8')

let captured
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(handoff) {
        captured = handoff
      },
    },
  },
}
vm.runInNewContext(code, sandbox, { filename: clientPath })
if (captured === undefined) throw new Error('lib/client.js did not register a module-loader handoff')

const exports = captured.factory((specifier) => {
  // The catalog extraction only materializes definitions; React and runtime
  // imports are present for the component bodies and never execute here.
  if (specifier === 'react/jsx-runtime' || specifier === 'react'
    || specifier === '@deepseek-ai/dsh-client-runtime/client') {
    return {}
  }
  throw new Error(`unexpected require while extracting skins: ${specifier}`)
})

const source = `/**
 * Generated skin catalog shared by the host-side index bootstrap.
 * Source of truth: the curated SKINS table embedded in lib/client.js.
 * Regenerate with: node scripts/generate-skins.mjs
 */

/** Sentinel meaning "no custom skin; follow the built-in appearance". */
export const DEFAULT_SKIN = 'system'

/** Curated skins, mirrored from the client bundle's SKINS table. */
export const SKINS = Object.freeze(${JSON.stringify(exports.SKINS.map(skin => Object.freeze(skin)), null, 2)})

/** Resolve a skin id to its definition (null for built-in or unknown ids). */
export function resolveSkinDefinition(id) {
  return SKINS.find(skin => skin.id === id) ?? null
}

/** Whether a theme id is built-in or a registered desktop skin. */
export function isSupportedDesktopSkin(id) {
  return id === 'system' || id === 'light' || id === 'dark'
    || SKINS.some(skin => skin.id === id)
}
`
writeFileSync(join(root, 'lib', 'skins.js'), source)
console.log(`wrote lib/skins.js with ${exports.SKINS.length} skins`)
