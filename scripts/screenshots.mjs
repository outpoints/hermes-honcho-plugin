// Development-only capture harness. The shipped plugin remains uncompiled ESM.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, resolve, join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = process.env.HERMES_SOURCE
const scratch = process.env.SCREENSHOT_WORK_DIR
assert(source && scratch, 'Set HERMES_SOURCE to a prepared Hermes checkout and SCREENSHOT_WORK_DIR to a scratch directory.')
const hostRoot = resolve(source)
const src = join(hostRoot, 'apps/desktop/src')
const dist = join(hostRoot, 'apps/desktop/dist')
const requireHost = createRequire(join(hostRoot, 'package.json'))
const { build } = requireHost('esbuild')
const { chromium } = requireHost('playwright')
await mkdir(scratch, { recursive: true })
const work = await mkdtemp(join(resolve(scratch), 'honcho-screens-'))
const output = process.env.SCREENSHOT_OUTPUT_DIR ? resolve(process.env.SCREENSHOT_OUTPUT_DIR) : join(repo, 'docs/screenshots')
await mkdir(output, { recursive: true })
const hostHtml = await readFile(join(dist, 'index.html'), 'utf8')
const cssLinks = [...hostHtml.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1])
assert(cssLinks.length, 'Build Hermes Desktop first: no shipped stylesheet found.')
const sdkSource = await readFile(join(src, 'sdk/index.ts'), 'utf8')
const pluginSource = await readFile(join(repo, 'desktop/plugin.js'), 'utf8')
const uiModules = {
  Button: 'components/ui/button', Codicon: 'components/ui/codicon', CopyButton: 'components/ui/copy-button',
  Dialog: 'components/ui/dialog', DialogContent: 'components/ui/dialog', DialogDescription: 'components/ui/dialog', DialogFooter: 'components/ui/dialog', DialogHeader: 'components/ui/dialog', DialogTitle: 'components/ui/dialog',
  DisclosureCaret: 'components/ui/disclosure-caret', MessageTextContent: 'components/assistant-ui/markdown-text',
  DropdownMenu: 'components/ui/dropdown-menu', DropdownMenuContent: 'components/ui/dropdown-menu', DropdownMenuItem: 'components/ui/dropdown-menu', DropdownMenuTrigger: 'components/ui/dropdown-menu',
  PanelEmpty: 'app/overlays/panel', SearchField: 'components/ui/search-field', SegmentedControl: 'components/ui/segmented-control',
  Select: 'components/ui/select', SelectContent: 'components/ui/select', SelectItem: 'components/ui/select', SelectTrigger: 'components/ui/select', SelectValue: 'components/ui/select',
  Skeleton: 'components/ui/skeleton', Textarea: 'components/ui/textarea', Tip: 'components/ui/tooltip',
}
for (const name of Object.keys(uiModules)) assert(sdkSource.includes(name), `Host SDK is missing ${name}`)
const themeSource = await readFile(join(src, 'themes/context.tsx'), 'utf8')
const themeTokens = themeSource.match(/  const seeds: Record<string, string> = \{[\s\S]+?(?=  const chromeBg)/)?.[0]
const mixTokens = themeSource.match(/const mixesFor = [\s\S]+?\n\}\)/)?.[0]
assert(themeTokens && mixTokens, 'Host theme application changed. Review the capture adapter.')
const theme = `import { nousTheme, DEFAULT_TYPOGRAPHY } from '@/themes/presets';
import { ensureContrast } from '@hermes/shared/color';
import { harmonize, readableInk } from '@/themes/color';
${mixTokens}
export function applyDemoTheme(mode) {
 const root = document.documentElement, isDark = mode === 'dark';
 const c = isDark ? nousTheme.darkColors : nousTheme.colors;
 const typo = { ...DEFAULT_TYPOGRAPHY, ...nousTheme.typography };
 const midground = c.midground ?? c.ring, PRIMARY_SOLID_FOREGROUND = '#fcfcfc';
 // Host-only knobs and the chat font picker are stubbed. The copied seed block
 // must keep running when the host adds calls inside it.
 const chatFontFamily = '', resolveChatFontFamily = (_, fallback) => fallback, applyTypographyKnobs = () => {};
 root.classList.toggle('dark', isDark); root.style.colorScheme = mode;
 ${themeTokens}
}`
const sdk = `
import { atom } from 'nanostores';
import { QueryClient } from '@tanstack/react-query';
export { atom } from 'nanostores';
export { useStore as useValue } from '@nanostores/react';
export { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
export const queryClient = new QueryClient();
export { cn } from '@/lib/utils';
export { StatusDot } from '@/components/status-dot';
${Object.entries(uiModules).map(([name, path]) => `export { ${name} } from '@/${path}';`).join('\n')}
export * as icons from '@/lib/icons';
export const PANES_AREA='panes', PALETTE_AREA='palette', ROUTES_AREA='routes', SIDEBAR_NAV_AREA='sidebar.nav', STATUSBAR_AREAS={right:'statusBar.right'};
const values={profile:'demo',focusedSessionProfile:'demo',focusedSessionOwner:{profile:'demo',connectionId:'local'},connectionId:'local',focusedSessionId:'demo-runtime',focusedStoredSessionId:'demo-conversation',cwd:'/demo/field-guide',busy:false,awaitingResponse:false,viewport:{width:1200}};
export const host={state:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,atom(value)])),paneVisibility:()=>atom(true),navigate:()=>{},notify:()=>{}};
`
const virtual = {
  '@hermes/plugin-sdk': sdk,
  'demo-theme': theme,
  '@/i18n': "import { en } from '@/i18n/en'; export const useI18n=()=>({t:en,locale:'en'}); export const translateNow=key=>key;",
  '@/lib/keybinds/use-keybind-hint': 'export const useKeybindHint=()=>null;',
  '@/lib/haptics': 'export const triggerHaptic=()=>{};',
  // PanelEmpty shares a module with overlay chrome it never renders.
  'overlay-view': "export const OVERLAY_TOP_CLEARANCE=''; export function OverlayView(props){ return props.children }",
}
// Generic arrows (`<T,>(...)`) only parse as TypeScript, not TSX.
const hostLoader = file => file.endsWith('.css') ? 'css' : file.endsWith('.tsx') ? 'tsx' : file.endsWith('.ts') ? 'ts' : 'tsx'
let server, browser
try {
  await build({ entryPoints: [join(repo, 'tests/screenshots/app.mjs')], outfile: join(work, 'app.js'), bundle: true, format: 'esm', jsx: 'automatic', platform: 'browser', nodePaths: [join(hostRoot, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ DEV: false, PROD: true, MODE: 'production', SSR: false, BASE_URL: '/' }) }, plugins: [{ name: 'isolated-host-ui', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.path in virtual) return { path: args.path, namespace: 'demo' }
      if (args.path === './overlay-view') return { path: 'overlay-view', namespace: 'demo' }
      if (args.path.startsWith('@/')) return { path: args.path.slice(2), namespace: 'host-source' }
    })
    builder.onLoad({ filter: /.*/, namespace: 'demo' }, args => ({ contents: virtual[args.path], loader: 'tsx', resolveDir: src }))
    builder.onLoad({ filter: /.*/, namespace: 'host-source' }, async args => {
      const target = join(src, args.path)
      for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
        try { return { contents: await readFile(target + suffix, 'utf8'), loader: hostLoader(target + suffix), resolveDir: dirname(target + suffix) } } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error }
      }
      throw new Error(`Missing host module: ${args.path}`)
    })
  } }] })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Honcho synthetic demo</title>${cssLinks.map(url => `<link rel="stylesheet" href="${url}">`).join('')}<link rel="stylesheet" href="/app.css"><style>body{margin:0;background:var(--ui-bg-base,var(--dt-background));color:var(--ui-text-primary);font-family:var(--dt-font-sans)}#demo-label{box-sizing:border-box;height:38px;padding:10px 24px;border-bottom:1px solid var(--ui-stroke-tertiary);font-size:12px;line-height:17px;color:var(--ui-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#root{height:calc(100vh - 38px)}</style></head><body><div id="demo-label">Honcho for Hermes · Synthetic demo data · No live account connected</div><div id="root"></div><script type="module" src="/app.js"></script></body></html>`
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://fixture').pathname
      let data, mime
      if (path === '/') { data = html; mime = 'text/html' }
      else if (['/app.js', '/app.css'].includes(path)) { data = await readFile(join(work, path.slice(1))); mime = path.endsWith('.css') ? 'text/css' : 'text/javascript' }
      else if (path.startsWith('/assets/') && !path.includes('..')) { data = await readFile(join(dist, path)); mime = { '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' }[extname(path)] || 'application/octet-stream' }
      else { response.writeHead(404); response.end(); return }
      response.writeHead(200, { 'Content-Type': mime }); response.end(data)
    } catch { response.writeHead(404); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC' })
  const errors = [], blocked = [], captures = []
  const accessibility = []
  const axeSource = await readFile(process.env.AXE_SOURCE || requireHost.resolve('axe-core/axe.min.js'), 'utf8')
  const checkAccessibility = async name => {
    await page.addScriptTag({ content: axeSource })
    const violations = await page.evaluate(async () => (await axe.run(document.getElementById('root'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })))
    accessibility.push({ name, violations })
  }
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue()
    blocked.push(route.request().url()); return route.abort()
  })
  const ready = async () => {
    await page.waitForFunction(() => document.body.innerText.includes('demo-field-notes'))
    await page.evaluate(() => document.fonts.ready)
  }
  const capture = async name => {
    await page.mouse.move(0, 0)
    await page.screenshot({ path: join(output, name), animations: 'disabled' })
    captures.push({ file: name, width: page.viewportSize().width * 2, height: page.viewportSize().height * 2 })
  }
  const settled = () => page.waitForFunction(() => !document.querySelector('[data-slot="skeleton"]'))
  const tab = name => page.getByRole('tab', { name: new RegExp(`^${name}\\b`) })
  await page.goto(origin); await ready(); await settled()
  await capture('memory-dark.png')
  await checkAccessibility('memory-dark')
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => /\/ask(?:\?|$)|\/correction/.test(call.path))), false, 'Landing must not ask or write automatically')

  // Inspect a conclusion's premises from the master list.
  await page.getByRole('button', { name: /Morning-length routes/ }).click()
  await page.waitForFunction(() => window.demoCalls.some(call => call.path.startsWith('/conclusion-detail')))
  await page.getByRole('heading', { name: 'Premises', exact: true }).waitFor()
  await settled()
  await capture('provenance.png')
  await checkAccessibility('provenance')

  // Semantic conclusion search submits on Enter only.
  await page.getByRole('button', { name: 'Close conclusion' }).click()
  await page.getByRole('textbox', { name: 'Search memory', exact: true }).fill('kilometers')
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => call.path.startsWith('/conclusion-search'))), false)
  await page.getByRole('textbox', { name: 'Search memory', exact: true }).press('Enter')
  await page.waitForFunction(() => window.demoCalls.some(call => call.path.startsWith('/conclusion-search')))
  await page.getByText('Results for “kilometers”').waitFor()
  await capture('memory-search.png')

  for (const [name, file] of [['Messages', 'messages.png'], ['Context', 'context.png'], ['Status', 'diagnostics.png']]) {
    await tab(name).click()
    await settled()
    await capture(file)
  }
  await checkAccessibility('status')
  await tab('Messages').click(); await settled()
  await page.getByRole('textbox', { name: 'Search messages', exact: true }).fill('routes')
  await page.getByRole('textbox', { name: 'Search messages', exact: true }).press('Enter')
  await page.getByText('Results for “routes”').waitFor()
  await capture('search.png')

  await page.getByRole('button', { name: 'Add to session', exact: true }).click()
  await page.getByRole('textbox', { name: 'Text to add to the current Honcho session' }).fill('Synthetic source note: coastal routes should include tide reminders, a wind layer, and practical rest stops.')
  await capture('add-to-session.png')
  await checkAccessibility('add-to-session')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => /upload/.test(call.path))), false)

  await tab('Ask').click()
  await page.getByRole('textbox', { name: 'Question for memory', exact: true }).fill('Which units and format should the route pages use?')
  assert.equal(await page.evaluate(() => window.demoCalls.filter(call => call.path.startsWith('/ask')).length), 0)
  await page.getByRole('button', { name: 'Ask memory', exact: true }).click()
  await page.getByText('Use kilometers. Keep each route overview short', { exact: false }).waitFor()
  assert.equal(await page.evaluate(() => window.demoCalls.filter(call => call.path.startsWith('/ask')).length), 1)
  await capture('ask-memory.png')
  await checkAccessibility('ask-memory')

  // Accessed records open in Memory's inspector.
  await page.getByRole('button', { name: /Wants each route to end/ }).click()
  await page.getByRole('heading', { name: 'Premises', exact: true }).waitFor()
  assert.equal(await page.getByRole('tab', { name: /^Memory\b/ }).getAttribute('aria-selected'), 'true')

  // Correct a selected conclusion. Cancelling sends nothing.
  await page.getByRole('button', { name: 'Add correction', exact: true }).click()
  await page.getByRole('textbox', { name: 'Corrective fact', exact: true }).fill('Each route ends with a packing checklist and a water-refill note.')
  await capture('correction.png')
  await checkAccessibility('correction')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => call.path.startsWith('/correction'))), false, 'Cancellation must not prepare or write a correction')
  await page.getByRole('button', { name: 'Add correction', exact: true }).click()
  await page.getByRole('textbox', { name: 'Corrective fact', exact: true }).fill('Each route ends with a packing checklist and a water-refill note.')
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await page.waitForFunction(() => window.demoCalls.some(call => call.path.startsWith('/corrections')))
  await page.getByText('Correction saved and verified').waitFor()
  assert.equal(await page.evaluate(() => window.demoCalls.filter(call => call.path.startsWith('/corrections')).length), 1)

  // Light-theme captures and accessibility checks.
  await page.goto(`${origin}/?theme=light`); await ready(); await settled(); await capture('memory-light.png')
  await checkAccessibility('memory-light')
  await page.getByRole('button', { name: /Morning-length routes/ }).click()
  await page.getByRole('heading', { name: 'Premises', exact: true }).waitFor(); await settled()
  await capture('provenance-light.png')
  await checkAccessibility('provenance-light')
  await page.getByRole('button', { name: 'Add correction', exact: true }).click()
  await page.getByRole('textbox', { name: 'Corrective fact', exact: true }).fill('Each route ends with a packing checklist and a water-refill note.')
  await capture('correction-light.png')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await page.getByRole('button', { name: 'Close conclusion' }).click()
  await tab('Ask').click()
  await page.getByRole('textbox', { name: 'Question for memory', exact: true }).fill('Which units and format should the route pages use?')
  await page.getByRole('button', { name: 'Ask memory', exact: true }).click()
  await page.getByText('Use kilometers. Keep each route overview short', { exact: false }).waitFor()
  await capture('ask-light.png')
  await checkAccessibility('ask-light')
  await tab('Messages').click(); await settled()
  await page.getByRole('textbox', { name: 'Search messages', exact: true }).fill('routes')
  await page.getByRole('textbox', { name: 'Search messages', exact: true }).press('Enter')
  await page.getByText('Results for “routes”').waitFor()
  await capture('search-light.png')
  await tab('Status').click(); await settled()
  await capture('status-light.png')
  await checkAccessibility('status-light')
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => /\/correction|upload/.test(call.path))), false, 'Light gallery pass must not write')

  await page.setViewportSize({ width: 1600, height: 1000 })
  await page.goto(origin); await ready(); await settled(); await capture('memory-wide.png')
  await page.setViewportSize({ width: 380, height: 1100 })
  await page.goto(`${origin}/?pane=1`); await ready(); await settled(); await capture('memory-pane.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Narrow pane must not overflow')
  await page.getByRole('button', { name: /Morning-length routes/ }).click()
  await page.getByRole('button', { name: 'All conclusions' }).waitFor(); await settled()
  await capture('memory-pane-detail.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Narrow inspector must not overflow')
  await page.goto(`${origin}/?pane=1&theme=light`); await ready(); await settled(); await capture('memory-narrow-light.png')
  await checkAccessibility('memory-narrow-light')
  await page.getByRole('button', { name: /Morning-length routes/ }).click()
  await page.getByRole('button', { name: 'All conclusions' }).waitFor(); await settled()
  await capture('memory-pane-detail-light.png')
  await page.setViewportSize({ width: 1200, height: 800 })

  await page.goto(`${origin}/?scenario=unsupported`); await ready(); await settled()
  await tab('Ask').click()
  await capture('unsupported.png')
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => call.path.startsWith('/ask'))), false)
  assert.equal(await page.getByRole('button', { name: 'Ask memory', exact: true }).isDisabled(), true)

  await page.goto(`${origin}/?scenario=unknown-correction`); await ready(); await settled()
  await page.getByRole('button', { name: 'Add fact', exact: true }).click()
  await page.getByRole('textbox', { name: 'Corrective fact' }).fill('Synthetic corrective fact.')
  await page.getByRole('button', { name: 'Save correction', exact: true }).click()
  await page.getByText('Outcome unknown', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: 'Save correction' }).isDisabled(), true)
  assert.equal(await page.evaluate(() => window.demoCalls.filter(c => c.path.startsWith('/corrections')).length), 1)
  await capture('unknown-correction.png')

  // Block at the HTTP boundary, not with timing sleeps. A stale confirmation
  // must not dispatch a write after the focused conversation changes.
  await page.goto(origin); await ready(); await settled()
  await page.getByRole('button', { name: 'Add fact', exact: true }).click()
  await page.getByRole('textbox', { name: 'Corrective fact' }).fill('Synthetic stale fact.')
  await page.evaluate(() => { window.demoHolds['/correction-ticket'] = true })
  await page.getByRole('button', { name: 'Save correction' }).evaluate(button => { button.click(); button.click() })
  await page.waitForFunction(() => window.demoReleases['/correction-ticket'])
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog').count(), 1, 'Pending correction must not dismiss')
  assert.equal(await page.evaluate(() => window.demoCalls.filter(c => c.path.startsWith('/correction-ticket')).length), 1)
  await page.evaluate(() => { window.demoHost.state.focusedStoredSessionId.set('different-conversation') })
  await page.getByRole('dialog').waitFor({ state: 'detached' })
  await page.evaluate(() => window.demoReleases['/correction-ticket']())
  await page.getByRole('button', { name: 'Add fact', exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.demoCalls.some(c => c.path.startsWith('/corrections'))), false)

  await page.goto(origin); await ready(); await settled()
  await tab('Ask').click()
  await page.getByRole('textbox', { name: 'Question for memory' }).fill('Synthetic delayed question?')
  await page.evaluate(() => { window.demoHolds['/ask'] = true })
  await page.getByRole('button', { name: 'Ask memory', exact: true }).evaluate(button => { button.click(); button.click() })
  await page.waitForFunction(() => window.demoReleases['/ask'])
  assert.equal(await page.evaluate(() => window.demoCalls.filter(c => c.path.startsWith('/ask')).length), 1)
  await page.evaluate(() => window.demoHost.state.focusedStoredSessionId.set('another-conversation'))
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '')
  await page.evaluate(() => window.demoReleases['/ask']())
  assert.equal(await page.getByText('Use kilometers. Keep each route overview short', { exact: false }).count(), 0, 'Old answers must not appear under new focus')

  await page.goto(`${origin}/?scenario=cross-profile`); await ready(); await settled()
  assert.equal(await page.getByText('Owner unknown').count() + await page.getByText('Other connection').count(), 0, 'Another local profile must not be blocked')
  assert.equal(await page.evaluate(() => window.demoCalls.every(c => c.path.includes('profile=demo') && c.body?.profile === 'demo')), true, 'Reads must target the chat owner profile')
  await capture('cross-profile.png')

  await page.goto(`${origin}/?scenario=draft`)
  await page.getByText('No Honcho session for this chat').waitFor()
  assert.equal(await page.getByText('Not saved yet').count(), 1)
  assert.equal(await page.getByRole('button', { name: 'Add to session', exact: true }).isDisabled(), true)
  assert.equal(await page.evaluate(() => window.demoCalls.every(c => c.path.startsWith('/snapshot'))), true, 'A draft must not fan out into section reads')
  await capture('draft.png')
  await checkAccessibility('draft')

  await page.goto(`${origin}/?scenario=disconnected`)
  await page.getByText('Synthetic disconnected backend', { exact: false }).first().waitFor()
  assert.equal(await page.getByRole('button', { name: 'Add to session', exact: true }).isDisabled(), true)
  await capture('disconnected.png')
  await checkAccessibility('disconnected')

  await page.setViewportSize({ width: 360, height: 1200 })
  await page.goto(`${origin}/?pane=1&scenario=focus-handoff`); await ready()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.waitForFunction(() => window.demoHost.state.focusedStoredSessionId.get() === 'primary-other')
  await page.getByRole('button', { name: /^Section:/ }).click()
  await page.getByRole('menuitem', { name: /^Messages/ }).click()
  await page.waitForFunction(() => window.demoCalls.some(c => c.path.startsWith('/messages')))
  assert.equal(await page.evaluate(() => window.demoCalls.every(c => c.body.stored_session_id === 'demo-conversation')), true, 'Pane and portalled menu must retain the inspected tile, not the host primary')
  await page.getByRole('button', { name: 'Open Honcho page' }).click()
  await page.waitForFunction(() => window.demoHost.state.focusedStoredSessionId.get() === null)
  await page.locator('#honcho-page-section').waitFor()
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await page.getByRole('button', { name: 'Add to session', exact: true }).click()
  await page.getByRole('textbox', { name: 'Text to add to the current Honcho session' }).fill('Synthetic focus retention check. Do not submit.')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.demoCalls.every(c => c.body.stored_session_id === 'demo-conversation')), true, 'Sidebar navigation and dialog must retain the inspected tile')
  assert.deepEqual(accessibility.flatMap(result => result.violations), [], 'Accessibility violations')
  assert.deepEqual(errors, [], 'Browser runtime errors')
  assert.deepEqual(blocked, [], 'Unexpected external network requests')
  const report = {
    synthetic: true,
    host_commit: execFileSync('git', ['-C', hostRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    plugin_sha256: (await import('node:crypto')).createHash('sha256').update(pluginSource).digest('hex'),
    captures, accessibility, browser_errors: errors, external_requests: blocked, upload_requests: 0,
    exercised: ['landing does not reason or write', 'every section', 'conclusion search submits on Enter only', 'message search', 'premise inspection', 'explicit memory question', 'accessed record opens in the inspector', 'correction cancel without requests', 'confirmed synthetic correction', 'wide, pane, and inspector layouts in light and dark', 'unsupported capabilities', 'unknown write without retry', 'pending write dismissal and duplicate-submit guard', 'focus change suppresses stale answers and prevents confirmed write', 'another local profile reads in its owner profile', 'draft chat without a session', 'disconnected state', 'pane focus handoff retains inspected tile', 'portalled menu preserves inspection target', 'host sidebar navigation preserves inspection target without reading host markup']
  }
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(work, { recursive: true, force: true })
}
