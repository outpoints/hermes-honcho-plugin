import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')

const runtimeImportSpecifierRe = () => /(from\s*|import\s*\(\s*|import\s+)(['"])([^'"]+)\2/g
const runtimeMappedSpecifiers = new Set([
  '@hermes/plugin-sdk',
  'react',
  'react/jsx-dev-runtime',
  'react/jsx-runtime'
])

function runtimeUnsupportedImports(pluginSource) {
  const bare = new Set()

  for (const match of pluginSource.matchAll(runtimeImportSpecifierRe())) {
    const specifier = match[3]

    if (
      specifier &&
      !/^[./]/.test(specifier) &&
      !/^[a-z][a-z0-9+.-]*:/i.test(specifier) &&
      !runtimeMappedSpecifiers.has(specifier)
    ) {
      bare.add(specifier)
    }
  }

  return [...bare]
}

test('uses only Hermes runtime-supported module specifiers', () => {
  assert.deepEqual(runtimeUnsupportedImports(source), [])

  const imports = [...source.matchAll(runtimeImportSpecifierRe())].map(match => match[3])
  assert.deepEqual([...new Set(imports)].sort(), ['@hermes/plugin-sdk', 'react/jsx-runtime'])
})

test('contains no JSX syntax or external asset imports', () => {
  assert.doesNotMatch(source, /import\s+['"][^'"]+\.css['"]/)
  assert.doesNotMatch(source, /return\s*\(\s*</)
})

test('registers the route, sidebar, status bar, and palette surfaces', () => {
  for (const area of ['ROUTES_AREA', 'SIDEBAR_NAV_AREA', 'STATUSBAR_AREAS.right', 'PALETTE_AREA']) {
    assert.match(source, new RegExp(`area:\\s*${area.replace('.', '\\.')}`))
  }
  assert.match(source, /data:\s*\{\s*path:\s*ROUTE\s*\}/)
})

test('polling respects the Hermes SDK minimum guidance', () => {
  const match = source.match(/const POLL_INTERVAL_MS = ([\d_]+)/)
  assert.ok(match)
  assert.ok(Number(match[1].replaceAll('_', '')) >= 5_000)
})

test('plugin identity matches the install directory and API namespace', async () => {
  const manifest = await readFile(new URL('../dashboard/manifest.json', import.meta.url), 'utf8')
  const dashboard = JSON.parse(manifest)
  assert.equal(dashboard.name, 'hermes-honcho-plugin')
  assert.equal(dashboard.entry, 'dist/index.js')
  assert.equal(dashboard.api, 'plugin_api.py')
  assert.equal(dashboard.tab.hidden, true)
  assert.match(source, /const PLUGIN_ID = 'hermes-honcho-plugin'/)
})
