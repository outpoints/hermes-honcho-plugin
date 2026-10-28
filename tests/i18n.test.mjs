import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')

// The bundle is a plain object literal in the source; reading the key list out of
// it keeps this test free of the plugin SDK the module imports.
function bundleKeys(locale) {
  const start = source.indexOf(`  ${locale}: {`)
  assert.notEqual(start, -1, `no ${locale} bundle`)
  const end = source.indexOf('\n  }', start)
  const body = source.slice(start, end)
  return new Set([...body.matchAll(/^ {4}([a-z0-9_]+):/gm)].map(match => match[1]))
}

const en = bundleKeys('en')
const zh = bundleKeys('zh')
const used = new Set([...source.matchAll(/\bt\('([a-z0-9_]+)'/g)].map(match => match[1]))

// Product names and format tokens read the same in every language.
const SAME_BY_DESIGN = new Set(['honcho', 'sdk', 'id', 'token', 'count_dot_tokens', 'honcho_memory', 'profile'])

test('every key the source asks for exists in both bundles', () => {
  const missingEn = [...used].filter(key => !en.has(key)).sort()
  const missingZh = [...used].filter(key => !zh.has(key)).sort()
  assert.deepEqual(missingEn, [], `missing from en: ${missingEn.join(', ')}`)
  assert.deepEqual(missingZh, [], `missing from zh: ${missingZh.join(', ')}`)
})

test('both bundles carry the same keys', () => {
  assert.deepEqual([...en].sort(), [...zh].sort())
})

test('the Chinese bundle translates rather than copying English', () => {
  const start = source.indexOf('  zh: {')
  const body = source.slice(start, source.indexOf('\n  }', start))
  const entries = [...body.matchAll(/^ {4}([a-z0-9_]+): "(.*)",$/gm)]
  const formatters = [...body.matchAll(/^ {4}([a-z0-9_]+): .*=>/gm)]
  assert.equal(entries.length + formatters.length, zh.size, 'an entry used an unexpected shape')
  const untranslated = entries
    .filter(([, key, value]) => !SAME_BY_DESIGN.has(key) && /^[\x20-\x7e]+$/.test(value))
    .map(([, key]) => key)
  assert.deepEqual(untranslated, [], `still English: ${untranslated.join(', ')}`)
})
