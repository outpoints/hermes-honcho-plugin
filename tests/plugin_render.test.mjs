import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

// Evaluate the real uncompiled plugin with host/React bindings stubbed at the
// module boundary. No source-shape assertions or additional runtime packages.
const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const element = (type, props) => ({ type, props })
const sandbox = vm.createContext({
  atom: value => ({ get: () => value, set() {} }),
  createContext: value => ({ value }),
  jsx: element,
  jsxs: element,
  Codicon: 'codicon',
  Badge: 'badge',
})
vm.runInContext(
  source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '')
    .replace('export default', 'const plugin ='),
  sandbox
)

function renderedText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(renderedText).join(' ')
  if (typeof node === 'object') return renderedText(node.props?.children)
  return String(node)
}

const conclusion = {
  observer_id: 'agent', observed_id: 'human', content: 'Fixture fact.',
  level: 'deductive', source_session_id: 'fixture-session',
  belongs_to_current_session: true, created_at: '2026-01-01T00:00:00Z',
}

const uploadTarget = { workspace_id: 'fixture-workspace', session_id: 'fixture-session', peer_id: 'fixture-user' }
const uploadSnapshot = { data: { ok: true, chat: { found: true, honcho_session_id: 'fixture-session' }, config: { workspace_id: 'fixture-workspace', user_peer: 'fixture-user' } } }

test('conclusion rows distinguish parent conclusions from source messages', () => {
  const modern = renderedText(sandbox.ConclusionRow({ conclusion: {
    ...conclusion, source_ids: ['premise-a', 'premise-b'], times_derived: 7,
  } }))
  assert.match(modern, /7 derivations/)
  assert.match(modern, /Parent conclusions/)
  assert.match(modern, /premise-a/)
  assert.match(modern, /premise-b/)
  assert.doesNotMatch(modern, /source messages/i)
  const legacy = renderedText(sandbox.ConclusionRow({ conclusion }))
  assert.doesNotMatch(legacy, /derivations|Parent conclusions/)
})

test('context message readout never invents a zero token total', () => {
  assert.equal(typeof sandbox.contextMessageDetail, 'function')
  assert.equal(sandbox.contextMessageDetail({ messages: [{}], token_count: null }), '1 context messages · token total unavailable')
  assert.equal(sandbox.contextMessageDetail({ messages: [], token_count: 0 }), '0 context messages · 0 server-reported tokens')
})

test('local multiplexed requests carry their profile in the URL, not just the body', async () => {
  const calls = []
  sandbox.transport = async (path, options) => { calls.push({ path, options }); return { ok: true } }
  sandbox.useQuery = options => options
  vm.runInContext('requestPlugin = transport', sandbox)
  for (const profile of ['default', 'research']) {
    const focus = {
      activeProfile: profile, connectionId: 'local', routeMismatch: false,
      key: [profile, 'local'], body: { profile, focused_profile: profile },
    }
    for (const endpoint of ['/snapshot', '/messages', '/conclusions', '/context', '/search', '/scopes', '/activity']) {
      await sandbox.useEndpointForFocus(focus, endpoint).queryFn()
      const call = calls.at(-1)
      const url = new URL(call.path, 'http://fixture')
      assert.equal(url.pathname, endpoint)
      assert.equal(url.searchParams.get('profile'), profile)
      assert.equal(call.options.body.profile, profile)
    }
  }
})

test('upload ticket and multipart submission retain the same local profile', async () => {
  const calls = []
  sandbox.transport = async (path, options) => {
    calls.push({ path, options })
    return path.startsWith('/upload-ticket') ? { ok: true, ticket: 'fixture-ticket', target: uploadTarget } : { ok: true }
  }
  vm.runInContext('requestPlugin = transport', sandbox)
  sandbox.TextEncoder = TextEncoder
  sandbox.useValue = atom => atom.get()
  sandbox.useQueryClient = () => ({ invalidateQueries() {} })
  sandbox.useRef = current => ({ current })
  sandbox.useEffect = () => {}
  let stateIndex = 0
  sandbox.useState = initial => [stateIndex++ === 1 ? 'Fixture upload' : initial, () => {}]
  let mutation
  sandbox.useMutation = options => { mutation = options; return {} }
  const values = {
    profile: 'research', focusedSessionProfile: 'research', connectionId: 'local',
    focusedSessionOwner: { connectionId: 'local' }, focusedSessionId: 'fixture-session',
    focusedStoredSessionId: 'fixture-session', cwd: '/fixture', busy: false, awaitingResponse: false,
  }
  sandbox.host = { state: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) }
  for (const name of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'SegmentedControl', 'Textarea']) sandbox[name] = name
  sandbox.AddToSessionDialog({ origin: 'test', snapshot: uploadSnapshot })
  await mutation.mutationFn()
  assert.deepEqual(calls.map(call => call.path), [
    '/upload-ticket?profile=research', '/uploads/fixture-ticket?profile=research',
  ])
  assert.equal(calls[0].options.body.profile, 'research')
  assert.equal(new TextDecoder().decode(calls[1].options.upload.bytes), 'Fixture upload')
})

test('remote routing stays host-owned and mismatched focus cannot dispatch', async () => {
  const calls = []
  sandbox.transport = async path => calls.push(path)
  vm.runInContext('requestPlugin = transport', sandbox)
  const focus = { activeProfile: 'remote-alias', connectionId: 'fixture-ssh', routeMismatch: false }
  await sandbox.requestForFocus(focus, '/snapshot', {})
  assert.deepEqual(calls, ['/snapshot'])
  assert.throws(() => sandbox.requestForFocus({ ...focus, routeMismatch: true }, '/snapshot', {}), /does not match/)
  assert.equal(calls.length, 1)
})

test('native controls keep SDK styling while ownership values remain literal', () => {
  sandbox.Button = 'Button'
  sandbox.cn = (...parts) => parts.filter(Boolean).join(' ')
  sandbox.useContext = () => 'wide'
  const action = sandbox.ActionButton({ children: 'ADD_TO_SESSION', disabled: true })
  assert.equal(action.type, 'Button')
  assert.equal(action.props.disabled, true)
  assert.equal(action.props.className, undefined)
  assert.equal(renderedText(action).trim(), 'Add to session')
  const identifier = 'USER_PEER_WITH_UNDERSCORES'
  const row = sandbox.DetailRow({ label: 'ATTRIBUTED_PEER', value: identifier, mono: true })
  assert.equal(renderedText(row.props.children[0]), 'Attributed peer')
  assert.equal(renderedText(row.props.children[1]), identifier)
  assert.ok(row.props.style.gridTemplateColumns, 'runtime layout must not depend on generated Tailwind classes')
  assert.equal(row.props.children[1].props.style.overflowWrap, 'anywhere')
})

test('search submits on Enter or its named action, never on Clear or IME composition', () => {
  const recorded = []
  let stateIndex = 0
  sandbox.useContext = () => 'wide'
  sandbox.useState = initial => {
    const index = stateIndex++
    return [index === 0 ? 'ownership' : initial, value => { if (index === 4) recorded.push(value) }]
  }
  sandbox.useQuery = () => ({ data: { ok: true, items: [], capabilities: {} }, isFetching: false })
  sandbox.useEffect = () => {}
  sandbox.SearchField = 'SearchField'
  sandbox.Input = 'Input'
  sandbox.Select = 'Select'
  sandbox.SelectTrigger = 'SelectTrigger'
  sandbox.SelectValue = 'SelectValue'
  sandbox.SelectContent = 'SelectContent'
  sandbox.SelectItem = 'SelectItem'
  const tree = sandbox.SearchTab()
  const form = tree.props.children[0].props.children
  assert.equal(form.type, 'form')
  const event = (type, extra = {}) => ({ type, preventDefault() {}, nativeEvent: {}, ...extra })
  form.props.onSubmit(event('submit', { nativeEvent: { submitter: { name: '' } } }))
  assert.equal(recorded.length, 0, 'the shared clear button must not start a search')
  form.props.onKeyDown(event('keydown', { key: 'Enter', nativeEvent: { isComposing: true }, target: { matches: () => true } }))
  assert.equal(recorded.length, 0, 'IME Enter must not start a search')
  form.props.onKeyDown(event('keydown', { key: 'Enter', target: { matches: () => true } }))
  assert.equal(recorded.length, 1)
  form.props.onSubmit(event('submit', { nativeEvent: { submitter: { name: 'honcho-search' } } }))
  assert.equal(recorded.length, 2)
  assert.ok(recorded.every(run => run.query === 'ownership' && run.scope === 'session'))
})

test('page refresh invalidates visible reads only for the current focus', () => {
  const calls = []
  sandbox.useQueryClient = () => ({ invalidateQueries: filter => calls.push(filter) })
  sandbox.useContext = () => 'wide'
  sandbox.StatusDot = 'StatusDot'
  const focusKey = ['default', 'local', 'default', 'local', 'session', 'runtime', '/fixture']
  const tree = sandbox.PageHeader({ query: { key: focusKey, data: { ok: true }, refetch() {} } })
  const refresh = tree.props.children[1].props.children[1]
  refresh.props.onClick()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].predicate({ queryKey: ['hermes-honcho-plugin', '/messages', ...focusKey, 1] }), true)
  assert.equal(calls[0].predicate({ queryKey: ['hermes-honcho-plugin', '/messages', 'research'] }), false)
  assert.equal(calls[0].predicate({ queryKey: ['other-plugin', '/messages', ...focusKey] }), false)
})

test('partial endpoint results display diagnostics without discarding readable content', () => {
  const child = element('p', { children: 'Available fixture content' })
  const tree = sandbox.QueryState({ query: { data: { ok: true, errors: [{ scope: 'fixture', message: 'One layer unavailable' }] } }, title: 'CONTEXT', children: child })
  assert.notEqual(tree, child)
  assert.ok(tree.props.children.includes(child))
  assert.ok(tree.props.children.some(node => node?.type === sandbox.Diagnostics))
})

function prepareUploadDialog(transport, mutationState = {}) {
  for (const name of ['Dialog', 'DialogContent', 'DialogHeader', 'DialogTitle', 'DialogDescription', 'DialogFooter', 'SegmentedControl', 'Textarea']) sandbox[name] = name
  sandbox.transport = transport
  vm.runInContext('requestPlugin = transport', sandbox)
  sandbox.TextEncoder = TextEncoder
  sandbox.useValue = atom => atom.get()
  sandbox.useQueryClient = () => ({ invalidateQueries() {} })
  sandbox.useRef = current => ({ current })
  sandbox.useEffect = () => {}
  let stateIndex = 0
  sandbox.useState = initial => [stateIndex++ === 1 ? 'Fixture upload' : initial, () => {}]
  let mutation
  sandbox.useMutation = options => { mutation = options; return { reset() {}, ...mutationState } }
  const values = {
    profile: 'default', focusedSessionProfile: 'default', connectionId: 'local',
    focusedSessionOwner: { connectionId: 'local' }, focusedSessionId: 'fixture-session',
    focusedStoredSessionId: 'fixture-session', cwd: '/fixture', busy: false, awaitingResponse: false,
  }
  sandbox.host = { state: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }])) }
  const tree = sandbox.AddToSessionDialog({ origin: 'test', snapshot: uploadSnapshot })
  return { tree, mutation }
}

test('upload transport loss is unknown, with retries explicitly disabled', async () => {
  const { mutation } = prepareUploadDialog(async path => {
    if (path.startsWith('/upload-ticket')) return { ok: true, ticket: 'fixture-ticket', target: uploadTarget }
    throw new Error('Fixture connection lost')
  })
  assert.equal(mutation.retry, false)
  await assert.rejects(mutation.mutationFn(), error => {
    assert.equal(error.uploadState, 'outcome_unknown')
    assert.equal(error.committed, null)
    assert.match(error.message, /Messages.*before retrying/)
    return true
  })
})

test('pending upload cannot be dismissed or reset', () => {
  let resets = 0
  const { tree } = prepareUploadDialog(async () => ({}), { isPending: true, reset() { resets++ } })
  tree.props.onOpenChange(false)
  assert.equal(resets, 0, 'closing must not erase the in-flight submission guard')
})

test('upload dismissal guard takes effect before React Query rerenders', async () => {
  let resets = 0
  let release
  const waiting = new Promise(resolve => { release = resolve })
  const { tree, mutation } = prepareUploadDialog(async path => {
    if (path.startsWith('/upload-ticket')) return { ok: true, ticket: 'fixture-ticket', target: uploadTarget }
    return waiting
  }, { isPending: false, reset() { resets++ } })
  const pending = mutation.mutationFn()
  tree.props.onOpenChange(false)
  release({ ok: true })
  await pending
  assert.equal(resets, 0)
})

test('ticket must match the session and peer shown when the user confirmed', async () => {
  for (const field of ['workspace_id', 'session_id', 'peer_id']) {
    const calls = []
    const { mutation } = prepareUploadDialog(async path => {
      calls.push(path)
      return { ok: true, ticket: 'fixture-ticket', target: { ...uploadTarget, [field]: 'changed-target' } }
    })
    await assert.rejects(mutation.mutationFn(), /target changed/)
    assert.equal(calls.length, 1, 'mismatched ticket must not dispatch file content')
  }
})
