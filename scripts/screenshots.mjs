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
const output = join(repo, 'docs/screenshots')
await mkdir(output, { recursive: true })
const hostHtml = await readFile(join(dist, 'index.html'), 'utf8')
const cssLinks = [...hostHtml.matchAll(/href="([^"]+\.css)"/g)].map(m => m[1])
assert(cssLinks.length, 'Build Hermes Desktop first: no shipped stylesheet found.')
const sdkSource = await readFile(join(src, 'sdk/index.ts'), 'utf8')
const pluginSource = await readFile(join(repo, 'desktop/plugin.js'), 'utf8')
const uiModules = {
  Badge: 'badge', Button: 'button', Codicon: 'codicon', CopyButton: 'copy-button',
  Dialog: 'dialog', DialogContent: 'dialog', DialogDescription: 'dialog', DialogFooter: 'dialog', DialogHeader: 'dialog', DialogTitle: 'dialog',
  EmptyState: 'empty-state', Input: 'input', SearchField: 'search-field', SegmentedControl: 'segmented-control',
  Select: 'select', SelectContent: 'select', SelectItem: 'select', SelectTrigger: 'select', SelectValue: 'select',
  Skeleton: 'skeleton', Tabs: 'tabs', TabsList: 'tabs', TabsTrigger: 'tabs', Textarea: 'textarea', Tip: 'tooltip',
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
 const chatFontFamily = '', resolveChatFontFamily = (_, fallback) => fallback;
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
${Object.entries(uiModules).map(([name, path]) => `export { ${name} } from '@/components/ui/${path}';`).join('\n')}
export const PANES_AREA='panes', PALETTE_AREA='palette', ROUTES_AREA='routes', SIDEBAR_NAV_AREA='sidebar.nav', STATUSBAR_AREAS={right:'statusBar.right'};
const values={profile:'demo',focusedSessionProfile:'demo',focusedSessionOwner:{profile:'demo',connectionId:'local'},connectionId:'local',focusedSessionId:'demo-runtime',focusedStoredSessionId:'demo-conversation',cwd:'/demo/field-guide',busy:false,awaitingResponse:false,viewport:{width:1200}};
export const host={state:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,atom(value)])),paneVisibility:()=>atom(true),navigate:()=>{},notify:()=>{}};
`
const virtual = {
  '@hermes/plugin-sdk': sdk,
  'demo-theme': theme,
  '@/i18n': "import { en } from '@/i18n/en'; export const useI18n=()=>({t:en,locale:'en'});",
  '@/lib/keybinds/use-keybind-hint': 'export const useKeybindHint=()=>null;',
  '@/lib/haptics': 'export const triggerHaptic=()=>{};',
}
let server, browser
try {
  await build({ entryPoints: [join(repo, 'tests/screenshots/app.mjs')], outfile: join(work, 'app.js'), bundle: true, format: 'esm', jsx: 'automatic', platform: 'browser', nodePaths: [join(hostRoot, 'node_modules')], define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'isolated-host-ui', setup(builder) {
    builder.onResolve({ filter: /.*/ }, args => {
      if (args.path in virtual) return { path: args.path, namespace: 'demo' }
      if (args.path.startsWith('@/')) return { path: args.path.slice(2), namespace: 'host-source' }
    })
    builder.onLoad({ filter: /.*/, namespace: 'demo' }, args => ({ contents: virtual[args.path], loader: 'tsx', resolveDir: src }))
    builder.onLoad({ filter: /.*/, namespace: 'host-source' }, async args => {
      const target = join(src, args.path)
      for (const suffix of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
        try { return { contents: await readFile(target + suffix, 'utf8'), loader: (target + suffix).endsWith('.css') ? 'css' : 'tsx', resolveDir: dirname(target + suffix) } } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error }
      }
      throw new Error(`Missing host module: ${args.path}`)
    })
  } }] })
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Honcho synthetic demo</title>${cssLinks.map(url => `<link rel="stylesheet" href="${url}">`).join('')}<link rel="stylesheet" href="/app.css"><style>body{margin:0;background:var(--ui-bg-base,var(--dt-background));color:var(--ui-text-primary);font-family:var(--dt-font-sans)}#demo-label{padding:10px 24px;border-bottom:1px solid var(--ui-stroke-tertiary);font-size:12px;color:var(--ui-text-secondary)}#root{height:calc(100vh - 38px)}</style></head><body><div id="demo-label">Honcho for Hermes · Synthetic demo data · No live account connected</div><div id="root"></div><script type="module" src="/app.js"></script></body></html>`
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
  await page.goto(origin); await ready()
  await capture('overview-dark.png')
  for (const [tab, name] of [['Messages', 'messages.png'], ['Conclusions', 'conclusions.png'], ['Context', 'context.png'], ['Activity', null], ['Search', 'search.png']]) {
    await page.getByRole('tab', { name: tab, exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('[data-slot="skeleton"]'))
    if (tab === 'Search') {
      await page.getByRole('textbox').first().fill('routes')
      await page.getByRole('button', { name: 'Search', exact: true }).click()
      await page.getByText('MATCHES', { exact: false }).waitFor()
    }
    if (name) await capture(name)
  }
  await page.getByRole('button', { name: 'Add to session', exact: true }).click()
  await page.getByRole('textbox', { name: 'Text to add to the current Honcho session' }).fill('Synthetic source note: coastal routes should include tide reminders, a wind layer, and practical rest stops.')
  await capture('add-to-session.png')
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  assert.equal(await page.evaluate(() => window.demoCalls.some(call => /upload/.test(call.path))), false)
  await page.goto(`${origin}/?theme=light`); await ready(); await capture('overview-light.png')
  await page.setViewportSize({ width: 1600, height: 800 })
  await page.goto(origin); await ready(); await capture('banner.png')
  await page.setViewportSize({ width: 360, height: 1200 })
  await page.goto(`${origin}/?pane=1`); await ready(); await capture('memory-pane.png')
  assert.deepEqual(errors, [], 'Browser runtime errors')
  assert.deepEqual(blocked, [], 'Unexpected external network requests')
  const report = { synthetic: true, host_commit: execFileSync('git', ['-C', hostRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), plugin_sha256: (await import('node:crypto')).createHash('sha256').update(pluginSource).digest('hex'), captures, browser_errors: errors, external_requests: blocked, upload_requests: 0 }
  await writeFile(join(output, 'verification.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
  if (server) await new Promise(resolve => server.close(resolve))
  await rm(work, { recursive: true, force: true })
}
