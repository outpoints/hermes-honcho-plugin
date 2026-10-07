// Development-only: render the catalog banner and gallery from the synthetic
// captures in docs/screenshots. The art borrows the Nous Research look: an
// off-white field, Nous blue, Rules Compressed headlines, Rules Expanded labels,
// and blue ordered-dither imagery. Fonts load from the prepared Hermes checkout's
// @nous-research/ui package and are never copied into this repository.
//
//   HERMES_SOURCE=/path/to/hermes-agent node scripts/catalog-art.mjs
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
assert(process.env.HERMES_SOURCE, 'Set HERMES_SOURCE to a prepared Hermes checkout.')
const host = resolve(process.env.HERMES_SOURCE)
const { chromium } = createRequire(join(host, 'package.json'))('playwright')
const fonts = join(host, 'node_modules/@nous-research/ui/dist/fonts')
const assets = join(host, 'apps/desktop/dist/assets')
const shots = join(repo, 'docs/screenshots')
const output = join(repo, 'docs/catalog')
await mkdir(output, { recursive: true })
const mono = (await readdir(assets)).find(name => /^JetBrainsMono-Regular-.*\.woff2$/.test(name))
assert(mono, 'Build Hermes Desktop first: JetBrains Mono not found in apps/desktop/dist/assets.')

const BLUE = '#0000f2'
const PAPER = '#f2f2f2'
const css = `
@font-face { font-family: Compressed; src: url(/fonts/RulesCompressed-Regular.woff2) format('woff2'); }
@font-face { font-family: Expanded; font-weight: 700; src: url(/fonts/RulesExpanded-Bold.woff2) format('woff2'); }
@font-face { font-family: Expanded; font-weight: 400; src: url(/fonts/RulesExpanded-Regular.woff2) format('woff2'); }
@font-face { font-family: Mono; src: url(/assets/${mono}) format('woff2'); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 1200px; height: 600px; overflow: hidden; background: ${PAPER}; color: ${BLUE}; }
body { position: relative; font-family: Mono, monospace; -webkit-font-smoothing: antialiased; }
.frame { position: absolute; inset: 0; border: 4px solid ${BLUE}; pointer-events: none; z-index: 5; }
.label { font-family: Expanded; font-weight: 700; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; }
.headline { font-family: Compressed; font-weight: 400; text-transform: uppercase; line-height: 0.86; letter-spacing: -0.005em; }
.body { font-size: 13px; line-height: 1.55; }
.shot { display: block; border: 1px solid ${BLUE}; background: #fff; }
canvas { display: block; }
`

// Ordered (Bayer 8x8) dither: dark UI becomes Nous blue, light detail becomes
// paper-colored dots, and the image dissolves into solid blue below `fade`.
const ditherScript = `
const BAYER = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21]
window.dither = async (canvas, src, { cell = 2, fade = 0.55, crop }) => {
  const image = new Image(); image.src = src; await image.decode()
  const width = canvas.width, height = canvas.height
  const work = document.createElement('canvas'); work.width = Math.ceil(width / cell); work.height = Math.ceil(height / cell)
  const ctx = work.getContext('2d')
  const [sx, sy, sw, sh] = crop || [0, 0, image.width, image.height]
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, work.width, work.height)
  const data = ctx.getImageData(0, 0, work.width, work.height).data
  const out = canvas.getContext('2d'); out.fillStyle = '${BLUE}'; out.fillRect(0, 0, width, height); out.fillStyle = '${PAPER}'
  for (let y = 0; y < work.height; y++) {
    const fadeOut = Math.max(0, (y / work.height - fade) / (1 - fade))
    for (let x = 0; x < work.width; x++) {
      const i = (y * work.width + x) * 4
      const lum = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255
      const level = Math.min(1, lum * 1.9) * (1 - fadeOut) ** 1.6
      if (level > (BAYER[(y % 8) * 8 + (x % 8)] + 0.5) / 64) out.fillRect(x * cell, y * cell, cell, cell)
    }
  }
}
`

// The harness adds a 38px "synthetic demo data" bar; the art states that in a label instead.
const BAR = 38
// `source` is the capture's CSS width (1200 for page captures, 380 for the pane).
const fit = (name, { x, y, w, h, source = 1200 }) => `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;overflow:hidden" class="shot"><img src="/shots/${name}" style="display:block;width:${w}px;margin-top:${-BAR * w / source}px"></div>`

function slide({ label, headline, size = 92, body, art }) {
  return `<div class="frame"></div>
  <div style="position:absolute;left:44px;top:42px;width:300px;height:516px;display:flex;flex-direction:column">
    <div class="label">${label}</div>
    <div class="headline" style="font-size:${size}px;margin-top:22px">${headline}</div>
    <p class="body" style="margin-top:22px;max-width:290px">${body}</p>
    <div style="flex:1"></div>
    <div class="label" style="font-weight:400;font-size:9.5px">Synthetic demo data</div>
  </div>
  ${art}`
}

const pages = {
  'banner.png': `<div class="frame"></div>
    <div style="position:absolute;left:44px;top:42px;width:600px;height:516px;display:flex;flex-direction:column">
      <div class="label">Hermes Desktop plugin · Community</div>
      <div class="headline" style="font-size:204px;margin-top:28px">Honcho<br>Memory</div>
      <div style="flex:1"></div>
      <p class="body" style="max-width:470px;font-size:15px">Read, search, question, and correct the Honcho memory behind the chat in front of you.</p>
    </div>
    <canvas id="dither" width="520" height="600" style="position:absolute;right:0;top:0"></canvas>
    ${fit('memory-narrow-light.png', { x: 760, y: 84, w: 300, h: 432, source: 380 })}`,
  'gallery-memory.png': slide({
    label: 'Memory', headline: 'See what<br>Honcho<br>concluded',
    body: 'Newest conclusions from this chat’s Honcho session. Open one to see its premises and what was derived from it.',
    art: fit('provenance-light.png', { x: 376, y: 42, w: 780, h: 516 })
  }),
  'gallery-ask.png': slide({
    label: 'Ask', headline: 'Ask your<br>memory',
    body: 'Runs only when you ask. Lists the records Honcho read, so you can check the answer yourself.',
    art: fit('ask-light.png', { x: 376, y: 42, w: 780, h: 516 })
  }),
  'gallery-correct.png': slide({
    label: 'Correct', headline: 'Fix what<br>it got<br>wrong',
    body: 'Adds one explicit fact to the session you confirmed. Nothing is deleted, and the saved text is read back.',
    art: fit('correction-light.png', { x: 376, y: 42, w: 780, h: 516 })
  }),
  'gallery-pane.png': slide({
    label: 'Side pane', headline: 'Stays<br>with your<br>chat',
    body: 'Docks beside the conversation and follows the chat in focus, including chats from your other profiles.',
    art: `<canvas id="dither" width="824" height="592" style="position:absolute;left:372px;top:4px"></canvas>
      ${fit('memory-narrow-light.png', { x: 432, y: 42, w: 330, h: 516, source: 380 })}
      ${fit('memory-pane-detail-light.png', { x: 790, y: 42, w: 330, h: 516, source: 380 })}`
  }),
  'gallery-messages.png': slide({
    label: 'Messages', headline: 'Search<br>what was<br>said',
    body: 'Saved messages for the session, plus Honcho search across the session, the user, or the whole workspace.',
    art: fit('search-light.png', { x: 376, y: 42, w: 780, h: 516 })
  }),
  'gallery-status.png': slide({
    label: 'Status', headline: 'Know where<br>memory<br>lives',
    body: 'Connection, profile, Honcho session, and background reasoning for the chat in view.',
    art: fit('status-light.png', { x: 376, y: 42, w: 780, h: 516 })
  })
}

const mime = { '.woff2': 'font/woff2', '.png': 'image/png', '.html': 'text/html' }
const server = createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url, 'http://art').pathname)
    if (path.includes('..')) throw new Error('bad path')
    let file
    if (path.startsWith('/fonts/')) file = join(fonts, path.slice(7))
    else if (path.startsWith('/assets/')) file = join(assets, path.slice(8))
    else if (path.startsWith('/shots/')) file = join(shots, path.slice(7))
    else if (path.startsWith('/page/')) {
      const name = path.slice(6)
      response.writeHead(200, { 'Content-Type': 'text/html' })
      response.end(`<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${pages[name]}<script>${ditherScript}</script></body></html>`)
      return
    } else throw new Error('not found')
    response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
    response.end(await readFile(file))
  } catch {
    response.writeHead(404); response.end()
  }
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const written = []
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 600 }, deviceScaleFactor: 2 })
  const external = []
  await page.route('**/*', route => (new URL(route.request().url()).origin === origin ? route.continue() : (external.push(route.request().url()), route.abort())))
  for (const name of Object.keys(pages)) {
    await page.goto(`${origin}/page/${name}`)
    await page.evaluate(() => document.fonts.ready)
    await page.evaluate(async () => { await Promise.all([...document.images].map(image => image.decode())) })
    if (await page.locator('#dither').count()) {
      await page.evaluate(async () => window.dither(document.getElementById('dither'), '/shots/memory-dark.png', { cell: 2, fade: 0.5, crop: [0, 76, 2400, 1524] }))
    }
    const missing = await page.evaluate(async () => {
      const faces = ['12px Compressed', '700 12px Expanded', '400 12px Expanded', '12px Mono']
      await Promise.all(faces.map(face => document.fonts.load(face)))
      return faces.filter(face => !document.fonts.check(face))
    })
    assert.deepEqual(missing, [], `${name}: fonts did not load`)
    await page.screenshot({ path: join(output, name) })
    written.push(name)
  }
  assert.deepEqual(external, [], 'Art must not fetch external resources')
} finally {
  await browser.close()
  server.close()
}
console.log(JSON.stringify({ output: 'docs/catalog', images: written, size: '2400x1200' }, null, 2))
