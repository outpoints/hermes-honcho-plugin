// Development-only host check. Runtime plugins get no Tailwind build and no
// bundler, so every SDK import must exist in the host and every utility class
// must already be in the host's shipped stylesheet.
//
//   HERMES_SOURCE=/path/to/hermes-agent node scripts/check-ui-surface.mjs [git-ref ...]
//
// With git refs, only the SDK export check runs against each ref (the shipped
// stylesheet is checked once, from the prepared checkout's apps/desktop/dist).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert(process.env.HERMES_SOURCE, 'Set HERMES_SOURCE to a prepared Hermes checkout.')
const host = resolve(process.env.HERMES_SOURCE)
const plugin = await readFile(join(repo, 'desktop/plugin.js'), 'utf8')

const imported = plugin.match(/import\s*\{([\s\S]*?)\}\s*from '@hermes\/plugin-sdk'/)[1]
  .split(',').map(name => name.trim()).filter(Boolean)
const iconNames = [...new Set([...plugin.matchAll(/\bicons\.([A-Za-z0-9]+)/g)].map(match => match[1]))]

function exportedNames(source) {
  const names = new Set()
  for (const match of source.matchAll(/export\s*\{([\s\S]*?)\}/g)) {
    for (const part of match[1].split(',')) {
      const cleaned = part.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/^type\s+/, '')
      if (!cleaned) continue
      const alias = cleaned.split(/\s+as\s+/).pop().trim()
      names.add(alias)
    }
  }
  for (const match of source.matchAll(/export\s+(?:const|function|async function|class)\s+([A-Za-z0-9_$]+)/g)) names.add(match[1])
  if (/export \* as icons from/.test(source)) names.add('icons')
  return names
}

function checkSdk(label, sdkSource, iconsSource) {
  const names = exportedNames(sdkSource)
  const missing = imported.filter(name => !names.has(name))
  const iconExports = exportedNames(iconsSource)
  const missingIcons = iconNames.filter(name => !iconExports.has(name))
  assert.deepEqual(missing, [], `${label}: SDK is missing ${missing.join(', ')}`)
  assert.deepEqual(missingIcons, [], `${label}: icons are missing ${missingIcons.join(', ')}`)
  return { ref: label, sdk_imports: imported.length, icons: iconNames.length }
}

const results = []
const refs = process.argv.slice(2)
if (refs.length) {
  for (const ref of refs) {
    const show = path => execFileSync('git', ['-C', host, 'show', `${ref}:${path}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    results.push(checkSdk(ref, show('apps/desktop/src/sdk/index.ts'), show('apps/desktop/src/lib/icons.ts')))
  }
} else {
  results.push(checkSdk('working tree',
    await readFile(join(host, 'apps/desktop/src/sdk/index.ts'), 'utf8'),
    await readFile(join(host, 'apps/desktop/src/lib/icons.ts'), 'utf8')))
}

// Every literal in a className expression (including ternaries and cn(...)),
// plus the shared class constants, contributes tokens. Literals that are
// compared (`=== 'narrow'`) are values, not classes.
const classSources = [
  ...plugin.split('\n').filter(line => line.includes('className:')).flatMap(line => {
    const expression = line.slice(line.indexOf('className:') + 'className:'.length)
      .split(/,\s*(?:children|style|onClick|title|role|id|type|tabIndex|ref|disabled|value|size|variant|'aria-[a-z-]+'|'data-[a-z-]+')\s*:/)[0]
    return [...expression.matchAll(/'((?:[^'\\]|\\.)*)'/g)]
      .filter(match => !/[=!]==\s*$/.test(expression.slice(0, match.index)))
      .map(match => match[1])
  }),
  ...[...plugin.matchAll(/const (?:TEXT_TAB|BLOCK) = '([^']+)'/g)].map(match => match[1])
]
const tokens = [...new Set(classSources.flatMap(source => source.split(/\s+/)).filter(token => /^[a-z!-]/.test(token) && !token.includes('${')))]
const dist = join(host, 'apps/desktop/dist/assets')
const css = (await Promise.all((await readdir(dist)).filter(name => name.endsWith('.css')).map(name => readFile(join(dist, name), 'utf8')))).join('\n')
const escape = token => token.replace(/^(\d)/, '\\3$1 ').replace(/[^A-Za-z0-9_-]/g, char => `\\${char}`)
const missingClasses = tokens.filter(token => !css.includes(`.${escape(token)}`))
assert.deepEqual(missingClasses, [], `Classes missing from the shipped stylesheet: ${missingClasses.join(' ')}`)

console.log(JSON.stringify({ sdk: results, class_tokens_checked: tokens.length, missing_classes: 0 }, null, 2))
