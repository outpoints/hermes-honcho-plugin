import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
// Comments may describe forbidden patterns; only executable source counts.
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

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
    if (specifier && !/^[./]/.test(specifier) && !/^[a-z][a-z0-9+.-]*:/i.test(specifier) && !runtimeMappedSpecifiers.has(specifier)) {
      bare.add(specifier)
    }
  }
  return [...bare]
}

test('uses only Hermes runtime-supported module specifiers', () => {
  assert.deepEqual(runtimeUnsupportedImports(source), [])
  const imports = [...source.matchAll(runtimeImportSpecifierRe())].map(match => match[3])
  assert.deepEqual([...new Set(imports)].sort(), ['@hermes/plugin-sdk', 'react', 'react/jsx-runtime'])
})

test('contains no JSX syntax or external asset imports', () => {
  assert.doesNotMatch(source, /import\s+['"][^'"]+\.css['"]/)
  assert.doesNotMatch(source, /return\s*\(\s*</)
})

test('stays inside the catalog Desktop surface rules', () => {
  // Rule 8: no reading or rewriting host markup, no dynamic code, no patching.
  assert.doesNotMatch(code, /data-(?:slot|tour|sidebar|testid)/)
  assert.doesNotMatch(code, /querySelector|getElementsBy|MutationObserver/)
  assert.doesNotMatch(code, /(?<![\w$.])eval\(|new\s+Function\(|\.prototype\.|__proto__/)
  assert.doesNotMatch(code, /createElement\(\s*['"]script/)
  assert.doesNotMatch(code, /\bimport\(/)
})

test('registers the route, pane, sidebar, status bar, and palette surfaces', () => {
  for (const area of ['ROUTES_AREA', 'PANES_AREA', 'SIDEBAR_NAV_AREA', 'STATUSBAR_AREAS.right', 'PALETTE_AREA']) {
    assert.match(source, new RegExp(`area:\\s*${area.replace('.', '\\.')}`))
  }
  assert.match(source, /data:\s*\{\s*path:\s*ROUTE\s*\}/)
  assert.match(source, /title:\s*'Honcho Memory'/)
  assert.match(source, /defaultCollapsed:\s*true/)
  assert.match(source, /dock:\s*\{\s*pane:\s*'workspace',\s*pos:\s*'right'/)
})

test('focus-qualified requests fail closed and prevent stale-chat reuse', () => {
  for (const field of ['focused_profile', 'focused_connection_id', 'runtime_session_id', 'stored_session_id', 'cwd']) {
    assert.match(source, new RegExp(`${field}:`))
  }
  assert.match(source, /enabled\s*=\s*options\.enabled\s*!==\s*false\s*&&\s*!focus\.routeMismatch/)
  assert.match(source, /run\?\.fingerprint\s*===\s*focus\.fingerprint/)
  assert.match(source, /if\s*\(run\s*&&\s*run\.fingerprint\s*!==\s*focus\.fingerprint\)\s*setRun\(null\)/)
})

test('implements every section and bounded backend endpoint', () => {
  for (const section of ['memory', 'ask', 'messages', 'context', 'status']) {
    assert.match(source, new RegExp(`id: '${section}'`))
  }
  for (const endpoint of ['/snapshot', '/messages', '/conclusions', '/conclusion-search', '/conclusion-detail', '/context', '/search', '/scopes', '/activity', '/ask', '/capabilities', '/correction-ticket', '/corrections', '/upload-ticket']) {
    assert.match(source, new RegExp(`'${endpoint}'`))
  }
  assert.match(source, /const PAGE_SIZE = 25/)
  assert.match(source, /currentRun\s*\?\s*\{ scope: currentRun\.scope, scope_id: currentRun\.scopeId \|\| null, query: currentRun\.query, limit: currentRun\.limit \}/)
})

test('keeps native styling tokenized and free of custom decorative chrome', () => {
  assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i)
  assert.doesNotMatch(source, /\brgba?\s*\(/i)
  assert.doesNotMatch(source, /rounded-(?:lg|xl|2xl|3xl|full)\b/)
  assert.doesNotMatch(source, /\bshadow-(?:md|lg|xl|2xl)\b/)
  assert.doesNotMatch(source, /bg-gradient|background-clip|backdrop-blur/)
  assert.doesNotMatch(source, /uppercase|tracking-\[/)
  assert.match(source, /--ui-stroke-tertiary/)
  assert.match(source, /--ui-text-secondary/)
})

test('memory content renders through the host and stays selectable', () => {
  // The shell sets user-select: none on body; content must opt back in.
  assert.match(source, /'data-selectable-text': 'true'/)
  for (const component of ['Markdown', 'ObservationLedger', 'PeerCardFacts', 'MessageRow', 'EvidenceMessages']) {
    const start = source.indexOf(`\nfunction ${component}(`)
    assert.ok(start >= 0, component)
    const end = source.indexOf('\nfunction ', start + 1)
    assert.match(source.slice(start, end), /\.\.\.SELECTABLE/, `${component} must opt into text selection`)
  }
  assert.match(source, /jsx\(MessageTextContent, \{ text: text\(source, ''\), media: false \}\)/)
})

test('layout follows the rendered pane width instead of global viewport breakpoints', () => {
  assert.match(source, /new ResizeObserver/)
  assert.match(source, /function layoutForWidth/)
  assert.match(source, /width < 440/)
  assert.match(source, /width < 880/)
  assert.match(source, /LayoutContext\.Provider/)
  assert.match(source, /['"]data-layout['"]\s*:/)
})

test('narrow layout keeps navigation and primary actions usable without horizontal clipping', () => {
  assert.match(source, /function SectionNav\([^)]*\)[\s\S]*?layout === 'narrow'[\s\S]*?DropdownMenuTrigger/)
  assert.match(source, /role: 'tablist'/)
  assert.match(source, /useValue\(host\.state\.viewport\)/)
  assert.match(source, /viewport\?\.width\s*<\s*640/)
  assert.doesNotMatch(source, /text-\[9px\]|text-\[10px\]/)
})

test('current-session ingestion is explicit, focus-bound, and uses Hermes upload transport', () => {
  assert.match(source, /'Add to session'/)
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
  assert.match(source, /useHonchoEndpoint\('\/scopes'/)
  assert.match(source, /id:\s*'honcho'/)
  assert.match(source, /scope_id:\s*currentRun\.scopeId\s*\|\|\s*null/)
  assert.match(source, /scopesQuery\.data\?\.capabilities\?\.scope_search/)
})

test('search never submits through a form or its Clear button', () => {
  assert.doesNotMatch(code, /jsxs?\('form'/)
  assert.match(source, /onKeyDown:\s*submitOnEnter\(/)
  assert.match(source, /onClear:\s*clear/)
})

test('polling respects the Hermes SDK minimum guidance', () => {
  const match = source.match(/const POLL_INTERVAL_MS = ([\d_]+)/)
  assert.ok(match)
  assert.ok(Number(match[1].replaceAll('_', '')) >= 10_000)
})

test('unsupported activity detail is presented as a compact capability note', () => {
  assert.match(source, /queues\?\.capabilities\?\.failed_task_detail\s*\|\|\s*queues\?\.capabilities\?\.recent_task_detail/)
  assert.match(source, /Totals only\./)
})

test('every manifest and the backend report the same version', async () => {
  const yaml = await readFile(new URL('../plugin.yaml', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../dashboard/manifest.json', import.meta.url), 'utf8'))
  const api = await readFile(new URL('../dashboard/plugin_api.py', import.meta.url), 'utf8')
  const entry = await readFile(new URL('../docs/catalog-entry.yaml.in', import.meta.url), 'utf8')
  const version = yaml.match(/^version:\s*(\S+)/m)[1]
  assert.equal(manifest.version, version)
  assert.equal(api.match(/^PLUGIN_VERSION = "([^"]+)"/m)[1], version)
  assert.equal(entry.match(/^version:\s*"([^"]+)"/m)[1], version)
})

test('plugin identity matches the install directory and API namespace', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dashboard/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.name, 'hermes-honcho-plugin')
  assert.equal(manifest.entry, 'dist/index.js')
  assert.equal(manifest.api, 'plugin_api.py')
  assert.equal(manifest.tab.hidden, true)
  assert.match(source, /const PLUGIN_ID = 'hermes-honcho-plugin'/)
})
