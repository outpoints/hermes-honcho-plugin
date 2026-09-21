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
  assert.deepEqual(
    [...new Set(imports)].sort(),
    ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime']
  )
})

test('contains no JSX syntax or external asset imports', () => {
  assert.doesNotMatch(source, /import\s+['"][^'"]+\.css['"]/)
  assert.doesNotMatch(source, /return\s*\(\s*</)
})

test('registers the route, pane, sidebar, status bar, and palette surfaces', () => {
  for (const area of [
    'ROUTES_AREA',
    'PANES_AREA',
    'SIDEBAR_NAV_AREA',
    'STATUSBAR_AREAS.right',
    'PALETTE_AREA'
  ]) {
    assert.match(source, new RegExp(`area:\\s*${area.replace('.', '\\.')}`))
  }
  assert.match(source, /data:\s*\{\s*path:\s*ROUTE\s*\}/)
  assert.match(source, /title:\s*'Honcho Memory'/)
  assert.match(source, /defaultCollapsed:\s*true/)
  assert.match(source, /dock:\s*\{\s*pane:\s*'workspace',\s*pos:\s*'right'/)
})

test('focus-qualified requests fail closed and prevent stale-chat reuse', () => {
  for (const field of [
    'focused_profile',
    'focused_connection_id',
    'runtime_session_id',
    'stored_session_id',
    'cwd'
  ]) {
    assert.match(source, new RegExp(`${field}:`))
  }
  assert.match(source, /enabled\s*=\s*options\.enabled\s*!==\s*false\s*&&\s*!focus\.routeMismatch/)
  assert.match(source, /run\?\.fingerprint\s*===\s*focus\.fingerprint/)
  assert.match(source, /if\s*\(run\s*&&\s*run\.fingerprint\s*!==\s*focus\.fingerprint\)\s*setRun\(null\)/)
})

test('implements all cockpit sections and bounded backend endpoints', () => {
  for (const tab of ['OVERVIEW', 'MESSAGES', 'CONCLUSIONS', 'CONTEXT', 'SEARCH', 'ACTIVITY']) {
    assert.match(source, new RegExp(`'${tab}'`))
  }
  for (const endpoint of ['/snapshot', '/messages', '/conclusions', '/context', '/search', '/scopes', '/activity']) {
    assert.match(source, new RegExp(`'${endpoint}'`))
  }
  assert.match(source, /const PAGE_SIZE = 25/)
  assert.match(source, /currentRun\s*\?\s*\{ scope: currentRun\.scope, scope_id: currentRun\.scopeId \|\| null, query: currentRun\.query, limit: currentRun\.limit \}/)
})

test('keeps dashboard styling flat, tokenized, dense, and square', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\brgb\s*\(/i)
  assert.doesNotMatch(source, /rounded-(?:lg|xl|2xl|3xl|full)\b/)
  assert.doesNotMatch(source, /\bshadow-(?:md|lg|xl|2xl)\b/)
  assert.doesNotMatch(source, /bg-gradient|background-clip|backdrop-blur/)
  assert.doesNotMatch(source, /─ □ ×/)
  assert.match(source, /\[ \$\{title\} \]/)
  assert.match(source, /font-mono text-\[10px\]/)
  assert.match(source, /--ui-stroke-tertiary/)
  assert.match(source, /--ui-text-secondary/)
})

test('layout follows the rendered pane width instead of global viewport breakpoints', () => {
  assert.match(source, /new ResizeObserver/)
  assert.match(source, /function layoutForWidth/)
  assert.match(source, /width < 420/)
  assert.match(source, /width < 840/)
  assert.match(source, /LayoutContext\.Provider/)
  assert.match(source, /['"]data-layout['"]\s*:/)
})

test('narrow layout keeps navigation and primary actions usable without horizontal clipping', () => {
  assert.match(source, /function TabRail\(\)[\s\S]*?layout === 'narrow'[\s\S]*?SelectTrigger/)
  assert.match(source, /const columns = layout === 'wide' \? 4 : 2/)
  assert.match(source, /min-h-8/)
  assert.match(source, /useValue\(host\.state\.viewport\)/)
  assert.match(source, /viewport\?\.width\s*<\s*640/)
  assert.doesNotMatch(source, /text-\[9px\]/)
})

test('current-session ingestion is explicit, focus-bound, and uses Hermes upload transport', () => {
  assert.match(source, /ADD_TO_SESSION/)
  assert.match(source, /\/upload-ticket/)
  assert.match(source, /\/uploads\/\$\{encodeURIComponent\(ticket\.ticket\)\}/)
  assert.match(source, /upload:\s*\{\s*filename,\s*contentType,\s*bytes\s*\}/)
  assert.match(source, /Textarea/)
  assert.match(source, /DialogContent/)
  assert.match(source, /focusFingerprintRef\.current\s*!==\s*confirmedFingerprint/)
  assert.match(source, /honcho_default_max_file_size/)
  assert.doesNotMatch(source, /MAX_UPLOAD_(?:BYTES|SIZE)/)
  assert.doesNotMatch(source, /size\s*>\s*10_?000_?000/)
})

test('newer Honcho scope search is capability-gated and user-triggered', () => {
  assert.match(source, /useHonchoEndpoint\(\s*'\/scopes'/)
  assert.match(source, /id:\s*'honcho'/)
  assert.match(source, /scope_id:\s*currentRun\.scopeId\s*\|\|\s*null/)
  assert.match(source, /scopesQuery\.data\?\.capabilities\?\.scope_search/)
  assert.match(source, /HONCHO_SCOPE/)
})

test('polling respects the Hermes SDK minimum guidance', () => {
  const match = source.match(/const POLL_INTERVAL_MS = ([\d_]+)/)
  assert.ok(match)
  assert.ok(Number(match[1].replaceAll('_', '')) >= 5_000)
})

test('unsupported activity detail is presented as a compact capability note', () => {
  assert.doesNotMatch(source, /FAILED_COUNT[\s\S]{0,120}NOT_EXPOSED/)
  assert.doesNotMatch(source, /RECENT_TASK_DETAIL[\s\S]{0,120}NOT_EXPOSED/)
  assert.match(source, /AGGREGATE_QUEUE_ONLY/)
  assert.match(source, /data\?\.capabilities\?\.failed_task_detail\s*\|\|\s*data\?\.capabilities\?\.recent_task_detail/)
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
