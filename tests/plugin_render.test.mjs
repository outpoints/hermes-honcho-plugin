import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

// Evaluate the real uncompiled plugin with host/React bindings stubbed at the
// module boundary. No additional runtime packages.
const source = await readFile(new URL('../desktop/plugin.js', import.meta.url), 'utf8')
const element = (type, props) => ({ type, props })
const sdkStubs = Object.fromEntries([
  'Button', 'Codicon', 'CopyButton', 'Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader',
  'DialogTitle', 'DisclosureCaret', 'DropdownMenu', 'DropdownMenuContent', 'DropdownMenuItem', 'DropdownMenuTrigger',
  'PanelEmpty', 'SearchField', 'SegmentedControl', 'Select', 'SelectContent', 'SelectItem', 'SelectTrigger', 'SelectValue',
  'Skeleton', 'StatusDot', 'Textarea', 'Tip'
].map(name => [name, name]))
const sandbox = vm.createContext({
  ...sdkStubs,
  atom: value => ({ get: () => value, set() {} }),
  createContext: value => ({ value }),
  cn: (...parts) => parts.filter(Boolean).join(' '),
  icons: new Proxy({}, { get: (_, name) => `icon:${String(name)}` }),
  jsx: element,
  jsxs: element,
})
vm.runInContext(
  source.replace(/import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"]/g, '').replace('export default', 'const plugin ='),
  sandbox
)

// Expand pure function components so assertions read what a user would see.
function renderedText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(renderedText).join(' ')
  if (typeof node === 'object') {
    if (typeof node.type === 'function' && ['MetaLine', 'StateLine', 'RegionHeading'].includes(node.type.name)) return renderedText(node.type(node.props))
    return renderedText(node.props?.children)
  }
  return String(node)
}

const conclusion = {
  id: 'fixture-conclusion', observer_id: 'agent', observed_id: 'human', content: 'Fixture fact.',
  level: 'deductive', source_session_id: 'fixture-session', belongs_to_current_session: true, created_at: '2026-01-01T00:00:00Z',
}
const uploadTarget = { workspace_id: 'fixture-workspace', session_id: 'fixture-session', peer_id: 'fixture-user' }
const uploadSnapshot = { data: { ok: true, profile: 'research', chat: { found: true, honcho_session_id: 'fixture-session' }, config: { workspace_id: 'fixture-workspace', user_peer: 'fixture-user' } } }

function setLiveFocus(overrides = {}) {
  const values = { profile: 'remote-alias', focusedSessionProfile: 'remote-alias', connectionId: 'fixture-ssh', focusedSessionOwner: { connectionId: 'fixture-ssh', profile: 'remote-alias' }, focusedSessionId: 'fixture-runtime', focusedStoredSessionId: 'fixture-stored', cwd: '/srv/fixture', busy: false, awaitingResponse: false, ...overrides }
  sandbox.host ||= {}
  sandbox.host.state = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { get: () => value }]))
  sandbox.useValue = atom => atom.get()
  return sandbox.useFocusScope()
}

function useTransport(handler = async () => ({ ok: true })) {
  const calls = []
  sandbox.transport = async (path, options) => { calls.push({ path, options }); return handler(path, options) }
  vm.runInContext('requestPlugin = transport', sandbox)
  return calls
}

test('memory is the landing section and operational status is secondary', () => {
  assert.equal(vm.runInContext('$activeTab.get()', sandbox), 'memory')
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(SECTIONS.map(section => section.id))', sandbox)), ['memory', 'ask', 'messages', 'context', 'status'])
  assert.equal(typeof sandbox.MemorySection, 'function')
  assert.equal(typeof sandbox.AskSection, 'function')
})

test('page and docked pane navigation target their own unique content region', () => {
  setLiveFocus()
  sandbox.useContext = () => 'wide'
  sandbox.useQuery = () => ({})
  sandbox.useEffect = () => {}
  const ids = []
  for (const origin of ['page', 'pane']) {
    const page = sandbox.HonchoPage({ origin })
    const children = page.props.children.props.children.props.children
    const section = children.find(child => child.type === 'section')
    const nav = children.find(child => child.type === sandbox.SectionNav)
    const tabs = sandbox.SectionNav(nav.props).props.children
    assert.equal(nav.props.origin, origin)
    assert.equal(section.props.role, 'tabpanel')
    for (const tab of tabs) {
      assert.equal(tab.props.role, 'tab')
      assert.equal(tab.props['aria-controls'], section.props.id)
      ids.push(tab.props.id)
    }
    ids.push(section.props.id)
  }
  assert.equal(new Set(ids).size, ids.length)
})

test('a chat from another profile on the same connection is read in its owner profile', async () => {
  const calls = useTransport()
  const focus = setLiveFocus({
    profile: 'default', focusedSessionProfile: 'research', connectionId: 'local',
    focusedSessionOwner: { connectionId: 'local', profile: 'research' },
  })
  assert.equal(focus.routeMismatch, false)
  assert.equal(focus.ownerProfile, 'research')
  await sandbox.requestForFocus(focus, '/snapshot', { method: 'POST', body: focus.body })
  assert.equal(calls[0].path, '/snapshot?profile=research')
  assert.equal(calls[0].options.body.profile, 'research')
  assert.equal(calls[0].options.body.focused_profile, 'research')
  assert.equal(calls[0].options.body.connection_id, 'local')
  assert.equal(calls[0].options.body.focused_connection_id, 'local')
})

test('a remote chat from another profile resolves that profile route, not the active one', async () => {
  const calls = useTransport()
  sandbox.queryClient = { fetchQuery: options => options.queryFn() }
  sandbox.host.profileRoutes = async () => [
    { connectionId: 'fixture-ssh', profile: 'alias-a', targetProfile: 'remote-a' },
    { connectionId: 'fixture-ssh', profile: 'alias-b', targetProfile: 'remote-b' },
  ]
  const focus = setLiveFocus({ profile: 'alias-a', focusedSessionProfile: 'alias-b', focusedSessionOwner: { connectionId: 'fixture-ssh', profile: 'alias-b' } })
  await sandbox.requestForFocus(focus, '/messages', { method: 'POST', body: focus.body })
  assert.equal(calls[0].path, '/messages?profile=remote-b')
  assert.equal(calls[0].options.body.profile, 'remote-b')
})

test('a chat on another connection stays blocked with a specific reason', async () => {
  const calls = useTransport()
  const focus = setLiveFocus({ profile: 'default', connectionId: 'local', focusedSessionOwner: { connectionId: 'fixture-ssh', profile: 'research' } })
  assert.equal(focus.routeMismatch, true)
  assert.equal(focus.blockReason, 'other_connection')
  await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /another Hermes connection/)
  assert.equal(calls.length, 0)
  assert.equal(sandbox.connectionStatus(focus).label, 'Other connection')
})

test('unresolved saved-session ownership fails closed instead of assuming the active profile', async () => {
  const calls = useTransport()
  const focus = setLiveFocus({ focusedSessionOwner: null })
  assert.equal(focus.routeMismatch, true)
  assert.equal(focus.blockReason, 'owner_unresolved')
  await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /paused/)
  assert.equal(calls.length, 0)
})

test('corrections compare the confirmed target and verify the exact content', async () => {
  const focus = setLiveFocus({ connectionId: 'local', focusedSessionOwner: { connectionId: 'local', profile: 'remote-alias' } })
  const target = { workspace_id: 'w', session_id: 's', observer_id: 'a', observed_id: 'u' }
  const calls = useTransport(async path => path.startsWith('/correction-ticket')
    ? { ok: true, ticket: 'one-time', target }
    : { ok: true, verified: true, outcome: 'verified', target, item: { id: 'new', content: 'Correction', observer_id: 'a', observed_id: 'u', source_session_id: 's' } })
  await sandbox.saveCorrectionForFocus(focus, target, 'Correction', null)
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.body.ticket, 'one-time')
  calls.length = 0
  await assert.rejects(sandbox.saveCorrectionForFocus(focus, { ...target, session_id: 'changed' }, 'Correction', null), /target changed/i)
  assert.equal(calls.length, 1, 'target mismatch must stop before the write')
})

test('lost correction response is unknown and cannot be retried automatically', async () => {
  const focus = setLiveFocus({ connectionId: 'local', focusedSessionOwner: { connectionId: 'local', profile: 'remote-alias' } })
  const target = { workspace_id: 'w', session_id: 's', observer_id: 'a', observed_id: 'u' }
  let writes = 0
  useTransport(async path => {
    if (path.startsWith('/correction-ticket')) return { ok: true, ticket: 'one-time', target }
    writes++
    throw new Error('Transport lost')
  })
  await assert.rejects(sandbox.saveCorrectionForFocus(focus, target, 'Correction', null), error => error.outcome === 'unknown')
  assert.equal(writes, 1)
})

test('conclusion rows describe premises without calling them source messages', () => {
  const modern = renderedText(sandbox.ConclusionRow({ conclusion: { ...conclusion, source_ids: ['premise-a', 'premise-b'], times_derived: 7 } }))
  assert.match(modern, /Fixture fact\./)
  assert.match(modern, /Derived 7 times/)
  assert.match(modern, /2 premises/)
  assert.doesNotMatch(modern, /source messages/i)
  const legacy = renderedText(sandbox.ConclusionRow({ conclusion }))
  assert.doesNotMatch(legacy, /Derived|premise/)
  const other = renderedText(sandbox.ConclusionRow({ conclusion: { ...conclusion, belongs_to_current_session: false } }))
  assert.match(other, /Other session/)
  assert.match(source, /Premises are earlier conclusions, not source messages\./)
})

test('context message readout never invents a zero token total', () => {
  assert.equal(sandbox.contextMessageDetail({ messages: [{}], token_count: null }), '1 recent message · token total not reported')
  assert.equal(sandbox.contextMessageDetail({ messages: [], token_count: 0 }), '0 recent messages · 0 server-reported tokens')
})

test('blocking states name the condition and the next step', () => {
  const base = { routeMismatch: false, ownerProfile: 'research' }
  const titles = {
    not_configured: /isn’t set up/, disabled: /turned off/, workspace_missing: /doesn’t exist yet/,
    session_missing: /isn’t in Honcho yet/, session_unresolved: /No Honcho session/, unreachable: /isn’t responding/,
  }
  for (const [state, title] of Object.entries(titles)) {
    const gate = sandbox.gateFor({ ...base, data: { ok: false, state, profile: 'research', errors: [] } })
    assert.match(gate.title, title, state)
  }
  assert.match(renderedText(sandbox.gateFor({ ...base, data: { ok: false, state: 'not_configured', profile: 'research', errors: [] } }).description), /hermes -p research memory setup honcho/)
  assert.equal(sandbox.gateFor({ ...base, data: { ok: true, state: 'connected', errors: [], chat: { found: true, honcho_session_id: 's' } } }), null)
  // A draft arrives as an ok snapshot whose chat has no session at all.
  const draft = { ...base, data: { ok: true, state: 'partial', errors: [{ scope: 'session', message: 'unresolved' }], chat: { found: null, honcho_session_id: null } } }
  assert.match(sandbox.gateFor(draft).title, /No Honcho session/)
  assert.equal(sandbox.connectionStatus(draft).label, 'Not saved yet')
  const unsaved = { ...base, data: { ok: true, state: 'connected', errors: [], chat: { found: false, honcho_session_id: 'repo-session' } } }
  assert.match(sandbox.gateFor(unsaved).title, /isn’t in Honcho yet/)
  assert.equal(sandbox.gateFor({ ...base, isError: true, data: { ok: true } }), null, 'a failed poll keeps showing the last good data')
  assert.equal(sandbox.connectionStatus({ ...base, data: { ok: true, errors: [{}] } }).label, 'Partial')
})

test('local multiplexed requests carry their profile in the URL, not just the body', async () => {
  const calls = useTransport()
  sandbox.useQuery = options => options
  for (const profile of ['default', 'research']) {
    const focus = setLiveFocus({ profile, focusedSessionProfile: profile, connectionId: 'local', focusedSessionOwner: { connectionId: 'local', profile } })
    for (const endpoint of ['/snapshot', '/messages', '/conclusions', '/context', '/search', '/scopes', '/activity']) {
      await sandbox.useEndpointForFocus(focus, endpoint).queryFn()
      const url = new URL(calls.at(-1).path, 'http://fixture')
      assert.equal(url.pathname, endpoint)
      assert.equal(url.searchParams.get('profile'), profile)
      assert.equal(calls.at(-1).options.body.profile, profile)
    }
  }
})

function prepareUploadDialog(transport, mutationState = {}, focusOverrides = {}) {
  sandbox.transport = transport
  vm.runInContext('requestPlugin = transport', sandbox)
  sandbox.TextEncoder = TextEncoder
  sandbox.useQueryClient = () => ({ invalidateQueries() {} })
  sandbox.useRef = current => ({ current })
  sandbox.useEffect = () => {}
  let stateIndex = 0
  sandbox.useState = initial => [stateIndex++ === 1 ? 'Fixture upload' : initial, () => {}]
  let mutation
  sandbox.useMutation = options => { mutation = options; return { reset() {}, ...mutationState } }
  setLiveFocus({ profile: 'research', focusedSessionProfile: 'research', connectionId: 'local', focusedSessionOwner: { connectionId: 'local', profile: 'research' }, focusedSessionId: 'fixture-session', focusedStoredSessionId: 'fixture-session', cwd: '/fixture', ...focusOverrides })
  const tree = sandbox.AddToSessionDialog({ origin: 'test', snapshot: uploadSnapshot })
  return { tree, mutation }
}

test('upload ticket and multipart submission retain the same local profile', async () => {
  const calls = []
  const { mutation } = prepareUploadDialog(async (path, options) => {
    calls.push({ path, options })
    return path.startsWith('/upload-ticket') ? { ok: true, ticket: 'fixture-ticket', target: uploadTarget } : { ok: true }
  })
  await mutation.mutationFn()
  assert.deepEqual(calls.map(call => call.path), ['/upload-ticket?profile=research', '/uploads/fixture-ticket?profile=research'])
  assert.equal(calls[0].options.body.profile, 'research')
  assert.equal(new TextDecoder().decode(calls[1].options.upload.bytes), 'Fixture upload')
})

test('cross-profile uploads go to the chat owner, never the active profile', async () => {
  const calls = []
  const { mutation } = prepareUploadDialog(async (path, options) => {
    calls.push({ path, options })
    return path.startsWith('/upload-ticket') ? { ok: true, ticket: 'fixture-ticket', target: uploadTarget } : { ok: true }
  }, {}, { profile: 'default' })
  await mutation.mutationFn()
  assert.deepEqual(calls.map(call => call.path), ['/upload-ticket?profile=research', '/uploads/fixture-ticket?profile=research'])
})

test('remote routing stays host-owned and mismatched focus cannot dispatch', async () => {
  const calls = useTransport(async () => ({ ok: true }))
  const focus = setLiveFocus()
  sandbox.host.profileRoutes = async () => [{ connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' }]
  sandbox.queryClient = { fetchQuery: options => options.queryFn() }
  await sandbox.requestForFocus(focus, '/snapshot', {})
  assert.deepEqual(calls.map(call => call.path), ['/snapshot?profile=research'])
  await assert.rejects(sandbox.requestForFocus({ ...focus, routeMismatch: true, blockReason: 'other_connection' }, '/snapshot', {}), /another Hermes connection/)
  assert.equal(calls.length, 1)
})

test('SSH aliases translate provenance for every read, ticket and multipart call', async () => {
  const calls = useTransport()
  sandbox.queryClient = { fetchQuery: options => options.queryFn() }
  sandbox.host.profileRoutes = async () => [
    { connectionId: 'local', profile: 'remote-alias', targetProfile: 'wrong-local-profile' },
    { connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' },
  ]
  const focus = setLiveFocus()
  for (const endpoint of ['/snapshot', '/messages', '/conclusions', '/context', '/search', '/scopes', '/activity', '/upload-ticket', '/uploads/fixture-ticket']) {
    const upload = { filename: 'notes.txt', contentType: 'text/plain', bytes: new Uint8Array([1]).buffer }
    await sandbox.requestForFocus(focus, endpoint, { method: 'POST', body: { profile: 'remote-alias', focused_profile: 'remote-alias', connection_id: 'fixture-ssh' }, upload })
    const call = calls.at(-1)
    assert.equal(call.path, `${endpoint}?profile=research`)
    assert.equal(call.options.body.profile, 'research')
    assert.equal(call.options.body.focused_profile, 'research')
    assert.equal(call.options.body.connection_id, 'fixture-ssh')
    assert.equal(call.options.upload, upload)
  }
})

test('missing or ambiguous SSH routes never fall back to local transport', async () => {
  const calls = useTransport()
  const focus = setLiveFocus()
  const route = { connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' }
  for (const routes of [[], [route, route], [{ ...route, targetProfile: '' }]]) {
    sandbox.host.profileRoutes = async () => routes
    await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /route/i)
  }
  sandbox.host.profileRoutes = undefined
  await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /routing/i)
  assert.equal(calls.length, 0)
})

test('SSH target changes cannot retarget confirmed file content', async () => {
  const calls = useTransport()
  const focus = { ...setLiveFocus(), backendProfile: 'research' }
  sandbox.host.profileRoutes = async () => [{ connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'other-profile' }]
  await assert.rejects(sandbox.requestForFocus(focus, '/uploads/fixture-ticket', {}), /target changed/i)
  assert.equal(calls.length, 0)
})

test('a connection switch during SSH route lookup prevents dispatch', async () => {
  const calls = useTransport()
  const focus = setLiveFocus()
  sandbox.host.profileRoutes = async () => {
    setLiveFocus({ connectionId: 'local' })
    return [{ connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' }]
  }
  await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /changed/)
  assert.equal(calls.length, 0)
})

test('an owner-profile change during route lookup prevents dispatch', async () => {
  const calls = useTransport()
  const focus = setLiveFocus()
  sandbox.host.profileRoutes = async () => {
    setLiveFocus({ focusedSessionOwner: { connectionId: 'fixture-ssh', profile: 'different-profile' } })
    return [{ connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' }]
  }
  await assert.rejects(sandbox.requestForFocus(focus, '/snapshot', {}), /changed/)
  assert.equal(calls.length, 0)
})

test('confirmed uploads refresh remote routes instead of accepting a cached target', async () => {
  const focus = { ...setLiveFocus(), backendProfile: 'research' }
  sandbox.queryClient = { fetchQuery: options => {
    assert.equal(options.staleTime, 0)
    return options.queryFn()
  } }
  sandbox.host.profileRoutes = async () => [{ connectionId: 'fixture-ssh', profile: 'remote-alias', targetProfile: 'research' }]
  useTransport()
  await sandbox.requestForFocus(focus, '/uploads/fixture-ticket', {})
})

test('detail rows keep labels readable while identifiers stay literal', () => {
  sandbox.useContext = () => 'wide'
  const identifier = 'USER_PEER_WITH_UNDERSCORES'
  const row = sandbox.DetailRow({ label: 'Attributed to', value: identifier, mono: true })
  assert.equal(renderedText(row.props.children[0]), 'Attributed to')
  assert.equal(renderedText(row.props.children[1]), identifier)
  assert.ok(row.props.style.gridTemplateColumns, 'runtime layout must not depend on generated Tailwind classes')
  assert.equal(row.props.children[1].props.style.overflowWrap, 'anywhere')
  sandbox.useContext = () => 'narrow'
  assert.equal(sandbox.DetailRow({ label: 'Peer', value: 'x' }).props.style.gridTemplateColumns, '6.5rem minmax(0, 1fr)')
})

test('search submits only on a real Enter, never during IME composition', () => {
  let runs = 0
  const onKeyDown = sandbox.submitOnEnter(() => runs++)
  const event = extra => ({ preventDefault() {}, nativeEvent: {}, ...extra })
  onKeyDown(event({ key: 'a' }))
  onKeyDown(event({ key: 'Enter', nativeEvent: { isComposing: true } }))
  assert.equal(runs, 0)
  onKeyDown(event({ key: 'Enter' }))
  assert.equal(runs, 1)
})

test('refresh invalidates visible reads only for the current focus', () => {
  const calls = []
  const focusKey = ['default', 'local', 'default', 'local', 'session', 'runtime', '/fixture']
  sandbox.refreshFocus({ invalidateQueries: filter => calls.push(filter) }, focusKey)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].predicate({ queryKey: ['hermes-honcho-plugin', '/messages', ...focusKey, 1] }), true)
  assert.equal(calls[0].predicate({ queryKey: ['hermes-honcho-plugin', '/messages', 'research'] }), false)
  assert.equal(calls[0].predicate({ queryKey: ['other-plugin', '/messages', ...focusKey] }), false)
})

test('partial endpoint results display diagnostics without discarding readable content', () => {
  const child = element('p', { children: 'Available fixture content' })
  const tree = sandbox.QueryState({ query: { data: { ok: true, errors: [{ scope: 'fixture', message: 'One layer unavailable' }] } }, children: child })
  assert.notEqual(tree, child)
  assert.ok(tree.props.children.includes(child))
  assert.ok(tree.props.children.some(node => node?.type === sandbox.Diagnostics))
})

test('upload transport loss is unknown, with retries explicitly disabled', async () => {
  const { mutation } = prepareUploadDialog(async path => {
    if (path.startsWith('/upload-ticket')) return { ok: true, ticket: 'fixture-ticket', target: uploadTarget }
    throw new Error('Fixture connection lost')
  })
  assert.equal(mutation.retry, false)
  await assert.rejects(mutation.mutationFn(), error => {
    assert.equal(error.uploadState, 'outcome_unknown')
    assert.equal(error.committed, null)
    assert.match(error.message, /Messages before trying again/)
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
