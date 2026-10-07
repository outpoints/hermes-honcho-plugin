/**
 * Honcho memory for Hermes Desktop.
 *
 * Plain ESM only. Hermes maps the SDK and React specifiers at runtime, so this
 * file uses jsx()/jsxs() and needs no frontend build step.
 */

import {
  atom,
  Button,
  cn,
  Codicon,
  CopyButton,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DisclosureCaret,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  host,
  icons,
  PanelEmpty,
  PANES_AREA,
  PALETTE_AREA,
  queryClient,
  ROUTES_AREA,
  SearchField,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SIDEBAR_NAV_AREA,
  Skeleton,
  StatusDot,
  STATUSBAR_AREAS,
  Textarea,
  Tip,
  useMutation,
  useQuery,
  useQueryClient,
  useValue
} from '@hermes/plugin-sdk'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const PLUGIN_ID = 'hermes-honcho-plugin'
const ROUTE = '/honcho'
const POLL_INTERVAL_MS = 10_000
const PAGE_SIZE = 25
const SEARCH_LIMIT = 20
const HONCHO_DEFAULT_FILE_BYTES = 5_242_880
// Host navigation (a sidebar row, a link) moves chat focus before the route
// changes. Only a route change this soon after the user's action inherits the
// chat that was in view.
const NAVIGATION_WINDOW_MS = 3_000
const SECTIONS = [
  { id: 'memory', label: 'Memory' },
  { id: 'ask', label: 'Ask' },
  { id: 'messages', label: 'Messages' },
  { id: 'context', label: 'Context' },
  { id: 'status', label: 'Status' }
]
const CONTEXT_BUDGETS = [1024, 2048, 4096, 8192, 16384, 32000]
const $activeTab = atom('memory')
const $selection = atom(null)
const $uploadOrigin = atom(null)
const $inspectionFocus = atom(null)
const LayoutContext = createContext('compact')
// Dense metadata must stay readable in the host's light theme. These aliases
// apply to this plugin's surfaces only and never alter the app theme.
const READABLE_TOKENS = {
  '--dt-muted-foreground': 'var(--ui-text-secondary)',
  '--ui-text-tertiary': 'var(--ui-text-secondary)'
}
// The host's TextTab, spelled with utilities its shipped stylesheet defines.
const TEXT_TAB = 'group/text-tab inline-flex h-7 items-center gap-1 bg-transparent px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-(--ui-text-tertiary) transition-colors hover:bg-transparent hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring'
const BLOCK = 'max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-foreground/5 p-2.5 text-[0.68rem] leading-relaxed text-foreground/80'
const PROSE = { maxWidth: '72ch', overflowWrap: 'anywhere' }
// Rows keep their hover padding while their text aligns with the heading.
const BLEED = { marginInline: -10 }
// Dialog geometry the shipped stylesheet has no utilities for.
const DIALOG_STYLE = { ...READABLE_TOKENS, maxHeight: '88vh', overflowY: 'auto', maxWidth: 'min(36rem, calc(100vw - 2rem))' }

let requestPlugin = null
let pendingNavigation = null

// ── Layout ──────────────────────────────────────────────────────────────────

function layoutForWidth(width) {
  if (width < 440) return 'narrow'
  if (width < 880) return 'compact'
  return 'wide'
}

function useContainerLayout() {
  const ref = useRef(null)
  const [layout, setLayout] = useState('compact')

  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    const update = width => setLayout(current => {
      const next = layoutForWidth(width)
      return current === next ? current : next
    })
    update(element.getBoundingClientRect().width)
    const observer = new ResizeObserver(entries => {
      const entry = entries[0]
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return { ref, layout }
}

function ResponsiveSurface({ className, style, children }) {
  const { ref, layout } = useContainerLayout()
  return jsx('div', {
    ref,
    'data-honcho-surface': '',
    'data-layout': layout,
    className,
    style: { ...READABLE_TOKENS, ...style },
    children: jsx(LayoutContext.Provider, { value: layout, children })
  })
}

function useLayout() {
  return useContext(LayoutContext)
}

// ── Formatting ──────────────────────────────────────────────────────────────

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function number(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return new Intl.NumberFormat().format(Number(value))
}

function plural(count, singular, many = `${singular}s`) {
  return `${number(count, '0')} ${Number(count) === 1 ? singular : many}`
}

function compact(value, limit = 180) {
  const source = text(value, '')
  return source.length > limit ? `${source.slice(0, limit).trimEnd()}…` : source
}

function formatTime(value, fallback = 'Unknown time') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date)
}

// Presentation only. Never apply this to session, peer, profile or record IDs.
function sentence(value) {
  const source = text(value, '')
  if (!source) return '—'
  const words = source.replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

function queueLabel(queue) {
  if (!queue) return 'Unavailable'
  if (queue.in_progress > 0) return `${number(queue.in_progress)} processing`
  if (queue.pending > 0) return `${number(queue.pending)} waiting`
  return 'Caught up'
}

function queueDetail(queue) {
  return queue ? `${number(queue.completed, '0')} of ${number(queue.total, '0')} done` : null
}

function localState(query) {
  if (query.busy) return query.awaitingResponse ? 'Waiting for a reply' : 'Generating'
  return 'Idle'
}

function contextMessageDetail(session) {
  const count = plural(session?.messages?.length || 0, 'recent message')
  return session?.token_count === null || session?.token_count === undefined
    ? `${count} · token total not reported`
    : `${count} · ${plural(session.token_count, 'server-reported token')}`
}

// ── Focus and ownership ─────────────────────────────────────────────────────

function readFocusScope(read = store => store.get()) {
  const activeProfile = read(host.state.profile) || 'default'
  const activeConnection = read(host.state.connectionId) || 'local'
  const focusedOwner = read(host.state.focusedSessionOwner)
  const focusedProfile = read(host.state.focusedSessionProfile)
  const runtimeSessionId = read(host.state.focusedSessionId)
  const storedSessionId = read(host.state.focusedStoredSessionId)
  const cwd = read(host.state.cwd)
  const busy = read(host.state.busy)
  const awaitingResponse = read(host.state.awaitingResponse)
  // The SDK resolves a focused saved chat to exactly one (connection, profile)
  // owner, or null when ownership is ambiguous. Null never means "use the
  // active backend": that could read another profile's memory.
  const ownerUnresolved = Boolean(storedSessionId && !focusedOwner?.connectionId)
  const ownerConnection = focusedOwner?.connectionId || activeConnection
  const ownerProfile = focusedOwner?.profile || focusedProfile || activeProfile
  // A chat from another profile on the same connection is read in its owner's
  // profile (the "all profiles" sidebar does this constantly). ctx.rest cannot
  // reach a different connection, so those chats stay blocked.
  const otherConnection = !ownerUnresolved && ownerConnection !== activeConnection
  const routeMismatch = ownerUnresolved || otherConnection
  const focusId = storedSessionId || runtimeSessionId || 'draft'
  const fingerprint = [
    activeProfile,
    activeConnection,
    ownerProfile,
    ownerConnection,
    storedSessionId || '',
    runtimeSessionId || '',
    cwd || ''
  ].join('|')

  return {
    activeProfile,
    connectionId: activeConnection,
    ownerProfile,
    ownerConnection,
    focusedOwner,
    runtimeSessionId,
    storedSessionId,
    cwd,
    busy,
    awaitingResponse,
    routeMismatch,
    blockReason: ownerUnresolved ? 'owner_unresolved' : otherConnection ? 'other_connection' : null,
    fingerprint,
    key: [activeProfile, activeConnection, ownerProfile, ownerConnection, focusId, runtimeSessionId || '', cwd || ''],
    body: {
      profile: ownerProfile,
      focused_profile: ownerProfile,
      connection_id: activeConnection,
      focused_connection_id: ownerConnection,
      runtime_session_id: routeMismatch ? null : runtimeSessionId,
      stored_session_id: routeMismatch ? null : storedSessionId,
      cwd: routeMismatch ? null : cwd
    }
  }
}

function hasSession(scope) {
  return Boolean(scope && !scope.routeMismatch && (scope.storedSessionId || scope.runtimeSessionId))
}

function inspectionScope(raw, inspection = $inspectionFocus.get()) {
  if (!inspection) return raw
  const { focus, baseline } = inspection
  const routeCleared = inspection.navigation && typeof window !== 'undefined' &&
    window.location.hash === `#${ROUTE}` && !raw.storedSessionId && !raw.runtimeSessionId
  // A pane interaction may replace a tile with the host's route-primary (even
  // a different saved chat). Only that interaction's handoff is retained.
  // Never carry the target across routing, workspace, or later session changes.
  if (raw.routeMismatch || raw.activeProfile !== focus.activeProfile ||
      raw.connectionId !== focus.connectionId || raw.cwd !== focus.cwd ||
      (baseline !== null && raw.fingerprint !== baseline && !routeCleared)) return raw
  return focus
}

function useFocusScope() {
  return inspectionScope(readFocusScope(useValue), useValue($inspectionFocus))
}

function settleInspection(inspection) {
  // Native dispatch can drain microtasks between window capture and the
  // host's React handler. Settle after the whole event, not between listeners.
  setTimeout(() => {
    const current = $inspectionFocus.get()
    if (current?.focus !== inspection.focus) return
    const next = readFocusScope()
    if (inspectionScope(next, current) !== inspection.focus) $inspectionFocus.set(null)
    else $inspectionFocus.set({ ...current, baseline: next.fingerprint })
  }, 0)
}

function retainInspectionFocus(navigation = false) {
  const raw = readFocusScope()
  const current = $inspectionFocus.get()
  if (current && inspectionScope(raw, current) === current.focus) {
    if (navigation && !current.navigation) $inspectionFocus.set({ ...current, navigation: true })
    return
  }
  $inspectionFocus.set(null)
  if (!hasSession(raw)) return
  const inspection = { focus: raw, baseline: null, navigation }
  $inspectionFocus.set(inspection)
  settleInspection(inspection)
}

function adoptNavigationFocus() {
  const pending = pendingNavigation
  pendingNavigation = null
  const current = $inspectionFocus.get()
  if (current && inspectionScope(readFocusScope(), current) === current.focus) {
    if (!current.navigation) $inspectionFocus.set({ ...current, navigation: true })
    return
  }
  if (!pending || Date.now() - pending.at > NAVIGATION_WINDOW_MS) return
  const inspection = { focus: pending.focus, baseline: null, navigation: true }
  $inspectionFocus.set(inspection)
  settleInspection(inspection)
}

function installInspectionFocus(ctx) {
  if (typeof window === 'undefined' || !window.addEventListener) return
  let pointerOutside = false
  let releaseTimer = null
  const isOwn = event => (event.composedPath?.() || [event.target]).some(node => node?.closest?.('[data-honcho-surface]'))
  const onOwnRoute = () => window.location.hash === `#${ROUTE}`
  const cancelRelease = () => {
    if (releaseTimer) clearTimeout(releaseTimer)
    releaseTimer = null
  }
  const releaseLater = delay => {
    cancelRelease()
    releaseTimer = setTimeout(() => {
      releaseTimer = null
      pointerOutside = false
      $inspectionFocus.set(null)
    }, delay)
  }
  // Remember the chat in view when the user acts outside the plugin. If that
  // action opens the Honcho page, the page inspects this chat instead of
  // whatever the host focuses during navigation. This reads SDK state only.
  const rememberChat = () => {
    const effective = inspectionScope(readFocusScope())
    pendingNavigation = hasSession(effective) ? { focus: effective, at: Date.now() } : null
  }
  // Capture runs before the host's pane-focus handler. Portalled menus and
  // dialogs carry their own marker because they render outside the plugin.
  const onCapture = event => {
    if (isOwn(event)) {
      cancelRelease()
      retainInspectionFocus(false)
      return
    }
    if (event.type === 'pointerdown') {
      pointerOutside = true
      rememberChat()
      // The click decides; this only covers a press that never becomes one.
      releaseLater(1_000)
    } else if (event.type === 'keydown' && (event.key === 'Enter' || event.key === ' ')) {
      rememberChat()
    } else if (event.type === 'focusin' && !pointerOutside) {
      // Keyboard focus left the plugin. A pointer press is settled by its click.
      rememberChat()
      releaseLater(0)
    }
  }
  // Bubble runs after the host's handlers, so a navigation they performed is
  // already visible in the location. A portalled Select can retarget its
  // opening click to the document, so only a press that began outside counts.
  const onClick = event => {
    if (isOwn(event)) return
    if (onOwnRoute()) {
      cancelRelease()
      pointerOutside = false
      adoptNavigationFocus()
    } else if (pointerOutside) {
      cancelRelease()
      pointerOutside = false
      $inspectionFocus.set(null)
    }
  }
  const checkScope = () => {
    const current = $inspectionFocus.get()
    if (current && inspectionScope(readFocusScope(), current) !== current.focus) $inspectionFocus.set(null)
  }
  // Derived focus/owner atoms settle separately. Request guards still check
  // the live combination synchronously before every dispatch.
  const onScopeChange = () => queueMicrotask(checkScope)
  const onRouteChange = () => {
    if (onOwnRoute()) adoptNavigationFocus()
    else {
      pendingNavigation = null
      $inspectionFocus.set(null)
    }
  }
  const captured = ['pointerdown', 'focusin', 'keydown']
  for (const name of captured) window.addEventListener(name, onCapture, true)
  window.addEventListener('click', onClick)
  window.addEventListener('hashchange', onRouteChange)
  const dispose = Object.entries(host.state)
    .filter(([name]) => ['profile', 'connectionId', 'cwd', 'focusedSessionProfile', 'focusedSessionOwner', 'focusedStoredSessionId', 'focusedSessionId'].includes(name))
    .map(([, store]) => store.listen?.(onScopeChange))
  ctx.onDispose(() => {
    for (const name of captured) window.removeEventListener(name, onCapture, true)
    window.removeEventListener('click', onClick)
    window.removeEventListener('hashchange', onRouteChange)
    for (const unbind of dispose) unbind?.()
    cancelRelease()
    pendingNavigation = null
    $inspectionFocus.set(null)
  })
}

function openWorkbench() {
  retainInspectionFocus(true)
  host.navigate(ROUTE)
}

function blockMessage(reason) {
  return reason === 'other_connection'
    ? 'This chat runs on another Hermes connection. Switch Hermes to that connection to read its memory.'
    : 'Hermes can’t tell which profile owns this chat, so Honcho reads are paused.'
}

function assertCurrentFocus(focus) {
  const current = inspectionScope(readFocusScope())
  if (current.fingerprint !== focus.fingerprint || current.routeMismatch) {
    throw new Error('The focused chat changed. Refresh and confirm the new target.')
  }
}

// ── Transport ───────────────────────────────────────────────────────────────

async function requestForFocus(focus, endpoint, options) {
  if (!requestPlugin) throw new Error('The Honcho plugin backend is not registered.')
  if (focus.routeMismatch) throw new Error(blockMessage(focus.blockReason))
  assertCurrentFocus(focus)
  let targetProfile = focus.ownerProfile
  if (focus.ownerConnection !== 'local') {
    if (typeof host.profileRoutes !== 'function') throw new Error('Update Hermes Desktop to enable remote profile routing.')
    const routes = await queryClient.fetchQuery({
      queryKey: [PLUGIN_ID, 'profile-routes', focus.ownerConnection, focus.ownerProfile],
      queryFn: () => host.profileRoutes(),
      staleTime: focus.backendProfile ? 0 : POLL_INTERVAL_MS,
      retry: false
    })
    const matches = routes.filter(route => route.connectionId === focus.ownerConnection && route.profile === focus.ownerProfile)
    if (matches.length !== 1 || !matches[0].targetProfile?.trim()) {
      throw new Error('The remote profile route is unavailable or ambiguous. No Honcho request was sent.')
    }
    targetProfile = matches[0].targetProfile
  }
  if (focus.backendProfile && targetProfile !== focus.backendProfile) {
    throw new Error('The remote profile target changed after confirmation. Refresh and confirm the new target.')
  }
  // ctx.rest chooses its connection at dispatch time, not when React rendered.
  // Recheck after async route discovery (and before multipart content leaves).
  assertCurrentFocus(focus)
  // The selector picks the owner's Hermes home on a shared backend. Electron
  // keeps an explicit ?profile=, so a chat from another local profile is read
  // in that profile rather than the active one.
  const path = `${endpoint}${endpoint.includes('?') ? '&' : '?'}profile=${encodeURIComponent(targetProfile)}`
  return requestPlugin(path, {
    ...options,
    ...(options.body ? { body: { ...options.body, profile: targetProfile, focused_profile: targetProfile } } : {})
  })
}

function useEndpointForFocus(focus, endpoint, keyParts = [], extraBody = {}, options = {}) {
  const enabled = options.enabled !== false && !focus.routeMismatch
  const query = useQuery({
    queryKey: [PLUGIN_ID, endpoint, ...focus.key, ...keyParts],
    queryFn: () => requestForFocus(focus, endpoint, {
      method: 'POST',
      body: { ...focus.body, ...extraBody },
      timeoutMs: 22_000
    }),
    enabled,
    refetchInterval: options.poll ? POLL_INTERVAL_MS : false,
    staleTime: options.staleTime ?? 15_000,
    retry: options.retry ?? 1
  })

  return { ...query, ...focus }
}

function useHonchoEndpoint(endpoint, keyParts = [], extraBody = {}, options = {}) {
  return useEndpointForFocus(useFocusScope(), endpoint, keyParts, extraBody, options)
}

function useHonchoSnapshot(options = {}) {
  return useHonchoEndpoint('/snapshot', [], {}, { ...options, poll: true, staleTime: 5_000 })
}

function refreshFocus(client, key) {
  return client.invalidateQueries({
    predicate: candidate => candidate.queryKey[0] === PLUGIN_ID &&
      key.every((part, index) => candidate.queryKey[index + 2] === part)
  })
}

// ── Status ──────────────────────────────────────────────────────────────────

// The snapshot is "ok" whenever any workspace read succeeds, so a draft or an
// unsaved chat arrives as ok with no found session. Gate on the chat itself.
function chatState(data) {
  if (!data?.ok || !data.chat || data.chat.found === true) return null
  return data.chat.honcho_session_id ? 'session_missing' : 'session_unresolved'
}

function connectionStatus(query) {
  const data = query.data
  if (query.routeMismatch) return { tone: 'warn', label: query.blockReason === 'other_connection' ? 'Other connection' : 'Owner unknown' }
  if (query.isError && !data) return { tone: 'bad', label: 'Unavailable' }
  if (!data) return { tone: 'muted', label: 'Checking' }
  if (chatState(data)) return { tone: 'muted', label: 'Not saved yet' }
  if (data.ok) return data.errors?.length ? { tone: 'warn', label: 'Partial' } : { tone: 'good', label: 'Connected' }
  switch (data.state) {
    case 'not_configured': return { tone: 'warn', label: 'Not set up' }
    case 'disabled': return { tone: 'warn', label: 'Turned off' }
    case 'workspace_missing': return { tone: 'warn', label: 'No workspace' }
    case 'session_missing':
    case 'session_unresolved': return { tone: 'muted', label: 'Not saved yet' }
    case 'route_mismatch': return { tone: 'warn', label: 'Blocked' }
    case 'partial': return { tone: 'warn', label: 'Partial' }
    case 'unreachable':
    case 'error': return { tone: 'bad', label: 'Unreachable' }
    default: return { tone: 'muted', label: 'Checking' }
  }
}

function setupCommand(profile) {
  return profile && profile !== 'default' ? `hermes -p ${profile} memory setup honcho` : 'hermes memory setup honcho'
}

function code(value) {
  return jsx('code', { className: 'font-mono text-[0.92em] text-foreground', children: value })
}

// One state replaces every memory section when nothing can be read. Status
// stays reachable because it is where these conditions are explained.
function gateFor(query) {
  if (query.routeMismatch) {
    return query.blockReason === 'other_connection'
      ? { icon: 'debug-disconnect', title: 'This chat is on another connection', description: blockMessage(query.blockReason) }
      : { icon: 'question', title: 'Can’t tell who owns this chat', description: blockMessage(query.blockReason) }
  }
  if (query.isError && !query.data) {
    return {
      icon: 'error',
      title: 'Can’t reach the Honcho plugin',
      description: `${query.error?.message || 'The plugin API did not answer.'} Enable hermes-honcho-plugin for this profile and restart Hermes.`,
      retry: true
    }
  }
  const data = query.data
  if (!data) return null
  const state = data.ok ? chatState(data) : data.state
  if (!state) return null
  const message = data.errors?.[0]?.message
  switch (state) {
    case 'not_configured':
      return { icon: 'settings-gear', title: 'Honcho isn’t set up for this profile', description: jsxs('span', { children: ['Run ', code(setupCommand(data.profile || query.ownerProfile)), ', then refresh.'] }), retry: true }
    case 'disabled':
      return { icon: 'circle-slash', title: 'Honcho is turned off for this profile', description: jsxs('span', { children: ['Turn it on with ', code(setupCommand(data.profile || query.ownerProfile)), ', then refresh.'] }), retry: true }
    case 'workspace_missing':
      return { icon: 'database', title: 'This Honcho workspace doesn’t exist yet', description: 'Hermes creates it when it first saves memory. This view only reads, so it never creates one.', status: true }
    case 'session_unresolved':
      return { icon: 'comment-discussion', title: 'No Honcho session for this chat', description: 'Open a saved chat or send a message here. Memory appears once Hermes saves the conversation.' }
    case 'session_missing':
      return { icon: 'comment-discussion', title: 'This chat isn’t in Honcho yet', description: jsxs('span', { children: ['Hermes saves it as ', code(text(data.chat?.honcho_session_id || data.session_id)), ' after the first message.'] }), status: true }
    case 'unreachable':
    case 'error':
      return { icon: 'error', title: 'Honcho isn’t responding', description: message || 'Check the Honcho server for this profile.', retry: true }
    default:
      return { icon: 'warning', title: 'Honcho memory is unavailable', description: message || 'Open Status for details.', status: true }
  }
}

// ── Shared pieces ───────────────────────────────────────────────────────────

function StateLine({ tone = 'muted', title, children }) {
  return jsxs('div', {
    role: tone === 'bad' ? 'alert' : 'status',
    className: 'flex items-start gap-2 py-1',
    children: [
      jsx(StatusDot, { tone, className: 'mt-1.5' }),
      jsxs('div', {
        className: 'min-w-0',
        children: [
          jsx('div', { className: cn('text-xs font-medium', tone === 'bad' ? 'text-destructive' : 'text-foreground'), children: title }),
          children
            ? jsx('div', { className: 'mt-0.5 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children })
            : null
        ]
      })
    ]
  })
}

function Diagnostics({ errors }) {
  if (!errors?.length) return jsx(StateLine, { tone: 'good', title: 'No problems found', children: 'Every Honcho read answered.' })
  return jsx('ul', {
    className: 'space-y-2',
    children: errors.map((error, index) => jsxs('li', {
      className: 'min-w-0',
      children: [
        jsx('div', { className: 'text-xs font-medium text-foreground', children: sentence(text(error.scope, 'read').replaceAll('.', ' ')) }),
        jsx('div', { className: 'mt-0.5 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: text(error.message) })
      ]
    }, `${error.scope}-${index}`))
  })
}

function LoadingRows({ rows = 4 }) {
  return jsx('div', {
    className: 'space-y-2',
    'aria-busy': 'true',
    'aria-label': 'Loading',
    children: Array.from({ length: rows }, (_, index) => jsx(Skeleton, { className: 'h-10', style: { width: index === rows - 1 ? '66%' : '100%' } }, index))
  })
}

function QueryState({ query, children }) {
  if (query.routeMismatch) return jsx(StateLine, { tone: 'warn', title: 'Reads paused', children: blockMessage(query.blockReason) })
  if (query.isLoading) return jsx(LoadingRows, {})
  if (query.isError && !query.data) {
    return jsxs('div', {
      className: 'space-y-2',
      children: [
        jsx(StateLine, { tone: 'bad', title: 'Couldn’t load this', children: query.error instanceof Error ? query.error.message : 'The plugin API did not answer.' }),
        jsx(Button, { variant: 'secondary', size: 'sm', disabled: query.isFetching, onClick: () => query.refetch(), children: query.isFetching ? 'Retrying…' : 'Try again' })
      ]
    })
  }
  if (query.data?.errors?.length) {
    return jsxs('div', { className: 'space-y-3', children: [jsx(Diagnostics, { errors: query.data.errors }), children] })
  }
  return children
}

function RegionHeading({ children, meta, actions }) {
  return jsxs('div', {
    className: 'flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1',
    children: [
      jsx('h2', { className: 'text-[13px] font-medium text-foreground', children }),
      meta ? jsx('span', { className: 'text-xs tabular-nums text-(--ui-text-tertiary)', children: meta }) : null,
      actions ? jsx('div', { className: 'ml-auto flex items-center gap-1', children: actions }) : null
    ]
  })
}

function Empty({ icon, title, description, action }) {
  return jsx(PanelEmpty, { icon, title, description, action })
}

function DetailRow({ label, value, mono = false, accent = false }) {
  const layout = useLayout()
  return jsxs('div', {
    className: 'grid min-w-0 gap-3 py-1',
    style: { gridTemplateColumns: layout === 'narrow' ? '6.5rem minmax(0, 1fr)' : '8.5rem minmax(0, 1fr)' },
    children: [
      jsx('dt', { className: 'text-xs text-(--ui-text-tertiary)', children: label }),
      jsx('dd', {
        className: cn('min-w-0 text-xs text-foreground', mono && 'font-mono text-[11px]', accent && 'text-primary'),
        style: { overflowWrap: 'anywhere' },
        children: text(value)
      })
    ]
  })
}

function DetailGroup({ title, note, children }) {
  return jsxs('section', {
    className: 'min-w-0 space-y-1',
    children: [
      jsx(RegionHeading, { children: title }),
      jsx('dl', { children }),
      // Prose stays outside the definition list; a <dl> holds term groups only.
      note ? jsx('p', { className: 'pt-1 text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: note }) : null
    ]
  })
}

function ScopeToggle({ value, options, onChange, label }) {
  const layout = useLayout()
  if (layout === 'narrow') {
    return jsxs(Select, {
      value,
      onValueChange: onChange,
      children: [
        jsx(SelectTrigger, { 'aria-label': label, className: 'w-full', children: jsx(SelectValue, {}) }),
        jsx(SelectContent, { 'data-honcho-surface': '', children: options.map(option => jsx(SelectItem, { value: option.id, children: option.label }, option.id)) })
      ]
    })
  }
  return jsx('div', { role: 'group', 'aria-label': label, className: 'min-w-0', children: jsx(SegmentedControl, { value, onChange, options }) })
}

function Pager({ page, pages, isFetching, onPage }) {
  if (!pages || pages <= 1) return null
  return jsxs('div', {
    className: 'flex items-center justify-between gap-2 pt-1',
    children: [
      jsxs(Button, { variant: 'ghost', size: 'sm', disabled: page <= 1 || isFetching, onClick: () => onPage(Math.max(1, page - 1)), children: [jsx(icons.ChevronLeft, {}), 'Previous'] }),
      jsx('span', { className: 'text-xs tabular-nums text-(--ui-text-secondary)', children: `Page ${number(page)} of ${number(pages)}` }),
      jsxs(Button, { variant: 'ghost', size: 'sm', disabled: page >= pages || isFetching, onClick: () => onPage(Math.min(pages, page + 1)), children: ['Next', jsx(icons.ChevronRight, {})] })
    ]
  })
}

function CapabilityNote({ query, feature }) {
  if (query.data?.capabilities?.[feature]) return null
  return jsx('p', {
    className: 'text-xs leading-5 text-(--ui-text-secondary)',
    style: PROSE,
    children: query.isLoading
      ? 'Checking what this Honcho server supports…'
      : query.error?.message || query.data?.errors?.[0]?.message || query.data?.reasons?.[feature] || 'Not available on this Honcho server or SDK.'
  })
}

function submitOnEnter(handler) {
  return event => {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing || event.isComposing) return
    event.preventDefault()
    handler()
  }
}

// ── Header and navigation ───────────────────────────────────────────────────

function Lineage({ focus, snapshot }) {
  const chat = snapshot?.data?.chat
  const config = snapshot?.data?.config
  const items = [
    ['Connection', focus.ownerConnection],
    ['Profile', snapshot?.data?.profile || focus.ownerProfile],
    ['Session', chat?.honcho_session_id],
    ['Peer', config?.user_peer]
  ]
  return jsx('dl', {
    'aria-label': 'Where this memory lives',
    className: 'flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-xs',
    children: items.map(([label, value]) => jsxs('div', {
      className: 'flex min-w-0 items-baseline gap-1.5',
      children: [
        jsx('dt', { className: 'shrink-0 text-(--ui-text-tertiary)', children: label }),
        jsx('dd', { className: 'min-w-0 font-mono text-[11px] text-foreground', style: { overflowWrap: 'anywhere' }, children: text(value, '—') })
      ]
    }, label))
  })
}

function PageHeader({ query, origin = 'page' }) {
  const client = useQueryClient()
  const status = connectionStatus(query)
  const canUpload = Boolean(query.data?.ok && query.data?.chat?.found && !query.routeMismatch)
  return jsxs('header', {
    className: 'flex min-w-0 flex-col gap-2',
    children: [
      jsxs('div', {
        className: 'flex min-w-0 items-center gap-2',
        children: [
          origin === 'pane' ? null : jsx('h1', { className: 'text-sm font-semibold text-foreground', children: 'Honcho memory' }),
          jsxs('span', {
            role: 'status',
            className: 'inline-flex min-w-0 items-center gap-1.5 text-xs text-(--ui-text-secondary)',
            children: [jsx(StatusDot, { tone: status.tone }), status.label]
          }),
          jsxs('div', {
            className: 'ml-auto flex shrink-0 items-center gap-1',
            children: [
              jsx(Tip, {
                label: 'Refresh',
                children: jsx(Button, {
                  variant: 'ghost',
                  size: 'icon-sm',
                  'aria-label': 'Refresh',
                  disabled: query.routeMismatch,
                  onClick: () => refreshFocus(client, query.key),
                  children: jsx(icons.RefreshCw, {})
                })
              }),
              jsxs(Button, {
                variant: 'secondary',
                size: 'sm',
                disabled: !canUpload,
                onClick: () => $uploadOrigin.set({ origin, fingerprint: query.fingerprint }),
                children: [jsx(icons.Upload, {}), 'Add to session']
              })
            ]
          })
        ]
      }),
      jsx(Lineage, { focus: query, snapshot: query })
    ]
  })
}

function SectionNav({ origin, snapshot }) {
  const active = useValue($activeTab)
  const layout = useLayout()
  // Only counts that match the section's default view. Conclusions span
  // scopes, so a single number would disagree with the list below it.
  const counts = { messages: snapshot.data?.chat?.messages }
  const current = SECTIONS.find(section => section.id === active) || SECTIONS[0]
  const countLabel = id => (counts[id] === null || counts[id] === undefined ? null : number(counts[id]))

  if (layout === 'narrow') {
    return jsx('div', {
      className: 'border-b border-(--ui-stroke-tertiary) pb-1.5',
      children: jsxs(DropdownMenu, {
        children: [
          jsx(DropdownMenuTrigger, {
            asChild: true,
            children: jsxs('button', {
              type: 'button',
              'aria-label': `Section: ${current.label}`,
              className: 'flex h-7 cursor-pointer items-center gap-1.5 px-1 text-[length:var(--conversation-caption-font-size)] font-medium text-foreground',
              children: [
                current.label,
                countLabel(current.id) ? jsx('span', { className: 'text-[0.72em] font-normal text-(--ui-text-tertiary)', children: countLabel(current.id) }) : null,
                jsx(Codicon, { name: 'chevron-down', className: 'text-muted-foreground', size: '0.75rem' })
              ]
            })
          }),
          jsx(DropdownMenuContent, {
            'data-honcho-surface': '',
            align: 'start',
            className: 'w-44',
            sideOffset: 6,
            children: SECTIONS.map(section => jsxs(DropdownMenuItem, {
              className: cn(section.id === active && 'text-foreground'),
              onSelect: () => $activeTab.set(section.id),
              children: [
                jsx('span', { className: 'min-w-0 flex-1 truncate', children: section.label }),
                countLabel(section.id) ? jsx('span', { className: 'text-xs text-muted-foreground', children: countLabel(section.id) }) : null
              ]
            }, section.id))
          })
        ]
      })
    })
  }

  const move = (event, delta) => {
    const index = SECTIONS.findIndex(section => section.id === active)
    const next = SECTIONS[(index + delta + SECTIONS.length) % SECTIONS.length]
    event.preventDefault()
    $activeTab.set(next.id)
    document.getElementById(`honcho-${origin}-tab-${next.id}`)?.focus()
  }

  return jsx('div', {
    role: 'tablist',
    'aria-label': 'Honcho memory sections',
    className: 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-(--ui-stroke-tertiary) pb-1.5',
    onKeyDown: event => {
      if (event.key === 'ArrowRight') move(event, 1)
      else if (event.key === 'ArrowLeft') move(event, -1)
    },
    children: SECTIONS.map(section => {
      const selected = section.id === active
      return jsxs('button', {
        type: 'button',
        role: 'tab',
        id: `honcho-${origin}-tab-${section.id}`,
        'aria-selected': selected,
        'aria-controls': `honcho-${origin}-section`,
        tabIndex: selected ? 0 : -1,
        'data-active': selected,
        className: cn(TEXT_TAB, selected && 'text-foreground'),
        onClick: () => $activeTab.set(section.id),
        children: [
          jsx('span', { className: cn('underline-offset-4 decoration-current/25', selected ? 'underline' : 'group-hover/text-tab:underline'), children: section.label }),
          countLabel(section.id) ? jsx('span', { className: 'text-[0.72em] font-normal tabular-nums text-(--ui-text-tertiary)', children: countLabel(section.id) }) : null
        ]
      }, section.id)
    })
  })
}

function GateState({ gate, query }) {
  const client = useQueryClient()
  return jsx(Empty, {
    icon: gate.icon,
    title: gate.title,
    description: gate.description,
    action: gate.retry
      ? jsxs(Button, { variant: 'secondary', size: 'sm', onClick: () => refreshFocus(client, query.key), children: [jsx(icons.RefreshCw, {}), 'Try again'] })
      : gate.status
        ? jsx(Button, { variant: 'ghost', size: 'sm', onClick: () => $activeTab.set('status'), children: 'View status' })
        : null
  })
}

// ── Memory ──────────────────────────────────────────────────────────────────

function levelLabel(level) {
  return level ? sentence(level) : null
}

function conclusionMeta(conclusion, { includeScope = true } = {}) {
  const parents = conclusion.source_ids?.length || 0
  return [
    levelLabel(conclusion.level),
    Number.isInteger(conclusion.times_derived) && conclusion.times_derived > 1 ? `Derived ${number(conclusion.times_derived)} times` : null,
    parents ? `${plural(parents, 'premise')}${conclusion.source_ids_truncated ? '+' : ''}` : null,
    formatDate(conclusion.created_at),
    includeScope && conclusion.belongs_to_current_session === false ? 'Other session' : null
  ].filter(Boolean)
}

function MetaLine({ parts }) {
  return jsx('span', {
    className: 'flex min-w-0 flex-wrap items-center gap-x-1.5 text-[11px] text-(--ui-text-tertiary)',
    children: parts.flatMap((part, index) => index ? [jsx('span', { 'aria-hidden': 'true', children: '·' }, `dot-${index}`), jsx('span', { children: part }, index)] : [jsx('span', { children: part }, index)])
  })
}

function ConclusionRow({ conclusion, selected = false, onSelect }) {
  const body = [
    jsx('span', { className: 'block text-[13px] leading-5 text-foreground', style: PROSE, children: conclusion.content }, 'content'),
    jsx(MetaLine, { parts: conclusionMeta(conclusion) }, 'meta')
  ]
  if (!onSelect) return jsx('div', { className: 'flex min-w-0 flex-col gap-1 px-2.5 py-2', children: body })
  return jsx('button', {
    type: 'button',
    'aria-current': selected ? 'true' : undefined,
    onClick: () => onSelect(conclusion.id),
    className: cn(
      'flex w-full min-w-0 flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-(--ui-row-hover-background) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
      selected && 'bg-(--ui-row-active-background)'
    ),
    children: body
  })
}

function ConclusionList({ items, selectedId, onSelect }) {
  return jsx('ul', {
    className: 'min-w-0 space-y-0.5',
    style: BLEED,
    children: items.map(item => jsx('li', { children: jsx(ConclusionRow, { conclusion: item, selected: item.id === selectedId, onSelect }) }, item.id))
  })
}

function correctionTarget(data) {
  return {
    workspace_id: data.config.workspace_id,
    session_id: data.chat.honcho_session_id,
    observer_id: data.config.ai_peer,
    observed_id: data.config.user_peer
  }
}

function SessionContext({ enabled = true }) {
  const context = useHonchoEndpoint('/context', [2048], { token_budget: 2048 }, { staleTime: 60_000, enabled })
  const data = context.data
  return jsx(QueryState, {
    query: context,
    children: jsxs('div', {
      className: 'space-y-4',
      children: [
        jsxs('section', {
          className: 'space-y-1',
          children: [
            jsx(RegionHeading, { children: 'Session summary' }),
            jsx('p', {
              className: cn('whitespace-pre-wrap text-xs leading-5', data?.session?.summary ? 'text-foreground' : 'text-(--ui-text-secondary)'),
              style: PROSE,
              children: data?.session?.summary || 'No summary yet. Honcho writes one after enough messages.'
            })
          ]
        }),
        jsxs('section', {
          className: 'space-y-1',
          children: [
            jsx(RegionHeading, { meta: 'Whole workspace', children: 'Peer card' }),
            data?.peer_card?.length
              ? jsx('ul', { className: 'list-disc space-y-1 pl-4 text-xs leading-5 text-foreground', style: PROSE, children: data.peer_card.map((fact, index) => jsx('li', { children: fact }, index)) })
              : jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'No peer card yet.' })
          ]
        }),
        jsx(Button, { variant: 'link', size: 'inline', onClick: () => $activeTab.set('context'), children: 'Open the full context' })
      ]
    })
  })
}

function SummaryDisclosure() {
  const [open, setOpen] = useState(false)
  return jsxs('div', {
    className: 'min-w-0',
    children: [
      jsxs('button', {
        type: 'button',
        'aria-expanded': open,
        onClick: () => setOpen(value => !value),
        className: 'flex items-center gap-1.5 py-1 text-xs font-medium text-(--ui-text-secondary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        children: [jsx(DisclosureCaret, { open }), 'Session summary and peer card']
      }),
      open ? jsx('div', { className: 'pt-2 pl-5', children: jsx(SessionContext, {}) }) : null
    ]
  })
}

function ConclusionInspector({ id, fallback, flags, onSelect, onClose, onCorrect, backLabel }) {
  const query = useHonchoEndpoint('/conclusion-detail', [id], { conclusion_id: id }, { enabled: Boolean(flags.conclusion_detail) })
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus() }, [id])
  const data = query.data
  const item = data?.item || fallback
  const loading = flags.conclusion_detail && query.isLoading

  return jsxs('section', {
    'aria-label': 'Selected conclusion',
    className: 'min-w-0 space-y-4',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          backLabel
            ? jsxs(Button, { variant: 'ghost', size: 'sm', onClick: onClose, children: [jsx(icons.ChevronLeft, {}), backLabel] })
            : jsx('h2', { ref: heading, tabIndex: -1, className: 'text-[13px] font-medium text-foreground outline-none', children: 'Conclusion' }),
          backLabel
            ? null
            : jsx('div', {
                className: 'ml-auto',
                children: jsx(Tip, { label: 'Close', children: jsx(Button, { variant: 'ghost', size: 'icon-xs', 'aria-label': 'Close conclusion', onClick: onClose, children: jsx(Codicon, { name: 'close', size: '0.875rem' }) }) })
              })
        ]
      }),
      loading ? jsx(LoadingRows, { rows: 3 }) : null,
      !loading && !item
        ? jsx(StateLine, { tone: 'warn', title: 'Conclusion not found', children: query.data?.errors?.[0]?.message || query.error?.message || 'It may have been removed, or it belongs to another relationship.' })
        : null,
      !loading && item
        ? jsxs('div', {
            className: 'space-y-4',
            children: [
              backLabel ? jsx('h2', { ref: heading, tabIndex: -1, className: 'sr-only', children: 'Conclusion' }) : null,
              jsx('p', { className: 'whitespace-pre-wrap text-sm leading-6 text-foreground', style: PROSE, children: item.content }),
              jsxs('dl', {
                children: [
                  jsx(DetailRow, { label: 'Observer', value: item.observer_id, mono: true }),
                  jsx(DetailRow, { label: 'About', value: item.observed_id, mono: true }),
                  jsx(DetailRow, { label: 'Kind', value: levelLabel(item.level) }),
                  jsx(DetailRow, { label: 'Created', value: formatTime(item.created_at) }),
                  jsx(DetailRow, { label: 'Session', value: item.source_session_id ? `${item.source_session_id}${item.belongs_to_current_session ? ' (this session)' : ''}` : null, mono: true }),
                  Number.isInteger(item.times_derived) ? jsx(DetailRow, { label: 'Derived', value: plural(item.times_derived, 'time') }) : null,
                  jsx(DetailRow, { label: 'ID', value: item.id, mono: true })
                ]
              }),
              jsxs('div', {
                className: 'flex flex-wrap gap-2',
                children: [
                  onCorrect ? jsxs(Button, { variant: 'secondary', size: 'sm', onClick: () => onCorrect(item), children: [jsx(icons.Pencil, {}), 'Add correction'] }) : null,
                  jsx(CopyButton, { text: item.content, label: 'Copy text', appearance: 'button', buttonVariant: 'ghost', buttonSize: 'sm', showLabel: true })
                ]
              }),
              flags.conclusion_detail
                ? jsxs('div', {
                    className: 'space-y-4',
                    children: [
                      ...[['parents', 'Premises'], ['derived', 'Derived from this']].map(([key, label]) => jsxs('section', {
                        className: 'space-y-1',
                        children: [
                          jsx(RegionHeading, { meta: data?.capabilities?.[key] ? number(data?.[key]?.length || 0) : null, children: label }),
                          !data?.capabilities?.[key]
                            ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'This Honcho server doesn’t expose these links.' })
                            : data[key]?.length
                              ? jsx(ConclusionList, { items: data[key], onSelect })
                              : jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: key === 'parents' ? 'No premises recorded.' : 'Nothing derived from it yet.' })
                        ]
                      }, key)),
                      jsx('p', {
                        className: 'text-xs leading-5 text-(--ui-text-secondary)',
                        style: PROSE,
                        children: `${data?.truncated ? 'Some links were left out. ' : ''}Premises are earlier conclusions, not source messages. One level loads at a time, up to ten each way.`
                      })
                    ]
                  })
                : jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: 'This Honcho SDK can’t load premises or derived conclusions.' })
            ]
          })
        : null
    ]
  })
}

function MemorySection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const snapshot = useHonchoSnapshot()
  const capability = useHonchoEndpoint('/capabilities')
  const flags = capability.data?.capabilities || {}
  const [scope, setScope] = useState('current')
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [correction, setCorrection] = useState(null)
  const list = useHonchoEndpoint(
    search ? '/conclusion-search' : '/conclusions',
    [scope, page, PAGE_SIZE, search],
    search ? { scope, query: search, limit: PAGE_SIZE } : { scope, page, size: PAGE_SIZE }
  )
  const selection = useValue($selection)
  const selectedId = selection?.fingerprint === focus.fingerprint ? selection.id : null
  const items = list.data?.items || []
  const select = id => $selection.set(id ? { id, fingerprint: focus.fingerprint } : null)
  const canCorrect = Boolean(flags.correction && snapshot.data?.ok && snapshot.data?.chat?.found && !focus.routeMismatch)
  const correct = source => setCorrection({ source, profile: snapshot.data.profile, target: correctionTarget(snapshot.data) })
  const canSearch = Boolean(flags.conclusion_search)
  const runSearch = () => {
    const cleaned = draft.trim()
    if (canSearch && cleaned && !list.isFetching) {
      setSearch(cleaned)
      setPage(1)
    }
  }
  const clearSearch = () => {
    setDraft('')
    setSearch('')
  }
  const config = snapshot.data?.config
  const relationship = config?.ai_peer && config?.user_peer ? `${config.ai_peer} about ${config.user_peer}` : null
  const total = list.data?.total ?? items.length

  const addFact = jsxs(Button, { variant: 'secondary', size: 'sm', disabled: !canCorrect, onClick: () => correct(null), children: [jsx(icons.Plus, {}), 'Add fact'] })
  const scopeControl = jsx(ScopeToggle, {
    value: scope,
    label: 'Memory scope',
    onChange: next => {
      setScope(next)
      setPage(1)
    },
    options: [{ id: 'current', label: 'This session' }, { id: 'all', label: 'All sessions' }]
  })
  const toolbar = jsxs('div', {
    className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
    children: [
      canSearch
        ? jsx(SearchField, {
            value: draft,
            onChange: value => {
              setDraft(value)
              if (!value) setSearch('')
            },
            onClear: clearSearch,
            onKeyDown: submitOnEnter(runSearch),
            'aria-label': 'Search memory',
            placeholder: 'Search memory and press Enter',
            loading: Boolean(search) && list.isFetching,
            containerClassName: 'min-w-48 flex-1 opacity-100',
            inputClassName: 'w-full'
          })
        : jsx('div', { className: 'min-w-0 flex-1', children: jsx(CapabilityNote, { query: capability, feature: 'conclusion_search' }) }),
      layout === 'narrow'
        ? jsxs('div', { className: 'flex min-w-0 items-center gap-2', children: [jsx('div', { className: 'min-w-0 flex-1', children: scopeControl }), addFact] })
        : scopeControl,
      layout === 'narrow' ? null : addFact
    ]
  })

  const results = jsx(QueryState, {
    query: list,
    children: jsxs('div', {
      className: 'min-w-0 space-y-2',
      children: [
        jsx(RegionHeading, {
          meta: search ? plural(items.length, 'match', 'matches') : [plural(total, 'conclusion'), relationship].filter(Boolean).join(' · '),
          actions: search ? jsx(Button, { variant: 'text', size: 'inline', onClick: clearSearch, children: 'Show all' }) : null,
          children: search ? `Results for “${search}”` : scope === 'current' ? 'Conclusions from this session' : 'Conclusions from all sessions'
        }),
        items.length
          ? jsx(ConclusionList, { items, selectedId, onSelect: select })
          : jsx(Empty, {
              icon: search ? 'search' : 'lightbulb',
              title: search ? 'No matching conclusions' : 'No conclusions yet',
              description: search
                ? 'Try other words or search all sessions.'
                : scope === 'current'
                  ? 'Honcho draws conclusions in the background after messages are saved. Other sessions may already have some.'
                  : 'Honcho hasn’t drawn conclusions about this user yet.',
              action: scope === 'current' ? jsx(Button, { variant: 'secondary', size: 'sm', onClick: () => { setScope('all'); setPage(1) }, children: 'Show all sessions' }) : null
            }),
        search ? null : jsx(Pager, { page, pages: list.data?.pages, isFetching: list.isFetching, onPage: setPage })
      ]
    })
  }, `${scope}|${search}`)

  const inspector = selectedId
    ? jsx(ConclusionInspector, {
        id: selectedId,
        fallback: items.find(item => item.id === selectedId),
        flags,
        onSelect: select,
        onClose: () => select(null),
        onCorrect: canCorrect ? correct : undefined,
        backLabel: layout === 'wide' ? null : 'All conclusions'
      }, selectedId)
    : null
  const dialog = correction ? jsx(CorrectionDialog, { confirmation: correction, onClose: () => setCorrection(null) }, 'correction') : null

  if (layout === 'wide') {
    return jsxs('div', {
      style: { display: 'grid', gap: 32, gridTemplateColumns: 'minmax(0, 3fr) minmax(18rem, 2fr)', alignItems: 'start' },
      children: [
        jsxs('div', { className: 'min-w-0 space-y-4', children: [toolbar, results] }),
        jsx('aside', {
          className: 'min-w-0 space-y-4',
          style: { position: 'sticky', top: 0, borderLeft: '1px solid var(--ui-stroke-tertiary)', paddingLeft: 24 },
          children: inspector || jsxs('div', {
            className: 'space-y-4',
            children: [
              jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: 'Select a conclusion to see where it came from or correct it.' }),
              jsx(SessionContext, {})
            ]
          })
        }),
        dialog
      ]
    })
  }

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    children: inspector ? [inspector, dialog] : [jsx('div', { children: toolbar }, 'toolbar'), jsx(SummaryDisclosure, {}, 'summary'), jsx('div', { children: results }, 'results'), dialog]
  })
}

// ── Corrections ─────────────────────────────────────────────────────────────

function sameMemoryTarget(actual, expected) {
  return Boolean(actual && expected && ['workspace_id', 'session_id', 'observer_id', 'observed_id'].every(key => actual[key] && actual[key] === expected[key]))
}

async function saveCorrectionForFocus(focus, target, content, source) {
  const ticket = await requestForFocus(focus, '/correction-ticket', {
    method: 'POST', body: { ...focus.body, content, source_conclusion_id: source || null }, timeoutMs: 22_000
  })
  if (!ticket?.ok || !ticket.ticket) throw new Error(ticket?.errors?.[0]?.message || 'Honcho couldn’t prepare the correction.')
  if (!sameMemoryTarget(ticket.target, target)) throw new Error('The memory target changed. Nothing was sent. Reopen and confirm the new target.')
  assertCurrentFocus(focus)
  let result
  try {
    result = await requestForFocus(focus, '/corrections', { method: 'POST', body: { ...focus.body, ticket: ticket.ticket }, timeoutMs: 22_000 })
    assertCurrentFocus(focus)
  } catch {
    const error = new Error('The response was lost, so the correction may or may not be saved. Check Memory before adding it again.')
    error.outcome = 'unknown'
    throw error
  }
  if (!result?.ok || !result.verified || result.outcome !== 'verified' || !sameMemoryTarget(result.target, target)
      || !result.item?.id || result.item.content !== content || result.item.observer_id !== target.observer_id
      || result.item.observed_id !== target.observed_id || result.item.source_session_id !== target.session_id) {
    const error = new Error(result?.errors?.[0]?.message || 'Honcho didn’t confirm the correction. Check Memory before adding it again.')
    error.outcome = result?.outcome === 'rejected' ? 'rejected' : 'unknown'
    throw error
  }
  return result
}

function TargetList({ rows }) {
  return jsx('dl', {
    className: 'rounded bg-foreground/5 px-3 py-2',
    children: rows.map(([label, value]) => jsx(DetailRow, { label, value, mono: true }, label))
  })
}

function CorrectionDialog({ confirmation, onClose }) {
  const focus = useFocusScope()
  const [draft, setDraft] = useState('')
  const inFlight = useRef(false)
  const client = useQueryClient()
  const mutation = useMutation({
    retry: false,
    mutationFn: () => saveCorrectionForFocus({ ...focus, backendProfile: confirmation.profile }, confirmation.target, draft.trim(), confirmation.source?.id),
    onSuccess: () => client.invalidateQueries({ queryKey: [PLUGIN_ID] }),
    onSettled: () => { inFlight.current = false }
  })
  const blocked = mutation.isPending || mutation.data?.verified || mutation.error?.outcome === 'unknown'
  const close = () => { if (!inFlight.current) onClose() }
  return jsx(Dialog, {
    open: true,
    onOpenChange: next => { if (!next) close() },
    children: jsxs(DialogContent, {
      'data-honcho-surface': '',
      style: DIALOG_STYLE,
      showCloseButton: !mutation.isPending,
      onEscapeKeyDown: event => { if (inFlight.current) event.preventDefault() },
      onInteractOutside: event => { if (inFlight.current) event.preventDefault() },
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: confirmation.source ? 'Correct this conclusion' : 'Add a fact' }),
            jsx(DialogDescription, { children: 'Adds one explicit conclusion. Earlier conclusions stay as they are, and derived memory may take a while to catch up.' })
          ]
        }),
        jsx(TargetList, {
          rows: [
            ['Profile', confirmation.profile],
            ['Session', confirmation.target.session_id],
            ['Observer', confirmation.target.observer_id],
            ['About', confirmation.target.observed_id]
          ]
        }),
        confirmation.source
          ? jsxs('div', {
              className: 'space-y-1',
              children: [
                jsx('div', { className: 'text-xs text-(--ui-text-tertiary)', children: 'Current conclusion' }),
                jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: confirmation.source.content })
              ]
            })
          : null,
        jsx(Textarea, {
          'aria-label': 'Corrective fact',
          value: draft,
          maxLength: 4000,
          rows: 4,
          disabled: blocked,
          placeholder: 'State the correct fact plainly, including what changed.',
          onChange: event => { setDraft(event.target.value); mutation.reset() }
        }),
        mutation.error ? jsx(StateLine, { tone: 'warn', title: mutation.error.outcome === 'unknown' ? 'Outcome unknown' : 'Not saved', children: mutation.error.message }) : null,
        mutation.data?.verified ? jsx(StateLine, { tone: 'good', title: 'Correction saved and verified', children: `Honcho returned the exact text as conclusion ${mutation.data.item.id}. Earlier conclusions were kept.` }) : null,
        jsxs(DialogFooter, {
          children: [
            jsx(Button, { variant: 'ghost', onClick: close, disabled: mutation.isPending, children: blocked && !mutation.isPending ? 'Close' : 'Cancel' }),
            jsx(Button, {
              disabled: blocked || !draft.trim() || focus.routeMismatch,
              onClick: () => {
                if (inFlight.current || blocked || !draft.trim()) return
                inFlight.current = true
                mutation.mutate()
              },
              children: mutation.isPending ? 'Saving…' : 'Save correction'
            })
          ]
        })
      ]
    })
  })
}

// ── Ask ─────────────────────────────────────────────────────────────────────

function AskSection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const capability = useHonchoEndpoint('/capabilities')
  const flags = capability.data?.capabilities || {}
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState('session')
  const [level, setLevel] = useState('low')
  const inFlight = useRef(false)
  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      const result = await requestForFocus(focus, '/ask', {
        method: 'POST',
        body: { ...focus.body, query: draft.trim(), scope, reasoning_level: level, include_evidence: Boolean(flags.ask_evidence) },
        timeoutMs: 95_000
      })
      assertCurrentFocus(focus)
      if (!result?.ok) throw new Error(result?.errors?.[0]?.message || 'Honcho couldn’t answer. Nothing was retried.')
      return result
    },
    onSettled: () => { inFlight.current = false }
  })
  const result = mutation.data
  const canAsk = Boolean(flags.ask && !focus.routeMismatch && draft.trim() && !mutation.isPending)
  const ask = () => {
    if (inFlight.current || !canAsk) return
    inFlight.current = true
    mutation.mutate()
  }
  const openConclusion = id => {
    $selection.set({ id, fingerprint: focus.fingerprint })
    $activeTab.set('memory')
  }

  return jsxs('div', {
    className: 'min-w-0 space-y-5',
    style: { maxWidth: 880 },
    children: [
      jsxs('fieldset', {
        disabled: mutation.isPending || !flags.ask || focus.routeMismatch,
        className: 'min-w-0 space-y-2',
        children: [
          jsx(Textarea, {
            'aria-label': 'Question for memory',
            value: draft,
            maxLength: 2000,
            rows: 3,
            placeholder: 'What should guide this work? Ask about preferences, decisions, or facts.',
            onChange: event => { setDraft(event.target.value); mutation.reset() },
            onKeyDown: event => {
              if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent?.isComposing) {
                event.preventDefault()
                ask()
              }
            }
          }),
          jsxs('div', {
            className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
            children: [
              jsx(ScopeToggle, { value: scope, label: 'Question scope', onChange: value => { setScope(value); mutation.reset() }, options: [{ id: 'session', label: 'This session' }, { id: 'workspace', label: 'All sessions' }] }),
              jsxs(Select, {
                value: level,
                onValueChange: value => { setLevel(value); mutation.reset() },
                children: [
                  jsx(SelectTrigger, { 'aria-label': 'Reasoning effort', className: layout === 'narrow' ? 'w-full' : 'w-36', children: jsx(SelectValue, {}) }),
                  jsx(SelectContent, {
                    'data-honcho-surface': '',
                    children: [['minimal', 'Minimal effort'], ['low', 'Low effort'], ['medium', 'Medium effort'], ['high', 'High effort']].map(([id, label]) => jsx(SelectItem, { value: id, children: label }, id))
                  })
                ]
              }),
              jsxs(Button, {
                className: layout === 'narrow' ? 'justify-center' : 'ml-auto',
                disabled: !canAsk,
                onClick: ask,
                children: [jsx(icons.MessageQuestion, {}), mutation.isPending ? 'Asking…' : 'Ask memory']
              })
            ]
          }),
          jsx('p', {
            className: 'text-xs leading-5 text-(--ui-text-secondary)',
            style: PROSE,
            children: 'Runs a new reasoning call on your Honcho server, which may use credits. Nothing runs until you ask. ⌘/Ctrl + Enter also asks.'
          })
        ]
      }),
      jsx(CapabilityNote, { query: capability, feature: 'ask' }),
      mutation.error ? jsx(StateLine, { tone: 'warn', title: 'No answer', children: mutation.error.message }) : null,
      result
        ? jsxs('section', {
            'aria-live': 'polite',
            className: 'min-w-0 space-y-4',
            children: [
              jsxs('div', {
                className: 'space-y-2',
                children: [
                  jsx(RegionHeading, {
                    meta: `New synthesis · ${result.scope === 'session' ? 'This session' : 'All sessions'}`,
                    actions: jsx(CopyButton, { text: result.answer || '', label: 'Copy answer' }),
                    children: 'Answer'
                  }),
                  jsx('p', { className: 'whitespace-pre-wrap text-sm leading-6 text-foreground', style: PROSE, children: result.answer || 'Honcho returned an empty answer.' }),
                  result.answer_truncated ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'The answer was shortened for display.' }) : null
                ]
              }),
              result.errors?.length ? jsx(Diagnostics, { errors: result.errors }) : null,
              result.evidence
                ? jsxs('section', {
                    className: 'space-y-2',
                    children: [
                      jsx(RegionHeading, { meta: number(result.evidence.conclusions.length + result.evidence.messages.length), children: 'Records Honcho read' }),
                      jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', style: PROSE, children: 'Reading a record doesn’t mean it supports the answer.' }),
                      result.evidence.conclusions.length
                        ? jsx(ConclusionList, { items: result.evidence.conclusions, onSelect: flags.conclusion_detail ? openConclusion : undefined })
                        : null,
                      result.evidence.messages.length
                        ? jsx('ul', {
                            className: 'space-y-1',
                            children: result.evidence.messages.map(item => jsx('li', {
                              children: jsx(MetaLine, { parts: ['Message', item.peer_id, item.session_id, item.id] })
                            }, item.id))
                          })
                        : null,
                      !result.evidence.conclusions.length && !result.evidence.messages.length
                        ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Honcho didn’t report any records.' })
                        : null,
                      result.evidence.truncated ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Some records were left out.' }) : null
                    ]
                  })
                : flags.ask
                  ? jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'This Honcho server doesn’t report which records it read.' })
                  : null
            ]
          })
        : null
    ]
  })
}

// ── Messages ────────────────────────────────────────────────────────────────

function MessageRow({ message, peers }) {
  const [open, setOpen] = useState(false)
  const content = text(message.content, '')
  const long = content.length > 280
  const hasMetadata = Boolean(message.metadata && Object.keys(message.metadata).length > 0)
  const assistant = peers?.ai && message.peer_id === peers.ai
  return jsxs('article', {
    className: 'min-w-0 space-y-1 px-2.5 py-2',
    children: [
      jsxs('div', {
        className: 'flex min-w-0 flex-wrap items-center gap-x-2 text-[11px]',
        children: [
          message.rank ? jsx('span', { className: 'tabular-nums text-(--ui-text-tertiary)', children: `#${number(message.rank)}` }) : null,
          jsx('span', { className: cn('font-mono font-medium', assistant ? 'text-(--ui-text-secondary)' : 'text-foreground'), children: text(message.peer_id) }),
          jsx(MetaLine, {
            parts: [
              formatTime(message.created_at),
              message.token_count !== null && message.token_count !== undefined ? plural(message.token_count, 'token') : null
            ].filter(Boolean)
          }),
          long || hasMetadata
            ? jsxs('button', {
                type: 'button',
                'aria-expanded': open,
                onClick: () => setOpen(value => !value),
                className: 'ml-auto flex items-center gap-1 text-[11px] text-(--ui-text-tertiary) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
                children: [jsx(DisclosureCaret, { open, size: '0.7rem' }), long ? 'Full message' : 'Metadata']
              })
            : null
        ]
      }),
      jsx('p', {
        className: 'whitespace-pre-wrap text-[13px] leading-5 text-foreground',
        style: PROSE,
        children: (open || !long ? content : compact(content, 280)) || 'Empty message'
      }),
      open && hasMetadata ? jsx('pre', { className: cn(BLOCK, 'font-mono'), children: JSON.stringify(message.metadata, null, 2) }) : null
    ]
  })
}

function MessageList({ items, peers }) {
  return jsx('div', {
    className: 'min-w-0',
    style: BLEED,
    // The shipped stylesheet has no last: variant, so the final row opts out here.
    children: items.map((item, index) => jsx('div', { className: index < items.length - 1 ? 'border-b border-(--ui-stroke-tertiary)' : undefined, children: jsx(MessageRow, { message: item, peers }) }, item.id))
  })
}

function MessagesSection() {
  const layout = useLayout()
  const focus = useFocusScope()
  const snapshot = useHonchoSnapshot()
  const [page, setPage] = useState(1)
  const [draft, setDraft] = useState('')
  const [scope, setScope] = useState('session')
  const [scopeId, setScopeId] = useState('')
  const [run, setRun] = useState(null)
  const stored = useHonchoEndpoint('/messages', [page, PAGE_SIZE], { page, size: PAGE_SIZE })
  const scopesQuery = useHonchoEndpoint('/scopes', [1, 100], { page: 1, size: 100 }, { retry: 0, staleTime: 60_000 })
  const honchoScopes = scopesQuery.data?.capabilities?.scope_search && scopesQuery.data?.ok ? (scopesQuery.data.items || []) : []
  const scopeOptions = [
    { id: 'session', label: 'This session' },
    { id: 'peer', label: 'This user, all sessions' },
    { id: 'workspace', label: 'Whole workspace' },
    ...(honchoScopes.length ? [{ id: 'honcho', label: 'A Honcho scope' }] : [])
  ]
  const currentRun = run?.fingerprint === focus.fingerprint ? run : null
  const results = useEndpointForFocus(
    focus,
    '/search',
    currentRun ? [currentRun.scope, currentRun.scopeId || null, currentRun.query, currentRun.limit] : ['idle'],
    currentRun
      ? { scope: currentRun.scope, scope_id: currentRun.scopeId || null, query: currentRun.query, limit: currentRun.limit }
      : { scope, scope_id: scopeId || null, query: 'not-submitted', limit: SEARCH_LIMIT },
    { enabled: Boolean(currentRun), retry: 0, staleTime: 60_000 }
  )
  const peers = { ai: snapshot.data?.config?.ai_peer }

  useEffect(() => setPage(1), [focus.fingerprint])
  useEffect(() => {
    if (run && run.fingerprint !== focus.fingerprint) setRun(null)
  }, [focus.fingerprint, run])
  useEffect(() => {
    if (scope !== 'honcho') return
    if (honchoScopes.length === 0) {
      setScope('session')
      setScopeId('')
      setRun(null)
    } else if (!honchoScopes.some(item => item.id === scopeId)) {
      setScopeId(honchoScopes[0].id)
      setRun(null)
    }
  }, [honchoScopes, scope, scopeId])

  const submit = () => {
    const cleaned = draft.trim()
    if (!cleaned || focus.routeMismatch || results.isFetching || (scope === 'honcho' && !scopeId)) return
    setRun({ fingerprint: focus.fingerprint, query: cleaned, scope, scopeId, limit: SEARCH_LIMIT })
  }
  const clear = () => {
    setDraft('')
    setRun(null)
  }
  const scopeLabel = id => scopeOptions.find(option => option.id === id)?.label || id

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    children: [
      jsxs('div', {
        className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
        children: [
          jsx(SearchField, {
            value: draft,
            onChange: value => {
              setDraft(value)
              if (!value) setRun(null)
            },
            onClear: clear,
            onKeyDown: submitOnEnter(submit),
            'aria-label': 'Search messages',
            placeholder: 'Search messages and press Enter',
            loading: Boolean(currentRun) && results.isFetching,
            containerClassName: 'min-w-48 flex-1 opacity-100',
            inputClassName: 'w-full'
          }),
          jsxs(Select, {
            value: scope,
            onValueChange: next => {
              setScope(next)
              setRun(null)
            },
            children: [
              jsx(SelectTrigger, { 'aria-label': 'Search scope', className: layout === 'narrow' ? 'w-full' : 'w-52', children: jsx(SelectValue, {}) }),
              jsx(SelectContent, { 'data-honcho-surface': '', children: scopeOptions.map(option => jsx(SelectItem, { value: option.id, children: option.label }, option.id)) })
            ]
          }),
          scope === 'honcho'
            ? jsxs(Select, {
                value: scopeId,
                onValueChange: next => {
                  setScopeId(next)
                  setRun(null)
                },
                children: [
                  jsx(SelectTrigger, { 'aria-label': 'Honcho scope', className: layout === 'narrow' ? 'w-full' : 'w-48', children: jsx(SelectValue, { placeholder: 'Choose a scope' }) }),
                  jsx(SelectContent, { 'data-honcho-surface': '', children: honchoScopes.map(item => jsx(SelectItem, { value: item.id, children: text(item.id) }, item.id)) })
                ]
              })
            : null
        ]
      }),
      currentRun
        ? jsx(QueryState, {
            query: results,
            children: jsxs('div', {
              className: 'min-w-0 space-y-2',
              children: [
                jsx(RegionHeading, {
                  meta: `${plural(results.data?.items?.length || 0, 'match', 'matches')} · ${scopeLabel(currentRun.scope)}`,
                  actions: jsx(Button, { variant: 'text', size: 'inline', onClick: clear, children: 'Show saved messages' }),
                  children: `Results for “${currentRun.query}”`
                }),
                results.data?.items?.length
                  ? jsx(MessageList, { items: results.data.items, peers })
                  : jsx(Empty, { icon: 'search', title: 'No matching messages', description: results.data?.errors?.[0]?.message || 'Try other words or a wider scope. Results keep Honcho’s relevance order.' })
              ]
            })
          })
        : jsx(QueryState, {
            query: stored,
            children: jsxs('div', {
              className: 'min-w-0 space-y-2',
              children: [
                jsx(RegionHeading, { meta: plural(stored.data?.total || 0, 'message'), children: 'Saved in this session' }),
                stored.data?.items?.length
                  ? jsx(MessageList, { items: stored.data.items, peers })
                  : jsx(Empty, { icon: 'comment-discussion', title: 'No saved messages yet', description: stored.data?.errors?.[0]?.message || 'Messages appear here after Hermes saves them to Honcho.' }),
                jsx(Pager, { page: stored.data?.page || page, pages: stored.data?.pages, isFetching: stored.isFetching, onPage: setPage })
              ]
            })
          })
    ]
  })
}

// ── Context ─────────────────────────────────────────────────────────────────

function LayerChip({ label, available, detail }) {
  return jsxs('li', {
    className: 'flex min-w-0 items-center gap-1.5 text-xs',
    children: [
      jsx(StatusDot, { tone: available ? 'good' : 'muted' }),
      jsx('span', { className: available ? 'text-foreground' : 'text-(--ui-text-secondary)', children: label }),
      jsx('span', { className: 'text-(--ui-text-tertiary)', children: detail })
    ]
  })
}

function ContextBlock({ title, meta, children }) {
  return jsxs('section', { className: 'min-w-0 space-y-1', children: [jsx(RegionHeading, { meta, children: title }), children] })
}

function ContextSection() {
  const layout = useLayout()
  const [budget, setBudget] = useState(2048)
  const query = useHonchoEndpoint('/context', [budget], { token_budget: budget })
  const data = query.data
  const session = data?.session
  const empty = jsx('p', { className: 'text-xs text-(--ui-text-secondary)', children: 'Nothing yet.' })

  return jsxs('div', {
    className: 'min-w-0 space-y-4',
    style: { maxWidth: 880 },
    children: [
      jsxs('div', {
        className: cn('flex min-w-0 gap-2', layout === 'narrow' ? 'flex-col items-stretch' : 'flex-wrap items-center'),
        children: [
          jsxs(Select, {
            value: String(budget),
            onValueChange: value => setBudget(Number(value)),
            children: [
              jsx(SelectTrigger, { 'aria-label': 'Token budget', className: layout === 'narrow' ? 'w-full' : 'w-44', children: jsx(SelectValue, {}) }),
              jsx(SelectContent, { 'data-honcho-surface': '', children: CONTEXT_BUDGETS.map(value => jsx(SelectItem, { value: String(value), children: `${number(value)} token budget` }, value)) })
            ]
          }),
          jsxs(Button, { variant: 'secondary', size: 'sm', disabled: query.isFetching || query.routeMismatch, onClick: () => query.refetch(), children: [jsx(icons.RefreshCw, {}), query.isFetching ? 'Rebuilding…' : 'Rebuild'] }),
          data?.copy_text ? jsx(CopyButton, { appearance: 'button', buttonSize: 'sm', buttonVariant: 'ghost', text: data.copy_text, label: 'Copy context', showLabel: true }) : null
        ]
      }),
      jsx('p', {
        className: 'text-xs leading-5 text-(--ui-text-secondary)',
        style: PROSE,
        children: 'Rebuilt from Honcho just now. This is what Honcho would supply today, not a record of what an earlier reply received.'
      }),
      jsx(QueryState, {
        query,
        children: data
          ? jsxs('div', {
              className: 'min-w-0 space-y-5',
              children: [
                jsxs('ul', {
                  'aria-label': 'Context layers',
                  className: 'flex min-w-0 flex-wrap gap-x-4 gap-y-1',
                  children: [
                    jsx(LayerChip, { label: 'Summary', available: data.layers?.summaries, detail: session?.summary ? plural(session.summary.length, 'char') : 'none' }, 'summary'),
                    jsx(LayerChip, { label: 'Representation', available: data.layers?.conclusions, detail: data.session_representation ? plural(data.session_representation.length, 'char') : 'none' }, 'representation'),
                    jsx(LayerChip, { label: 'Peer card', available: data.layers?.peer_card, detail: plural(data.peer_card?.length || 0, 'fact') }, 'card'),
                    jsx(LayerChip, { label: 'Messages', available: data.layers?.messages, detail: contextMessageDetail(session) }, 'messages')
                  ]
                }),
                jsx(ContextBlock, {
                  title: 'Session summary',
                  children: session?.summary ? jsx('p', { className: 'whitespace-pre-wrap text-xs leading-5 text-foreground', style: PROSE, children: session.summary }) : empty
                }),
                jsx(ContextBlock, {
                  title: 'What Honcho knows in this session',
                  children: data.session_representation ? jsx('p', { className: 'whitespace-pre-wrap text-xs leading-5 text-foreground', style: PROSE, children: data.session_representation }) : empty
                }),
                jsx(ContextBlock, {
                  title: 'Peer card',
                  meta: 'Whole workspace',
                  children: data.peer_card?.length
                    ? jsx('ul', { className: 'list-disc space-y-1 pl-4 text-xs leading-5 text-foreground', style: PROSE, children: data.peer_card.map((fact, index) => jsx('li', { children: fact }, index)) })
                    : empty
                }),
                jsx('p', {
                  className: 'text-xs leading-5 text-(--ui-text-tertiary)',
                  style: PROSE,
                  children: `${plural(data.character_count || 0, 'character')} · about ${plural(data.token_estimate || 0, 'token')} of ${number(data.token_budget)}. ${text(data.scope_explanation, '')}`
                })
              ]
            })
          : null
      })
    ]
  })
}

// ── Status ──────────────────────────────────────────────────────────────────

function StatusSection() {
  const layout = useLayout()
  const snapshot = useHonchoSnapshot()
  const data = snapshot.data
  const gate = gateFor(snapshot)
  const activity = useHonchoEndpoint('/activity', [], {}, { poll: true, staleTime: 5_000, enabled: Boolean(data?.ok) })
  const config = data?.config
  const chat = data?.chat
  const queues = activity.data
  const errors = [...(data?.errors || []), ...(queues?.errors || [])]
  const detailCapable = Boolean(queues?.capabilities?.failed_task_detail || queues?.capabilities?.recent_task_detail)
  const routedVia = snapshot.ownerProfile !== snapshot.activeProfile ? snapshot.activeProfile : null

  const summary = gate
    ? jsx(StateLine, { tone: connectionStatus(snapshot).tone === 'bad' ? 'bad' : 'warn', title: gate.title, children: gate.description })
    : data?.ok
      ? jsx(StateLine, {
          tone: errors.length ? 'warn' : 'good',
          title: `Connected to ${text(config?.workspace_id, 'Honcho')}`,
          children: `${text(config?.endpoint)} answered in ${number(data.latency_ms)} ms. Checked every 10 seconds.`
        })
      : jsx(LoadingRows, { rows: 2 })

  return jsxs('div', {
    className: 'min-w-0 space-y-5',
    children: [
      summary,
      data
        ? jsxs('div', {
            style: { display: 'grid', gap: 28, gridTemplateColumns: layout === 'wide' ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' },
            children: [
              jsxs(DetailGroup, {
                title: 'This chat',
                children: [
                  jsx(DetailRow, { label: 'Hermes state', value: localState(snapshot) }, 'state'),
                  jsx(DetailRow, { label: 'Hermes chat', value: chat?.hermes_session_id || 'New draft', mono: true }, 'chat'),
                  jsx(DetailRow, { label: 'Honcho session', value: chat?.honcho_session_id, mono: true, accent: true }, 'session'),
                  jsx(DetailRow, { label: 'Saved in Honcho', value: chat?.found === true ? 'Yes' : chat?.found === false ? 'Not yet' : 'Not checked' }, 'found'),
                  jsx(DetailRow, { label: 'Mapped by', value: [config?.session_strategy, chat?.mapping_source].filter(Boolean).join(' · ') || null }, 'mapping'),
                  jsx(DetailRow, { label: 'Last message', value: chat?.latest_message_at ? `${formatTime(chat.latest_message_at)} · ${text(chat.latest_peer_id)}` : null }, 'latest'),
                  jsx(DetailRow, { label: 'Folder', value: chat?.cwd, mono: true }, 'cwd')
                ]
              }, 'chat'),
              jsxs(DetailGroup, {
                title: 'Profile',
                children: [
                  jsx(DetailRow, { label: 'Profile', value: data.profile, mono: true }, 'profile'),
                  routedVia ? jsx(DetailRow, { label: 'Read through', value: `${routedVia} (active profile)`, mono: true }, 'via') : null,
                  jsx(DetailRow, { label: 'Workspace', value: config?.workspace_id, mono: true }, 'workspace'),
                  jsx(DetailRow, { label: 'Peers', value: chat?.peers?.join(', ') || null, mono: true }, 'peers'),
                  jsx(DetailRow, { label: 'Recall mode', value: sentence(config?.recall_mode) }, 'recall'),
                  jsx(DetailRow, { label: 'Write frequency', value: sentence(config?.write_frequency) }, 'write'),
                  jsx(DetailRow, { label: 'Save messages', value: config ? (config.save_messages ? 'On' : 'Off') : null }, 'save')
                ]
              }, 'profile'),
              jsxs(DetailGroup, {
                title: 'Background reasoning',
                note: queues?.capability_note ? `${detailCapable ? '' : 'Totals only. '}${queues.capability_note}` : null,
                children: [
                  jsx(DetailRow, { label: 'This session', value: queues?.session_queue ? `${queueLabel(queues.session_queue)} · ${queueDetail(queues.session_queue)}` : activity.isLoading ? 'Checking…' : null }, 'session'),
                  jsx(DetailRow, { label: 'Workspace', value: queues?.workspace_queue ? `${queueLabel(queues.workspace_queue)} · ${queueDetail(queues.workspace_queue)}` : activity.isLoading ? 'Checking…' : null }, 'workspace'),
                  jsx(DetailRow, { label: 'SDK', value: queues?.sdk_version ? `honcho-ai ${queues.sdk_version}` : null, mono: true }, 'sdk')
                ]
              }, 'queues'),
              jsxs('section', {
                className: 'min-w-0 space-y-2',
                children: [jsx(RegionHeading, { children: 'Problems' }), jsx(Diagnostics, { errors })]
              }, 'problems')
            ]
          })
        : null
    ]
  })
}

// ── Add to session ──────────────────────────────────────────────────────────

const TEXT_FILE_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'csv', 'log', 'py', 'js', 'jsx', 'ts', 'tsx',
  'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'sh', 'jsonl'
])

function contentTypeForFile(file) {
  const declared = text(file?.type, '').toLowerCase().split(';', 1)[0]
  if (declared === 'application/pdf' || declared === 'application/json' || declared.startsWith('text/')) return declared
  const extension = text(file?.name, '').split('.').pop()?.toLowerCase()
  if (extension === 'pdf') return 'application/pdf'
  if (extension === 'json') return 'application/json'
  if (TEXT_FILE_EXTENSIONS.has(extension)) return 'text/plain'
  return declared || 'application/octet-stream'
}

function isSupportedUploadType(contentType) {
  return contentType === 'application/pdf' || contentType === 'application/json' || contentType.startsWith('text/')
}

function AddToSessionDialog({ origin, snapshot }) {
  const uploadRequest = useValue($uploadOrigin)
  const open = uploadRequest?.origin === origin
  const focus = useFocusScope()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState('text')
  const [draft, setDraft] = useState('')
  const [file, setFile] = useState(null)
  const [result, setResult] = useState(null)
  const [focusChanged, setFocusChanged] = useState(false)
  const [retryBlocked, setRetryBlocked] = useState(false)
  const focusFingerprintRef = useRef(focus.fingerprint)
  const openedFingerprintRef = useRef(uploadRequest?.fingerprint || focus.fingerprint)
  const inputId = `honcho-upload-${origin}`
  const uploadInFlightRef = useRef(false)

  focusFingerprintRef.current = focus.fingerprint
  if (open && uploadRequest?.fingerprint) openedFingerprintRef.current = uploadRequest.fingerprint

  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      uploadInFlightRef.current = true
      if (!requestPlugin) throw new Error('The Honcho plugin backend is not registered.')
      const confirmedFingerprint = openedFingerprintRef.current
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error('The focused chat changed. Reopen Add to session and confirm the new target.')
      const confirmedFocus = { ...focus, backendProfile: snapshot.data?.profile }

      let filename
      let contentType
      let bytes
      let sourceKind
      if (mode === 'text') {
        filename = 'pasted-context.txt'
        contentType = 'text/plain'
        bytes = new TextEncoder().encode(draft).buffer
        sourceKind = 'text'
      } else {
        if (!file) throw new Error('Choose a supported file first.')
        filename = file.name
        contentType = contentTypeForFile(file)
        if (!isSupportedUploadType(contentType)) throw new Error('Honcho accepts PDF, JSON, and text files. Images and other binary files aren’t supported.')
        bytes = await file.arrayBuffer()
        sourceKind = 'file'
      }

      const ticket = await requestForFocus(confirmedFocus, '/upload-ticket', {
        method: 'POST',
        body: { ...focus.body, filename, content_type: contentType, size: bytes.byteLength, source_kind: sourceKind },
        timeoutMs: 22_000
      })
      if (!ticket?.ok || !ticket.ticket) throw new Error(ticket?.errors?.[0]?.message || 'Honcho couldn’t prepare this upload.')
      if (!ticket.target ||
          ticket.target.workspace_id !== snapshot.data?.config?.workspace_id ||
          ticket.target.session_id !== snapshot.data?.chat?.honcho_session_id ||
          ticket.target.peer_id !== snapshot.data?.config?.user_peer) {
        throw new Error('The Honcho target changed after you confirmed it. Nothing was sent. Refresh and confirm the new target.')
      }
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error('The focused chat changed before upload. Nothing was sent.')

      let uploaded
      try {
        uploaded = await requestForFocus(confirmedFocus, `/uploads/${encodeURIComponent(ticket.ticket)}`, {
          method: 'POST',
          upload: { filename, contentType, bytes },
          timeoutMs: 125_000
        })
      } catch {
        const error = new Error('The upload response was lost. Check this session’s Messages before trying again. Closing this dialog doesn’t cancel server processing.')
        error.uploadState = 'outcome_unknown'
        error.committed = null
        throw error
      }
      if (focusFingerprintRef.current !== confirmedFingerprint) {
        const error = new Error('The chat changed while Honcho processed the upload. The original session may have new messages. Check its Messages before trying again.')
        error.uploadState = 'focus_changed_after_upload'
        throw error
      }
      if (!uploaded?.ok) {
        const error = new Error(uploaded?.errors?.[0]?.message || 'Honcho didn’t confirm the upload.')
        error.uploadState = uploaded?.state
        error.committed = uploaded?.committed
        throw error
      }
      return { ...uploaded, ticket, honcho_default_max_file_size: ticket.capabilities?.honcho_default_max_file_size }
    },
    onSuccess: uploaded => {
      setResult(uploaded)
      queryClient.invalidateQueries({ queryKey: [PLUGIN_ID] })
    },
    onError: error => {
      if (error.uploadState && error.committed !== false) {
        setRetryBlocked(true)
        queryClient.invalidateQueries({ queryKey: [PLUGIN_ID] })
      }
    },
    onSettled: () => {
      uploadInFlightRef.current = false
    }
  })

  useEffect(() => {
    if (open && openedFingerprintRef.current !== focus.fingerprint) setFocusChanged(true)
  }, [focus.fingerprint, open])

  function resetFeedback() {
    if (mutation.isPending || retryBlocked) return
    setResult(null)
    mutation.reset()
  }

  function setOpen(next) {
    if (mutation.isPending || uploadInFlightRef.current) return
    setRetryBlocked(false)
    setResult(null)
    mutation.reset()
    if (next) {
      openedFingerprintRef.current = focus.fingerprint
      setFocusChanged(false)
      $uploadOrigin.set({ origin, fingerprint: focus.fingerprint })
    } else {
      $uploadOrigin.set(null)
      setFile(null)
      setDraft('')
      setFocusChanged(false)
    }
  }

  const contentType = mode === 'file' && file ? contentTypeForFile(file) : 'text/plain'
  const selectedSize = mode === 'file' && file ? file.size : new TextEncoder().encode(draft).byteLength
  const supported = mode === 'text' || !file || isSupportedUploadType(contentType)
  const hasContent = mode === 'text' ? Boolean(draft.trim()) : Boolean(file)
  const targetReady = Boolean(snapshot.data?.ok && snapshot.data?.chat?.found && !focus.routeMismatch)
  const overDefault = selectedSize > HONCHO_DEFAULT_FILE_BYTES
  const locked = mutation.isPending || retryBlocked
  const error = mutation.error
  const errorTitle = error?.uploadState === 'outcome_unknown'
    ? 'Outcome unknown'
    : error?.committed === true || error?.uploadState === 'focus_changed_after_upload'
      ? 'Added but not verified'
      : 'Not added'

  return jsx(Dialog, {
    open,
    onOpenChange: setOpen,
    children: jsxs(DialogContent, {
      'data-honcho-surface': '',
      style: DIALOG_STYLE,
      showCloseButton: !mutation.isPending,
      onEscapeKeyDown: event => { if (uploadInFlightRef.current) event.preventDefault() },
      onInteractOutside: event => { if (uploadInFlightRef.current) event.preventDefault() },
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: 'Add to this Honcho session' }),
            jsx(DialogDescription, { children: 'Honcho saves the text or file as one or more messages in the session below, then reasons over it in the background. Nothing is sent until you choose Add to session.' })
          ]
        }),
        jsx(TargetList, {
          rows: [
            ['Profile', snapshot.data?.profile || focus.ownerProfile],
            ['Workspace', snapshot.data?.config?.workspace_id],
            ['Session', snapshot.data?.chat?.honcho_session_id],
            ['Attributed to', snapshot.data?.config?.user_peer]
          ]
        }),
        jsxs('div', {
          className: 'space-y-3',
          children: [
            jsx(SegmentedControl, {
              value: mode,
              disabled: locked,
              onChange: next => {
                if (locked) return
                setMode(next)
                resetFeedback()
              },
              options: [{ id: 'text', label: 'Paste text' }, { id: 'file', label: 'Choose a file' }]
            }),
            mode === 'text'
              ? jsx(Textarea, {
                  disabled: locked,
                  value: draft,
                  onChange: event => {
                    setDraft(event.target.value)
                    resetFeedback()
                  },
                  rows: 8,
                  'aria-label': 'Text to add to the current Honcho session',
                  placeholder: 'Paste notes, source material, or other context.',
                  className: 'resize-y'
                })
              : jsxs('div', {
                  className: 'space-y-2',
                  children: [
                    jsx('input', {
                      id: inputId,
                      type: 'file',
                      disabled: locked,
                      accept: '.pdf,.json,.txt,.md,.markdown,.csv,.log,.py,.js,.jsx,.ts,.tsx,.yaml,.yml,.toml,.xml,.html,.css,.sh,.jsonl,application/pdf,application/json,text/*',
                      className: 'sr-only',
                      onChange: event => {
                        setFile(event.target.files?.[0] || null)
                        resetFeedback()
                      }
                    }),
                    jsxs(Button, {
                      variant: 'secondary',
                      size: 'sm',
                      disabled: locked,
                      onClick: () => document.getElementById(inputId)?.click(),
                      children: [jsx(icons.FolderOpen, {}), file ? 'Choose another file' : 'Choose a file']
                    }),
                    file
                      ? jsxs('div', {
                          className: 'min-w-0',
                          children: [
                            jsx('div', { className: 'break-words font-mono text-[11px] text-foreground', children: file.name }),
                            jsx('div', { className: 'mt-0.5 text-xs text-(--ui-text-secondary)', children: `${contentType} · ${formatBytes(file.size)}` })
                          ]
                        })
                      : jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: 'PDF, JSON, or text files. Honcho’s default limit is 5 MiB; your server may use another.' })
                  ]
                }),
            hasContent && mode === 'text'
              ? jsx('div', { className: 'text-xs tabular-nums text-(--ui-text-tertiary)', children: `${plural(draft.length, 'character')} · ${formatBytes(selectedSize)}` })
              : null,
            !supported ? jsx(StateLine, { tone: 'bad', title: 'Unsupported file type', children: 'Honcho accepts PDF, JSON, and text files. Choose another file.' }) : null,
            overDefault
              ? jsx(StateLine, {
                  tone: 'warn',
                  title: 'Larger than Honcho’s default limit',
                  children: `Honcho’s default server limit is ${formatBytes(HONCHO_DEFAULT_FILE_BYTES)}. Self-hosted servers may set another limit, and your server makes the final call.`
                })
              : null,
            !targetReady ? jsx(StateLine, { tone: 'warn', title: 'No saved session to add to', children: 'This needs a chat that Hermes has already saved to Honcho in this profile.' }) : null,
            focusChanged ? jsx(StateLine, { tone: 'warn', title: 'The chat changed', children: 'Close and reopen this dialog to confirm the new target.' }) : null,
            error ? jsx(StateLine, { tone: retryBlocked ? 'warn' : 'bad', title: errorTitle, children: error.message }) : null,
            result
              ? jsx(StateLine, {
                  tone: 'good',
                  title: `Added ${plural(result.created_count || 0, 'message')}`,
                  children: jsxs('div', {
                    children: [
                      jsx('p', { children: `Each message was read back from ${text(result.target?.session_id || result.ticket?.target?.session_id)}.` }),
                      jsx('div', { className: 'mt-1 break-words font-mono text-[11px] text-(--ui-text-tertiary)', children: result.created?.map(message => message.id).join(' · ') })
                    ]
                  })
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(Button, { variant: 'ghost', disabled: mutation.isPending, onClick: () => setOpen(false), children: result || retryBlocked ? 'Close' : 'Cancel' }),
            !result
              ? jsxs(Button, {
                  disabled: locked || !hasContent || !supported || !targetReady || focusChanged,
                  onClick: () => {
                    if (uploadInFlightRef.current) return
                    uploadInFlightRef.current = true
                    mutation.mutate()
                  },
                  children: [jsx(icons.Upload, {}), mutation.isPending ? 'Adding…' : 'Add to session']
                })
              : null
          ]
        })
      ]
    })
  })
}

// ── Page, pane and status bar ───────────────────────────────────────────────

function SectionBody({ snapshot }) {
  const active = useValue($activeTab)
  if (active === 'status') return jsx(StatusSection, {})
  const gate = gateFor(snapshot)
  if (gate) return jsx(GateState, { gate, query: snapshot })
  if (!snapshot.data) return jsx(LoadingRows, {})
  if (active === 'ask') return jsx(AskSection, {})
  if (active === 'messages') return jsx(MessagesSection, {})
  if (active === 'context') return jsx(ContextSection, {})
  return jsx(MemorySection, {})
}

function HonchoPage({ origin = 'page' } = {}) {
  // A router may navigate without a hashchange event. Mounting the page is the
  // reliable signal that the user just opened it.
  useEffect(() => {
    if (origin === 'page') adoptNavigationFocus()
  }, [origin])
  const snapshot = useHonchoSnapshot()
  const active = useValue($activeTab)
  return jsx('main', {
    className: 'h-full overflow-y-auto',
    children: jsx(ResponsiveSurface, {
      // Runtime plugins have no Tailwind build. Keep container geometry explicit.
      className: 'min-h-full font-sans',
      style: { padding: origin === 'pane' ? '12px 16px 24px' : '20px clamp(16px, 4%, 48px) 32px' },
      children: jsxs('div', {
        className: 'flex min-w-0 flex-col',
        style: { gap: 14, maxWidth: 1280, marginInline: 'auto' },
        children: [
          jsx(PageHeader, { query: snapshot, origin }),
          jsx(SectionNav, { origin, snapshot }),
          jsx('section', {
            id: `honcho-${origin}-section`,
            role: 'tabpanel',
            'aria-labelledby': `honcho-${origin}-tab-${active}`,
            className: 'min-w-0 pt-1',
            children: jsx(SectionBody, { snapshot }, snapshot.fingerprint)
          }),
          jsx(AddToSessionDialog, { origin, snapshot })
        ]
      })
    })
  })
}

function HonchoMemoryPane() {
  const visible = useValue(host.paneVisibility(`${PLUGIN_ID}:memory`))
  return visible ? jsx(HonchoPage, { origin: 'pane' }) : null
}

function HonchoStatusChip() {
  const snapshot = useHonchoSnapshot()
  const viewport = useValue(host.state.viewport)
  const compactStatus = viewport?.width < 640
  const data = snapshot.data
  const queue = data?.chat?.queue || data?.queue
  const status = connectionStatus(snapshot)
  let label = `Honcho · ${status.label.toLowerCase()}`
  if (!snapshot.routeMismatch && data?.ok) {
    if (snapshot.busy) label = snapshot.awaitingResponse ? 'Honcho · waiting' : 'Honcho · working'
    else if (queue?.in_progress > 0) label = `Honcho · ${number(queue.in_progress)} processing`
    else if (queue?.pending > 0) label = `Honcho · ${number(queue.pending)} waiting`
    else label = 'Honcho · ready'
  }
  const tip = snapshot.routeMismatch
    ? blockMessage(snapshot.blockReason)
    : data?.ok
      ? `${text(data.profile)} · ${text(data.config?.workspace_id)} · ${queueLabel(queue)}`
      : data?.errors?.[0]?.message || 'Open Honcho memory for details'

  return jsx(Tip, {
    label: tip,
    children: jsxs('button', {
      type: 'button',
      'aria-label': label,
      'data-honcho-surface': '',
      onClick: openWorkbench,
      className: 'inline-flex h-full items-center gap-1.5 rounded-none px-1.5 text-[0.6875rem] tabular-nums text-(--ui-text-tertiary) transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground',
      children: [jsx(StatusDot, { tone: status.tone }), compactStatus ? null : jsx('span', { children: label })]
    })
  })
}

export default {
  id: PLUGIN_ID,
  name: 'Honcho',
  description: 'Inspect, search, question, and correct the Honcho memory behind the focused chat.',
  defaultEnabled: true,
  register(ctx) {
    requestPlugin = ctx.rest
    installInspectionFocus(ctx)
    ctx.onDispose(() => {
      requestPlugin = null
    })

    ctx.registerMany([
      {
        id: 'page',
        area: ROUTES_AREA,
        data: { path: ROUTE },
        render: () => jsx(HonchoPage, {})
      },
      {
        id: 'memory',
        area: PANES_AREA,
        title: 'Honcho Memory',
        data: {
          placement: 'main',
          dock: { pane: 'workspace', pos: 'right', enforce: true },
          defaultCollapsed: true,
          width: '360px'
        },
        render: () => jsx(HonchoMemoryPane, {})
      },
      {
        id: 'nav',
        area: SIDEBAR_NAV_AREA,
        order: 55,
        data: { codicon: 'database', label: 'Honcho', path: ROUTE }
      },
      {
        id: 'status',
        area: STATUSBAR_AREAS.right,
        order: 85,
        render: () => jsx(HonchoStatusChip, {})
      },
      {
        id: 'open',
        area: PALETTE_AREA,
        data: {
          id: 'honcho.open',
          label: 'Honcho: Open memory',
          keywords: ['honcho', 'memory', 'conclusions', 'session', 'context', 'search'],
          run: openWorkbench
        }
      }
    ])
  }
}
