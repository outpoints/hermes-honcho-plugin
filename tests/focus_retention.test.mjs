import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
function atom(value) {
  const listeners = new Set()
  return { get: () => value, set(next) { if (next === value) return; value = next; for (const fn of listeners) fn(value) }, listen(fn) { listeners.add(fn); return () => listeners.delete(fn) } }
}
function setup() {
  const handlers = new Map(), disposers = [], calls = [], contributions = []
  const window = {
    location: { hash: '#/chat/tile-a' },
    addEventListener(name, fn) { const list = handlers.get(name) || new Set(); list.add(fn); handlers.set(name, list) },
    removeEventListener(name, fn) { handlers.get(name)?.delete(fn) },
  }
  const values = { profile: 'default', connectionId: 'local', focusedSessionProfile: 'default', focusedSessionOwner: { profile: 'default', connectionId: 'local' }, focusedSessionId: 'runtime-a', focusedStoredSessionId: 'tile-a', cwd: '/fixture', busy: false, awaitingResponse: false }
  const host = { state: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, atom(v)])), navigate(path) { window.location.hash = `#${path}` } }
  const clock = { value: 1_000_000 }
  class FakeDate extends Date { static now() { return clock.value } }
  const sandbox = vm.createContext({ atom, host, window, queueMicrotask, setTimeout, clearTimeout, URL, Date: FakeDate, createContext: value => ({ value }), useValue: store => store.get(), jsx() {}, jsxs() {}, ROUTES_AREA: 'routes', PANES_AREA: 'panes', SIDEBAR_NAV_AREA: 'nav', STATUSBAR_AREAS: { right: 'status' }, PALETTE_AREA: 'palette' })
  vm.runInContext(source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '').replace('export default', 'const plugin ='), sandbox)
  sandbox.ctx = { rest: async (path, options) => { calls.push({ path, options }); return { ok: true } }, registerMany: items => contributions.push(...items), onDispose: fn => disposers.push(fn) }
  vm.runInContext('plugin.register(ctx)', sandbox)
  // Host chrome (a sidebar row, a link) is just "not the plugin": the plugin
  // must not inspect host markup to recognize it.
  const event = (kind, own = true, key) => {
    const target = { closest: selector => own === true && selector === '[data-honcho-surface]' ? target : null }
    for (const fn of handlers.get(kind) || []) fn({ type: kind, key, target, composedPath: () => [target] })
  }
  const navigate = hash => {
    window.location.hash = hash
    for (const fn of handlers.get('hashchange') || []) fn({ type: 'hashchange' })
  }
  const fallback = (stored = null, runtime = null) => {
    host.state.focusedStoredSessionId.set(stored)
    host.state.focusedSessionId.set(runtime)
  }
  return { sandbox, host, window, calls, contributions, event, navigate, fallback, clock, dispose: () => disposers.forEach(fn => fn()), handlers }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

test('clicking the Honcho pane retains the inspected tile for reads and imperative guards', async () => {
  const f = setup()
  const before = f.sandbox.useFocusScope()
  f.event('pointerdown') // Window capture precedes the host pane's focus handler.
  f.fallback() // Host now focuses the plugin, whose primary selection is empty.
  await settle()
  const after = f.sandbox.useFocusScope()
  assert.equal(after.storedSessionId, 'tile-a')
  assert.equal(after.fingerprint, before.fingerprint)
  await f.sandbox.requestForFocus(before, '/snapshot', { method: 'POST', body: before.body })
  assert.equal(f.calls[0].options.body.stored_session_id, 'tile-a')
  f.dispose()
})

test('sidebar navigation retains the tile through primary fallback and asynchronous route clearing', async () => {
  const f = setup()
  f.event('pointerdown', 'nav')
  f.fallback('primary-b', 'runtime-b')
  await settle()
  f.event('click', 'nav')
  f.navigate('#/honcho')
  await settle()
  f.fallback()
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.dispose()
})

test('palette navigation retains the inspected tile without a mounted Honcho pane', async () => {
  const f = setup()
  f.contributions.find(item => item.id === 'open').data.run()
  await settle()
  f.fallback()
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.dispose()
})

test('navigation promoted during the capture event still settles and rejects a later chat switch', async () => {
  const f = setup()
  const before = f.sandbox.useFocusScope()
  f.event('pointerdown')
  f.contributions.find(item => item.id === 'open').data.run()
  f.fallback()
  await settle()
  f.fallback('tile-c', 'runtime-c')
  await assert.rejects(f.sandbox.requestForFocus(before, '/snapshot', { body: before.body }), /changed/)
  assert.equal(f.calls.length, 0)
  f.dispose()
})

test('host sidebar navigation retains the chat without reading host markup', async () => {
  const f = setup()
  f.event('pointerdown', 'sidebar')
  f.fallback()
  await settle()
  f.event('click', 'sidebar')
  f.navigate('#/honcho')
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.dispose()
})

test('keyboard activation of host navigation retains the chat too', async () => {
  const f = setup()
  f.event('keydown', 'sidebar', 'Tab')
  f.event('keydown', 'sidebar', 'Enter')
  f.fallback()
  f.navigate('#/honcho')
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.dispose()
})

test('a stale outside interaction never decides a later navigation', async () => {
  const f = setup()
  f.event('pointerdown', false)
  f.clock.value += 5_000
  f.fallback()
  f.navigate('#/honcho')
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, null)
  f.dispose()
})

test('a chat from another local profile is inspectable rather than blocked', async () => {
  const f = setup()
  f.host.state.focusedSessionOwner.set({ profile: 'research', connectionId: 'local' })
  f.host.state.focusedSessionProfile.set('research')
  const scope = f.sandbox.useFocusScope()
  assert.equal(scope.routeMismatch, false)
  await f.sandbox.requestForFocus(scope, '/snapshot', { method: 'POST', body: scope.body })
  assert.equal(f.calls[0].path, '/snapshot?profile=research')
  f.dispose()
})

test('retention never substitutes another primary chat and ends on an outside interaction', async () => {
  const f = setup()
  f.event('pointerdown')
  f.fallback('primary-b', 'runtime-b')
  await settle()
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.event('focusin')
  f.event('click')
  f.event('click', false) // Radix Select can retarget the opening click to HTML.
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
  f.event('pointerdown', false)
  // The press is settled by its click, after the host's own handlers ran.
  f.event('click', false)
  assert.equal(f.sandbox.useFocusScope().storedSessionId, 'primary-b')
  f.dispose()
})

for (const [field, value] of [
  ['profile', 'research'], ['connectionId', 'other-server'], ['cwd', '/other-workspace'],
  ['focusedStoredSessionId', 'tile-c'], ['focusedSessionId', 'runtime-c'],
  ['focusedSessionOwner', { profile: 'other-profile', connectionId: 'local' }],
]) {
  test(`retention rejects stale requests when ${field} changes`, async () => {
    const f = setup()
    const before = f.sandbox.useFocusScope()
    f.event('pointerdown')
    f.fallback()
    await settle()
    f.host.state[field].set(value)
    await assert.rejects(f.sandbox.requestForFocus(before, '/correction-ticket', { body: before.body }), /changed/)
    assert.equal(f.calls.length, 0)
    await settle()
    assert.notEqual(f.sandbox.useFocusScope().storedSessionId, 'tile-a')
    f.dispose()
  })
}

test('a draft, unresolved owner and navigation away never inherit old inspection data', async () => {
  for (const draft of [true, false]) {
    const f = setup()
    if (draft) f.fallback()
    else f.host.state.focusedSessionOwner.set(null)
    f.event('pointerdown')
    await settle()
    assert.equal(f.sandbox.useFocusScope().routeMismatch, !draft)
    assert.equal(vm.runInContext('$inspectionFocus.get()', f.sandbox), null)
    f.dispose()
  }
  const f = setup()
  f.contributions.find(item => item.id === 'open').data.run()
  f.fallback()
  await settle()
  f.navigate('#/chat/new')
  assert.equal(f.sandbox.useFocusScope().storedSessionId, null)
  f.dispose()
  assert.ok([...f.handlers.values()].every(list => list.size === 0))
})
