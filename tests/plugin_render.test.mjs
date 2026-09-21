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
    return path.startsWith('/upload-ticket') ? { ok: true, ticket: 'fixture-ticket' } : { ok: true }
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
  sandbox.AddToSessionDialog({ origin: 'test', snapshot: { data: { ok: true, chat: { found: true } } } })
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
