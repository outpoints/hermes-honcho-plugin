/**
 * Hermes Honcho memory cockpit.
 *
 * Plain ESM only. Hermes rewrites the SDK and React specifiers at runtime, so
 * this file uses jsx()/jsxs() and requires no frontend build step.
 */

import {
  atom,
  Badge,
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
  EmptyState,
  host,
  Input,
  PANES_AREA,
  PALETTE_AREA,
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
  Tabs,
  TabsList,
  TabsTrigger,
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
const HONCHO_DEFAULT_FILE_BYTES = 5_242_880
const TABS = ['OVERVIEW', 'MESSAGES', 'CONCLUSIONS', 'CONTEXT', 'SEARCH', 'ACTIVITY']
const $activeTab = atom('OVERVIEW')
const $uploadOrigin = atom(null)
const LayoutContext = createContext('compact')

let requestPlugin = null

function layoutForWidth(width) {
  if (width < 420) return 'narrow'
  if (width < 840) return 'compact'
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
    'data-layout': layout,
    className,
    style,
    children: jsx(LayoutContext.Provider, { value: layout, children })
  })
}

function useLayout() {
  return useContext(LayoutContext)
}

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

// Presentation labels only. Never apply this to session, peer, or profile IDs.
function uiLabel(value) {
  if (typeof value !== 'string' || !/^[A-Z_ …]+$/.test(value)) return value
  const words = value.toLowerCase().replaceAll('_', ' ')
  return (words.charAt(0).toUpperCase() + words.slice(1)).replace(/\bhoncho\b/g, 'Honcho').replace(/\bhermes\b/g, 'Hermes')
}

function number(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return new Intl.NumberFormat().format(Number(value))
}

function compact(value, limit = 180) {
  const source = text(value, '')
  return source.length > limit ? `${source.slice(0, limit).trimEnd()}…` : source
}

function formatTime(value, fallback = 'No activity yet') {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return text(value)
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function queueLabel(queue) {
  if (!queue) return 'Unavailable'
  if (queue.in_progress > 0) return `${number(queue.in_progress)} processing`
  if (queue.pending > 0) return `${number(queue.pending)} pending`
  return 'Caught up'
}

function stateTone(data, isError) {
  if (isError || data?.state === 'unreachable' || data?.state === 'error') return 'bad'
  if (
    data?.state === 'not_configured' ||
    data?.state === 'disabled' ||
    data?.state === 'partial' ||
    data?.state === 'route_mismatch'
  ) return 'warn'
  if (data?.ok) return 'good'
  return 'muted'
}

function useFocusScope() {
  const activeProfile = useValue(host.state.profile)
  const focusedProfile = useValue(host.state.focusedSessionProfile)
  const focusedOwner = useValue(host.state.focusedSessionOwner)
  const connectionId = useValue(host.state.connectionId)
  const runtimeSessionId = useValue(host.state.focusedSessionId)
  const storedSessionId = useValue(host.state.focusedStoredSessionId)
  const cwd = useValue(host.state.cwd)
  const busy = useValue(host.state.busy)
  const awaitingResponse = useValue(host.state.awaitingResponse)
  const ownerConnection = focusedOwner?.connectionId || null
  const profileMismatch = Boolean(focusedProfile && activeProfile && focusedProfile !== activeProfile)
  const connectionMismatch = Boolean(ownerConnection && connectionId && ownerConnection !== connectionId)
  const routeMismatch = profileMismatch || connectionMismatch
  const profile = activeProfile || 'default'
  const focusProfile = focusedProfile || profile
  const activeConnection = connectionId || 'local'
  const focusConnection = ownerConnection || activeConnection
  const focusId = storedSessionId || runtimeSessionId || 'draft'
  const fingerprint = [
    profile,
    activeConnection,
    focusProfile,
    focusConnection,
    storedSessionId || '',
    runtimeSessionId || '',
    cwd || ''
  ].join('|')

  return {
    activeProfile: profile,
    focusedProfile: focusProfile,
    focusedOwner,
    connectionId: activeConnection,
    ownerConnection: focusConnection,
    runtimeSessionId,
    storedSessionId,
    cwd,
    busy,
    awaitingResponse,
    routeMismatch,
    fingerprint,
    key: [profile, activeConnection, focusProfile, focusConnection, focusId, runtimeSessionId || '', cwd || ''],
    body: {
      profile,
      focused_profile: focusProfile,
      connection_id: activeConnection,
      focused_connection_id: focusConnection,
      runtime_session_id: routeMismatch ? null : runtimeSessionId,
      stored_session_id: routeMismatch ? null : storedSessionId,
      cwd: routeMismatch ? null : cwd
    }
  }
}

function requestForFocus(focus, endpoint, options) {
  if (!requestPlugin) throw new Error('Honcho plugin backend is not registered')
  if (focus.routeMismatch) throw new Error('The focused conversation does not match the active profile or connection.')
  // Some Desktop versions omit the selector for a shared local backend.
  // Keep ctx.rest as the authenticated transport; remote aliases remain host-owned.
  const path = focus.connectionId === 'local'
    ? `${endpoint}${endpoint.includes('?') ? '&' : '?'}profile=${encodeURIComponent(focus.activeProfile)}`
    : endpoint
  return requestPlugin(path, options)
}

function useEndpointForFocus(focus, endpoint, keyParts = [], extraBody = {}, options = {}) {
  const enabled = options.enabled !== false && !focus.routeMismatch
  const query = useQuery({
    queryKey: [PLUGIN_ID, endpoint, ...focus.key, ...keyParts],
    queryFn: () => {
      return requestForFocus(focus, endpoint, {
        method: 'POST',
        body: { ...focus.body, ...extraBody },
        timeoutMs: 22_000
      })
    },
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

function localState(query) {
  if (query.busy) return query.awaitingResponse ? 'Waiting for response' : 'Generating'
  return 'Idle'
}

function formatBytes(value) {
  const bytes = Number(value)
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
}

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

function LineageStrip({ focus, snapshot }) {
  const layout = useLayout()
  const chat = snapshot?.data?.chat
  const config = snapshot?.data?.config
  const items = [
    ['Connection', focus.connectionId],
    ['Profile', focus.activeProfile],
    ['Honcho session', chat?.honcho_session_id],
    ['Attributed peer', config?.user_peer]
  ]
  const columns = layout === 'wide' ? 4 : 2

  return jsx('div', {
    'aria-label': 'Honcho memory lineage',
    className: 'grid gap-3 border-b border-(--ui-stroke-tertiary) py-3',
    style: { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` },
    children: items.map(([label, value], index) =>
      jsxs('div', {
        className: 'min-w-0',
        children: [
          jsx('div', { className: 'text-xs text-(--ui-text-secondary)', children: label }),
          jsx('div', {
            className: 'mt-1 font-mono text-[11px] text-foreground',
            style: { overflowWrap: 'anywhere' },
            title: text(value),
            children: text(value, 'Not resolved')
          })
        ]
      }, `${label}-${index}`)
    )
  })
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
  const focusFingerprintRef = useRef(focus.fingerprint)
  const openedFingerprintRef = useRef(uploadRequest?.fingerprint || focus.fingerprint)
  const inputId = `honcho-upload-${origin}`

  focusFingerprintRef.current = focus.fingerprint
  if (open && uploadRequest?.fingerprint) openedFingerprintRef.current = uploadRequest.fingerprint

  const mutation = useMutation({
    mutationFn: async () => {
      if (!requestPlugin) throw new Error('Honcho plugin backend is not registered')
      const confirmedFingerprint = openedFingerprintRef.current
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error('The focused conversation changed. Reopen Add to Session and confirm the new target.')

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
        if (!isSupportedUploadType(contentType)) throw new Error('Honcho supports PDF, JSON, and text files. Images and binary formats are not accepted.')
        bytes = await file.arrayBuffer()
        sourceKind = 'file'
      }

      const ticket = await requestForFocus(focus, '/upload-ticket', {
        method: 'POST',
        body: {
          ...focus.body,
          filename,
          content_type: contentType,
          size: bytes.byteLength,
          source_kind: sourceKind
        },
        timeoutMs: 22_000
      })
      if (!ticket?.ok || !ticket.ticket) throw new Error(ticket?.errors?.[0]?.message || 'Honcho could not prepare this upload target.')
      if (focusFingerprintRef.current !== confirmedFingerprint) throw new Error('The focused conversation changed before upload. Nothing was sent.')

      const uploaded = await requestForFocus(focus, `/uploads/${encodeURIComponent(ticket.ticket)}`, {
        method: 'POST',
        upload: { filename, contentType, bytes },
        timeoutMs: 125_000
      })
      if (focusFingerprintRef.current !== confirmedFingerprint) {
        const error = new Error('The conversation changed while Honcho was processing the upload. The old session may have received messages; inspect its Messages tab before retrying.')
        error.uploadState = 'focus_changed_after_upload'
        throw error
      }
      if (!uploaded?.ok) {
        const error = new Error(uploaded?.errors?.[0]?.message || 'Honcho did not confirm the upload.')
        error.uploadState = uploaded?.state
        error.committed = uploaded?.committed
        throw error
      }
      return {
        ...uploaded,
        ticket,
        honcho_default_max_file_size: ticket.capabilities?.honcho_default_max_file_size
      }
    },
    onSuccess: uploaded => {
      setResult(uploaded)
      queryClient.invalidateQueries({ queryKey: [PLUGIN_ID] })
    }
  })

  useEffect(() => {
    if (open && openedFingerprintRef.current !== focus.fingerprint) setFocusChanged(true)
  }, [focus.fingerprint, open])

  function resetFeedback() {
    setResult(null)
    mutation.reset()
  }

  function setOpen(next) {
    if (next) {
      openedFingerprintRef.current = focus.fingerprint
      setFocusChanged(false)
      resetFeedback()
      $uploadOrigin.set({ origin, fingerprint: focus.fingerprint })
    } else {
      $uploadOrigin.set(null)
      setFile(null)
      setDraft('')
      setFocusChanged(false)
      resetFeedback()
    }
  }

  const contentType = mode === 'file' && file ? contentTypeForFile(file) : 'text/plain'
  const selectedSize = mode === 'file' && file ? file.size : new TextEncoder().encode(draft).byteLength
  const supported = mode === 'text' || !file || isSupportedUploadType(contentType)
  const hasContent = mode === 'text' ? Boolean(draft.trim()) : Boolean(file)
  const targetReady = Boolean(snapshot.data?.ok && snapshot.data?.chat?.found && !focus.routeMismatch)
  const overDefault = selectedSize > HONCHO_DEFAULT_FILE_BYTES
  const error = mutation.error
  const errorTitle = error?.uploadState === 'outcome_unknown'
    ? 'UPLOAD_OUTCOME_UNKNOWN'
    : error?.committed === true || error?.uploadState === 'focus_changed_after_upload'
      ? 'UPLOAD_COMMITTED_UNVERIFIED'
      : 'UPLOAD_NOT_CONFIRMED'

  return jsx(Dialog, {
    open,
    onOpenChange: setOpen,
    children: jsxs(DialogContent, {
      className: 'max-h-[88vh] overflow-y-auto sm:max-w-xl',
      children: [
        jsxs(DialogHeader, {
          children: [
            jsx(DialogTitle, { children: 'Add to current Honcho session' }),
            jsx(DialogDescription, {
              children: 'Selecting content does not write anything. The final action creates one or more messages in the exact session shown below and queues Honcho processing.'
            })
          ]
        }),
        jsx(LineageStrip, { focus, snapshot }),
        jsxs('div', {
          className: 'space-y-3',
          children: [
            jsx(SegmentedControl, {
              value: mode,
              onChange: next => {
                setMode(next)
                resetFeedback()
              },
              options: [
                { id: 'text', label: 'Paste text' },
                { id: 'file', label: 'Choose file' }
              ]
            }),
            mode === 'text'
              ? jsx(Textarea, {
                  value: draft,
                  onChange: event => {
                    setDraft(event.target.value)
                    resetFeedback()
                  },
                  rows: 9,
                  'aria-label': 'Text to add to the current Honcho session',
                  placeholder: 'Paste notes, source material, or other context…',
                  className: 'resize-y'
                })
              : jsxs('div', {
                  className: 'space-y-2 border border-(--ui-stroke-tertiary) bg-(--ui-bg-quaternary) p-3',
                  children: [
                    jsx('input', {
                      id: inputId,
                      type: 'file',
                      accept: '.pdf,.json,.txt,.md,.markdown,.csv,.log,.py,.js,.jsx,.ts,.tsx,.yaml,.yml,.toml,.xml,.html,.css,.sh,.jsonl,application/pdf,application/json,text/*',
                      className: 'sr-only',
                      onChange: event => {
                        setFile(event.target.files?.[0] || null)
                        resetFeedback()
                      }
                    }),
                    jsx(ActionButton, {
                      type: 'button',
                      icon: 'folder-opened',
                      onClick: () => document.getElementById(inputId)?.click(),
                      children: file ? 'CHOOSE_ANOTHER_FILE' : 'CHOOSE_FILE'
                    }),
                    file
                      ? jsxs('div', {
                          className: 'min-w-0',
                          children: [
                            jsx('div', { className: 'break-words font-mono text-[11px] text-foreground', children: file.name }),
                            jsx('div', { className: 'mt-1 font-mono text-[10px] uppercase text-(--ui-text-tertiary)', children: `${contentType} · ${formatBytes(file.size)}` })
                          ]
                        })
                      : jsx('p', { className: 'text-xs leading-5 text-(--ui-text-secondary)', children: 'Supported by Honcho: PDF, JSON, and text-based files.' })
                  ]
                }),
            hasContent
              ? jsx('div', {
                  className: 'font-mono text-[10px] uppercase tracking-[0.06em] text-(--ui-text-tertiary)',
                  children: `${mode === 'text' ? number(draft.length, '0') + ' CHAR · ' : ''}${formatBytes(selectedSize)} · ${contentType}`
                })
              : null,
            !supported
              ? jsx(StateLine, { tone: 'bad', title: 'UNSUPPORTED_FILE', children: 'Honcho accepts PDF, JSON, and text files. Choose another file.' })
              : null,
            overDefault
              ? jsx(StateLine, {
                  tone: 'warn',
                  title: 'ABOVE_HONCHO_DEFAULT',
                  children: `This selection is larger than Honcho’s current default server limit of ${formatBytes(HONCHO_DEFAULT_FILE_BYTES)}. Self-hosted servers may configure another limit; the active server will make the authoritative decision.`
                })
              : null,
            !targetReady
              ? jsx(StateLine, { tone: 'warn', title: 'CURRENT_SESSION_UNAVAILABLE', children: 'A saved, existing Honcho session owned by this connection and profile is required.' })
              : null,
            focusChanged
              ? jsx(StateLine, { tone: 'warn', title: 'FOCUS_CHANGED', children: 'The focused conversation changed. Close and reopen this dialog to confirm the new target.' })
              : null,
            error
              ? jsx(StateLine, {
                  tone: error?.committed === true || error?.uploadState === 'focus_changed_after_upload' ? 'warn' : 'bad',
                  title: errorTitle,
                  children: error.message
                })
              : null,
            result
              ? jsx(StateLine, {
                  tone: 'good',
                  title: 'MESSAGES_CREATED',
                  children: jsxs('div', {
                    children: [
                      jsx('p', { children: `${number(result.created_count, '0')} message records were created and read back from ${text(result.target?.session_id)}.` }),
                      jsx('div', {
                        className: 'mt-1 break-words font-mono text-[10px] text-(--ui-text-tertiary)',
                        children: result.created?.map(message => message.id).join(' · ')
                      })
                    ]
                  })
                })
              : null
          ]
        }),
        jsxs(DialogFooter, {
          children: [
            jsx(ActionButton, { type: 'button', onClick: () => setOpen(false), children: result ? 'DONE' : 'CANCEL' }),
            !result
              ? jsx(ActionButton, {
                  type: 'button',
                  variant: 'default',
                  icon: 'cloud-upload',
                  disabled: mutation.isPending || !hasContent || !supported || !targetReady || focusChanged,
                  onClick: () => mutation.mutate(),
                  children: mutation.isPending ? 'ADDING…' : 'ADD_TO_SESSION'
                })
              : null
          ]
        })
      ]
    })
  })
}

function ActionButton({ children, icon, className, ...props }) {
  return jsxs(Button, {
    ...props,
    variant: props.variant || 'secondary',
    size: props.size || 'default',
    className,
    children: [icon ? jsx(Codicon, { name: icon, size: '1em' }) : null, uiLabel(children)]
  })
}

function ConsolePanel({ title, tone, actions, children, bodyClassName }) {
  return jsxs('section', {
    className: 'min-w-0',
    children: [
      jsxs('header', {
        className: 'mb-2 flex flex-wrap items-center justify-between gap-2',
        children: [
          jsxs('div', {
            className: 'flex min-w-0 items-center gap-2 text-sm font-medium text-foreground',
            children: [tone === 'bad' || tone === 'warn' ? jsx(StatusDot, { tone }) : null, jsx('h2', { children: uiLabel(title) })]
          }),
          jsx('div', {
            className: 'flex shrink-0 items-center gap-2',
            children: actions || null
          })
        ]
      }),
      jsx('div', { className: cn('min-w-0', bodyClassName), children })
    ]
  })
}

function StateLine({ tone = 'muted', title, children }) {
  return jsxs('div', {
    className: cn(
      'flex items-start gap-2 py-2',
      tone === 'bad' && 'text-destructive'
    ),
    children: [
      jsx(StatusDot, { tone }),
      jsxs('div', {
        className: 'min-w-0',
        children: [
          jsx('div', {
            className: cn(
              'text-xs font-medium',
              tone === 'bad' ? 'text-destructive' : 'text-foreground'
            ),
            children: uiLabel(title)
          }),
          children
            ? jsx('div', { className: 'mt-1 text-xs leading-5 text-(--ui-text-secondary)', style: { maxWidth: '72ch', overflowWrap: 'anywhere' }, children })
            : null
        ]
      })
    ]
  })
}

function QueryState({ query, title, children }) {
  if (query.routeMismatch) {
    return jsx(StateLine, {
      tone: 'warn',
      title: 'ROUTING_BLOCKED',
      children: 'This chat belongs to a different Hermes profile or connection. Honcho reads are paused so memory cannot leak across profiles.'
    })
  }
  if (query.isLoading) {
    return jsx(ConsolePanel, {
      title,
      tone: 'muted',
      bodyClassName: 'space-y-2',
      children: [0, 1, 2, 3].map(index =>
        jsx(Skeleton, { className: cn('h-8 rounded-none', index === 3 && 'w-2/3') }, index)
      )
    })
  }
  if (query.isError) {
    const detail = query.error instanceof Error ? query.error.message : 'The plugin API could not be reached.'
    return jsx(ConsolePanel, {
      title: `${title}_UNAVAILABLE`,
      tone: 'bad',
      children: jsx(StateLine, {
        tone: 'bad',
        title: 'BACKEND_ERROR',
        children: jsxs('div', {
          children: [
            jsx('p', { children: detail }),
            jsx(ActionButton, {
              icon: 'refresh',
              className: 'mt-2',
              disabled: query.isFetching,
              onClick: () => query.refetch(),
              children: query.isFetching ? 'RETRYING…' : 'TRY_AGAIN'
            })
          ]
        })
      })
    })
  }
  return children
}

function EmptyReadout({ title, description }) {
  return jsx(EmptyState, { title: uiLabel(title), description, className: 'px-3 py-6' })
}

function MetricCell({ label, value, detail, accent = false }) {
  return jsxs('div', {
    className: 'min-w-0 py-2',
    children: [
      jsx('div', {
        className: 'text-xs text-(--ui-text-secondary)',
        children: uiLabel(label)
      }),
      jsx('div', {
        className: cn(
          'mt-1 font-mono text-sm font-semibold tabular-nums text-foreground',
          accent && 'text-primary'
        ),
        title: text(value),
        children: text(value)
      }),
      detail
        ? jsx('div', {
            className: 'mt-0.5 truncate font-mono text-[10px] text-muted-foreground',
            title: detail,
            children: detail
          })
        : null
    ]
  })
}

function MetricStrip({ children, columns = 4 }) {
  const layout = useLayout()
  const visibleColumns = layout === 'wide' ? columns : 2
  return jsx('div', {
    className: 'grid gap-4',
    style: { gridTemplateColumns: `repeat(${visibleColumns}, minmax(0, 1fr))` },
    children
  })
}

function DetailRow({ label, value, mono = false, accent = false }) {
  const layout = useLayout()
  return jsxs('div', {
    className: cn(
      'grid min-w-0 py-2',
      layout === 'narrow' ? 'gap-1' : 'gap-4'
    ),
    style: { gridTemplateColumns: layout === 'narrow' ? 'minmax(0, 1fr)' : 'minmax(7rem, 0.8fr) minmax(0, 1.6fr)' },
    children: [
      jsx('dt', {
        className: 'text-xs text-(--ui-text-secondary)',
        children: uiLabel(label)
      }),
      jsx('dd', {
        className: cn(
          'min-w-0 break-words text-xs text-foreground',

          mono && 'font-mono text-[11px]',
          accent && 'text-primary'
        ),
        title: text(value),
        style: { overflowWrap: 'anywhere' },
        children: text(value)
      })
    ]
  })
}

function Diagnostics({ errors }) {
  if (!errors?.length) {
    return jsx(StateLine, { tone: 'good', title: 'ALL_READS_HEALTHY', children: 'Every requested Honcho metric responded.' })
  }
  return jsx('ul', {
    className: 'space-y-2',
    children: errors.map((error, index) =>
      jsxs('li', {
        className: 'py-2',
        children: [
          jsx('div', {
            className: 'font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground',
            children: text(error.scope, 'metric')
          }),
          jsx('div', { className: 'mt-1 break-words text-xs text-foreground', children: text(error.message) })
        ]
      }, `${error.scope}-${index}`)
    )
  })
}

function TabRail() {
  const active = useValue($activeTab)
  const layout = useLayout()
  if (layout !== 'wide') {
    return jsxs('div', {
      className: 'min-w-0',
      children: [
        jsx('div', {
          className: 'sr-only',
          children: 'Memory section'
        }),
        jsxs(Select, {
          value: active,
          onValueChange: next => $activeTab.set(next),
          children: [
            jsx(SelectTrigger, {
              'aria-label': 'Honcho memory section',
              className: 'w-full',
              children: jsx(SelectValue, {})
            }),
            jsx(SelectContent, {
              children: TABS.map(tab => jsx(SelectItem, { value: tab, children: uiLabel(tab) }, tab))
            })
          ]
        })
      ]
    })
  }
  return jsx(Tabs, {
    value: active,
    onValueChange: next => $activeTab.set(next),
    children: jsx(TabsList, {
      'aria-label': 'Honcho memory sections',
      className: 'w-fit',
      children: TABS.map(tab => jsx(TabsTrigger, {
        value: tab,
        id: `honcho-tab-${tab.toLowerCase()}`,
        'aria-controls': 'honcho-section',
        children: uiLabel(tab)
      }, tab))
    })
  })
}

function PageHeader({ query }) {
  const tone = stateTone(query.data, query.isError)
  const layout = useLayout()
  const canUpload = Boolean(query.data?.ok && query.data?.chat?.found && !query.routeMismatch)
  return jsxs('header', {
    className: cn('flex items-start justify-between gap-3', layout !== 'wide' && 'flex-col'),
    children: [
      jsxs('div', {
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2',
            children: [
              jsx('h1', {
                className: 'text-sm font-semibold text-foreground',
                children: 'Honcho memory'
              }),
              jsxs(Badge, {
                variant: tone === 'bad' ? 'destructive' : tone === 'warn' ? 'warn' : 'muted',
                children: [jsx(StatusDot, { tone }), query.isError ? 'Unavailable' : query.data?.ok ? 'Live' : uiLabel(text(query.data?.state, 'CHECKING').toUpperCase())]
              })
            ]
          }),
          jsx('p', {
            className: 'mt-1 text-xs text-muted-foreground',
            children: layout === 'narrow'
              ? 'Focused conversation memory and recall'
              : 'Focused-conversation memory, provenance, recall, and reasoning status'
          })
        ]
      }),
      jsxs('div', {
        className: cn('flex items-center gap-2', layout === 'narrow' && 'grid w-full grid-cols-2'),
        children: [
          jsx(ActionButton, {
            icon: 'cloud-upload',
            variant: 'default',
            className: layout === 'narrow' ? 'justify-center' : null,
            disabled: !canUpload,
            onClick: () => $uploadOrigin.set({ origin: 'page', fingerprint: query.fingerprint }),
            children: 'ADD_TO_SESSION'
          }),
          jsx(ActionButton, {
            icon: 'refresh',
            className: layout === 'narrow' ? 'justify-center' : null,
            disabled: query.isFetching || query.routeMismatch,
            onClick: () => query.refetch(),
            children: query.isFetching ? 'REFRESHING…' : 'REFRESH'
          })
        ]
      })
    ]
  })
}

function OverviewTab() {
  const layout = useLayout()
  const query = useHonchoSnapshot()
  const data = query.data
  const config = data?.config
  const chat = data?.chat
  const workspaceQueue = data?.queue
  const tone = stateTone(data, query.isError)

  return jsx(QueryState, {
    query,
    title: 'OVERVIEW',
    children: data
      ? jsxs('div', {
          className: 'space-y-3',
          children: [
            jsx(StateLine, {
              tone,
              title: data.ok
                ? `Connected to ${text(config?.workspace_id, 'workspace')}`
                : text(data.state, 'NEEDS_ATTENTION').toUpperCase(),
              children: data.ok
                ? `${text(config?.endpoint)} responded in ${number(data.latency_ms)} ms. Aggregate status refreshes every 10 seconds.`
                : data.errors?.[0]?.message || 'Check this profile’s Honcho configuration.'
            }),
            jsx(MetricStrip, {
              children: [
                jsx(MetricCell, {
                  label: 'SESSION_MESSAGES',
                  value: number(chat?.messages),
                  detail: text(chat?.honcho_session_id, 'No mapped session'),
                  accent: true
                }),
                jsx(MetricCell, {
                  label: 'CONCLUSIONS',
                  value: number(data?.totals?.conclusions),
                  detail: `${text(config?.ai_peer, 'observer')} → ${text(config?.user_peer, 'user')}`
                }),
                jsx(MetricCell, {
                  label: 'ATTACHED_PEERS',
                  value: number(chat?.peers?.length),
                  detail: chat?.peers?.join(', ') || 'No attached peers'
                }),
                jsx(MetricCell, {
                  label: 'SESSION_QUEUE',
                  value: queueLabel(chat?.queue),
                  detail: chat?.queue ? `${number(chat.queue.completed)} / ${number(chat.queue.total)} complete` : null
                })
              ]
            }),
            jsxs('div', {
              className: 'grid grid-cols-1 gap-6',
              style: layout === 'wide' ? { gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)' } : undefined,
              children: [
                jsx(ConsolePanel, {
                  title: 'FOCUSED_SESSION',
                  tone,
                  children: jsx('dl', {
                    children: [
                      jsx(DetailRow, { label: 'LOCAL_STATE', value: localState(query) }),
                      jsx(DetailRow, { label: 'HERMES_SESSION', value: chat?.hermes_session_id || 'NEW_DRAFT', mono: true }),
                      jsx(DetailRow, { label: 'HONCHO_SESSION', value: chat?.honcho_session_id, mono: true, accent: true }),
                      jsx(DetailRow, { label: 'MAPPING_STRATEGY', value: config?.session_strategy }),
                      jsx(DetailRow, { label: 'MAPPING_SOURCE', value: chat?.mapping_source }),
                      jsx(DetailRow, { label: 'FOUND_IN_HONCHO', value: chat?.found === true ? 'YES' : chat?.found === false ? 'NOT_YET' : 'NOT_CHECKED' }),
                      jsx(DetailRow, { label: 'LATEST_ACTIVITY', value: chat?.latest_message_at ? `${formatTime(chat.latest_message_at)} · ${text(chat.latest_peer_id)}` : null }),
                      jsx(DetailRow, { label: 'WORKING_DIRECTORY', value: chat?.cwd, mono: true })
                    ]
                  })
                }),
                jsxs('div', {
                  className: 'space-y-3',
                  children: [
                    jsx(ConsolePanel, {
                      title: 'PROFILE_CONFIGURATION',
                      children: jsx('dl', {
                        children: [
                          jsx(DetailRow, { label: 'PROFILE', value: data.profile }),
                          jsx(DetailRow, { label: 'WORKSPACE', value: config?.workspace_id, mono: true, accent: true }),
                          jsx(DetailRow, { label: 'RECALL_MODE', value: config?.recall_mode }),
                          jsx(DetailRow, { label: 'WRITE_FREQUENCY', value: config?.write_frequency }),
                          jsx(DetailRow, { label: 'SAVE_MESSAGES', value: config?.save_messages ? 'ENABLED' : 'DISABLED' }),
                          jsx(DetailRow, { label: 'WORKSPACE_QUEUE', value: queueLabel(workspaceQueue) })
                        ]
                      })
                    }),
                    jsx(ConsolePanel, {
                      title: 'DIAGNOSTICS',
                      tone: data.errors?.length ? 'warn' : 'good',
                      children: jsx(Diagnostics, { errors: data.errors })
                    })
                  ]
                })
              ]
            })
          ]
        })
      : null
  })
}

function Pager({ page, pages, isFetching, onPage }) {
  if (!pages || pages <= 1) return null
  return jsxs('div', {
    className: 'flex items-center justify-between border-t border-border/60 px-3 py-2',
    children: [
      jsx(ActionButton, {
        icon: 'chevron-left',
        disabled: page <= 1 || isFetching,
        onClick: () => onPage(Math.max(1, page - 1)),
        children: 'PREV'
      }),
      jsx('span', {
        className: 'font-mono text-[10px] tabular-nums text-muted-foreground',
        children: `PAGE ${number(page)} / ${number(pages)}`
      }),
      jsx(ActionButton, {
        icon: 'chevron-right',
        disabled: page >= pages || isFetching,
        onClick: () => onPage(Math.min(pages, page + 1)),
        children: 'NEXT'
      })
    ]
  })
}

function MessageRow({ message, rank }) {
  const preview = compact(message.content, 240)
  return jsx('details', {
    className: 'group border-b border-(--ui-stroke-tertiary) last:border-0',
    children: [
      jsxs('summary', {
        className: 'cursor-pointer list-none py-3 outline-none focus-visible:bg-muted/30 [&::-webkit-details-marker]:hidden',
        children: [
          jsxs('div', {
            className: 'flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground',
            children: [
              rank ? jsx('span', { className: 'tabular-nums', children: `#${String(rank).padStart(2, '0')}` }) : null,
              jsx('span', { className: 'text-primary', children: text(message.peer_id) }),
              jsx('span', { children: formatTime(message.created_at) }),
              message.token_count !== null && message.token_count !== undefined
                ? jsx('span', { className: 'tabular-nums', children: `${number(message.token_count)} TOK` })
                : null,
              jsx(Codicon, { name: 'chevron-down', size: '0.7rem', className: 'ml-auto transition-transform group-open:rotate-180' })
            ]
          }),
          jsx('p', {
            className: 'mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-foreground',
            style: { maxWidth: '72ch', overflowWrap: 'anywhere' },
            children: preview || 'Empty message'
          })
        ]
      }),
      jsxs('div', {
        className: 'pb-3',
        children: [
          jsx('p', { className: 'whitespace-pre-wrap text-xs leading-5 text-foreground', style: { maxWidth: '72ch', overflowWrap: 'anywhere' }, children: text(message.content) }),
          jsxs('details', {
            className: 'mt-3',
            children: [
              jsx('summary', {
                className: 'cursor-pointer px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted-foreground outline-none focus-visible:text-foreground',
                children: 'Message metadata'
              }),
              jsx('pre', {
                className: 'max-h-48 overflow-auto border-t border-border/50 p-2 font-mono text-[10px] leading-4 text-muted-foreground',
                children: JSON.stringify(message.metadata || {}, null, 2)
              })
            ]
          })
        ]
      })
    ]
  })
}

function MessagesTab() {
  const [page, setPage] = useState(1)
  const query = useHonchoEndpoint('/messages', [page, PAGE_SIZE], { page, size: PAGE_SIZE })
  useEffect(() => setPage(1), [query.fingerprint])
  const data = query.data

  return jsx(QueryState, {
    query,
    title: 'MESSAGES',
    children: data
      ? jsx(ConsolePanel, {
          title: 'MESSAGE_STREAM',
          tone: data.ok ? 'good' : 'warn',
          bodyClassName: 'p-0',
          actions: jsx('span', {
            className: 'font-mono text-[10px] tabular-nums text-muted-foreground',
            children: `${number(data.total, '0')} SAVED`
          }),
          children: data.items?.length
            ? jsxs('div', {
                children: [
                  jsx('div', { children: data.items.map(item => jsx(MessageRow, { message: item }, item.id)) }),
                  jsx(Pager, { page: data.page, pages: data.pages, isFetching: query.isFetching, onPage: setPage })
                ]
              })
            : jsx(EmptyReadout, {
                title: data.state === 'session_missing' ? 'SESSION_NOT_SAVED' : 'NO_MESSAGES',
                description: data.errors?.[0]?.message || 'The resolved Honcho session contains no saved messages yet.'
              })
        })
      : null
  })
}

function ScopeToggle({ value, options, onChange, label }) {
  const layout = useLayout()
  return jsx('div', {
    role: 'group',
    'aria-label': label,
    className: 'min-w-0',
    children: layout === 'narrow'
      ? jsxs(Select, {
          value,
          onValueChange: onChange,
          children: [
            jsx(SelectTrigger, { 'aria-label': label, className: 'w-full', children: jsx(SelectValue, {}) }),
            jsx(SelectContent, { children: options.map(option => jsx(SelectItem, { value: option.id, children: uiLabel(option.label) }, option.id)) })
          ]
        })
      : jsx(SegmentedControl, { value, onChange, options: options.map(option => ({ ...option, label: uiLabel(option.label) })) })
  })
}

function ConclusionRow({ conclusion }) {
  return jsxs('article', {
    className: 'border-b border-(--ui-stroke-tertiary) py-3 last:border-0',
    children: [
      jsxs('div', {
        className: 'flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.05em] text-muted-foreground',
        children: [
          jsx('span', { className: 'text-primary', children: conclusion.observer_id }),
          jsx(Codicon, { name: 'chevron-right', size: '0.65rem' }),
          jsx('span', { className: 'text-foreground', children: conclusion.observed_id }),
          jsx(Badge, {
            variant: 'muted',
            children: text(conclusion.level, 'unknown')
          }),
          conclusion.belongs_to_current_session
            ? jsx(Badge, { variant: 'default', children: 'Current session' })
            : jsx(Badge, { variant: 'muted', children: 'Peer-wide' }),
          Number.isInteger(conclusion.times_derived)
            ? jsx('span', { children: `${number(conclusion.times_derived)} derivations` })
            : null,
          jsx('span', { className: 'ml-auto tabular-nums', children: formatTime(conclusion.created_at) })
        ]
      }),
      jsx('p', { className: 'mt-2 whitespace-pre-wrap text-xs leading-5 text-foreground', style: { maxWidth: '72ch', overflowWrap: 'anywhere' }, children: conclusion.content }),
      conclusion.source_session_id
        ? jsx('div', {
            className: 'mt-2 truncate font-mono text-[10px] text-muted-foreground',
            title: conclusion.source_session_id,
            children: `source_session: ${conclusion.source_session_id}`
          })
        : null,
      conclusion.source_ids?.length
        ? jsxs('details', {
            className: 'mt-2 font-mono text-[10px] text-muted-foreground',
            children: [
              jsx('summary', {
                className: 'cursor-pointer outline-none hover:text-foreground focus-visible:ring-1 focus-visible:ring-primary',
                children: `Parent conclusions (${number(conclusion.source_ids.length)}${conclusion.source_ids_truncated ? '+' : ''})`
              }),
              jsx('ul', {
                className: 'mt-2 space-y-1',
                children: conclusion.source_ids.map((id, index) => jsx('li', { className: 'break-all', children: id }, `${id}-${index}`))
              })
            ]
          })
        : null
    ]
  })
}

function ConclusionsTab() {
  const [scope, setScope] = useState('current')
  const [page, setPage] = useState(1)
  const query = useHonchoEndpoint('/conclusions', [scope, page, PAGE_SIZE], { scope, page, size: PAGE_SIZE })
  useEffect(() => setPage(1), [query.fingerprint, scope])
  const data = query.data

  return jsxs('div', {
    className: 'space-y-3',
    children: [
      jsxs('div', {
        className: 'flex flex-wrap items-end justify-between gap-3',
        children: [
          jsxs('div', {
            children: [
              jsx('div', { className: 'mb-1 text-xs text-(--ui-text-secondary)', children: 'Memory scope' }),
              jsx(ScopeToggle, {
                value: scope,
                label: 'Conclusion scope',
                onChange: setScope,
                options: [
                  { id: 'current', label: 'CURRENT_SESSION' },
                  { id: 'all', label: 'ALL_RELEVANT' }
                ]
              })
            ]
          }),
          jsx(ActionButton, {
            icon: 'refresh',
            disabled: query.isFetching || query.routeMismatch,
            onClick: () => query.refetch(),
            children: query.isFetching ? 'REFRESHING…' : 'REFRESH'
          })
        ]
      }),
      jsx(QueryState, {
        query,
        title: 'CONCLUSIONS',
        children: data
          ? jsx(ConsolePanel, {
              title: scope === 'current' ? 'CURRENT_SESSION_CONCLUSIONS' : 'ALL_RELEVANT_CONCLUSIONS',
              tone: data.ok ? 'good' : 'warn',
              bodyClassName: 'p-0',
              actions: jsx('span', {
                className: 'font-mono text-[10px] tabular-nums text-muted-foreground',
                children: `${number(data.total, '0')} TOTAL`
              }),
              children: data.items?.length
                ? jsxs('div', {
                    children: [
                      jsx('div', { children: data.items.map(item => jsx(ConclusionRow, { conclusion: item }, item.id)) }),
                      jsx(Pager, { page: data.page, pages: data.pages, isFetching: query.isFetching, onPage: setPage })
                    ]
                  })
                : jsx(EmptyReadout, {
                    title: data.state === 'peer_unavailable' ? 'PEER_UNAVAILABLE' : 'NO_CONCLUSIONS',
                    description: data.errors?.[0]?.message || 'Honcho has not stored conclusions for this observer relationship.'
                  })
            })
          : null
      })
    ]
  })
}

function LayerRow({ label, available, detail, tone = 'muted' }) {
  return jsxs('div', {
    className: 'py-2',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          jsx(StatusDot, { tone: available ? tone : 'muted' }),
          jsx('span', { className: 'text-xs font-medium text-foreground', children: uiLabel(label) }),
          jsx('span', {
            className: 'ml-auto text-xs text-(--ui-text-secondary)',
            children: available ? 'Available' : 'Empty'
          })
        ]
      }),
      jsx('p', { className: 'mt-1 text-xs leading-5 text-(--ui-text-secondary)', children: detail })
    ]
  })
}

function contextMessageDetail(session) {
  const count = `${number(session?.messages?.length, '0')} context messages`
  return session?.token_count === null || session?.token_count === undefined
    ? `${count} · token total unavailable`
    : `${count} · ${number(session.token_count)} server-reported tokens`
}

function ContextTab() {
  const layout = useLayout()
  const [draftBudget, setDraftBudget] = useState(2048)
  const [budget, setBudget] = useState(2048)
  const query = useHonchoEndpoint('/context', [budget], { token_budget: budget })
  const data = query.data
  const session = data?.session

  return jsxs('div', {
    className: 'space-y-3',
    children: [
      jsxs('div', {
        className: 'flex flex-wrap items-end gap-2',
        children: [
          jsxs('label', {
            className: 'min-w-40',
            children: [
              jsx('span', { className: 'mb-1 block text-xs text-(--ui-text-secondary)', children: 'Token budget' }),
              jsx(Input, {
                type: 'number',
                min: 256,
                max: 32000,
                step: 256,
                value: draftBudget,
                onChange: event => setDraftBudget(Math.max(256, Math.min(32000, Number(event.target.value) || 256))),
                className: 'font-mono tabular-nums'
              })
            ]
          }),
          jsx(ActionButton, {
            icon: 'sparkle',
            onClick: () => setBudget(draftBudget),
            disabled: query.isFetching || query.routeMismatch,
            children: query.isFetching ? 'GENERATING…' : 'GENERATE_CONTEXT'
          }),
          data?.copy_text
            ? jsx(CopyButton, {
                appearance: 'button',
                buttonSize: 'default',
                buttonVariant: 'secondary',
                text: data.copy_text,
                label: 'Copy context',
                showLabel: true
              })
            : null
        ]
      }),
      jsx(QueryState, {
        query,
        title: 'CONTEXT',
        children: data
          ? jsxs('div', {
              className: 'grid grid-cols-1 gap-3',
              style: layout === 'wide' ? { gridTemplateColumns: 'minmax(0, 5fr) minmax(0, 7fr)' } : undefined,
              children: [
                jsx(ConsolePanel, {
                  title: 'CONTEXT_LAYERS',
                  tone: data.ok ? 'good' : 'warn',
                  children: jsxs('div', {
                    className: 'space-y-2',
                    children: [
                      jsx(LayerRow, { label: 'PEER_CARD', available: data.layers?.peer_card, detail: `${number(data.peer_card?.length, '0')} workspace-wide facts`, tone: 'good' }),
                      jsx(LayerRow, { label: 'CONCLUSIONS', available: data.layers?.conclusions, detail: data.session_representation ? `${number(data.session_representation.length)} characters in current-session representation` : 'No current-session representation exposed', tone: 'good' }),
                      jsx(LayerRow, { label: 'SUMMARIES', available: data.layers?.summaries, detail: session?.summary ? `${number(session.summary.length)} characters in session summary` : 'No session summary exposed', tone: 'good' }),
                      jsx(LayerRow, { label: 'MESSAGES', available: data.layers?.messages, detail: contextMessageDetail(session), tone: 'good' }),
                      jsxs('div', {
                        className: 'border-t border-border/60 pt-2 font-mono text-[10px] text-muted-foreground',
                        children: [
                          `${number(data.character_count, '0')} CHAR · ~${number(data.token_estimate, '0')} TOK · BUDGET ${number(data.token_budget)}`,
                          jsx('p', { className: 'mt-1 font-sans text-[11px] leading-4', children: data.scope_explanation })
                        ]
                      })
                    ]
                  })
                }),
                jsx(ConsolePanel, {
                  title: 'CONTEXT_PREVIEW',
                  tone: data.ok ? 'good' : 'warn',
                  bodyClassName: 'p-0',
                  children: data.copy_text
                    ? jsx('pre', {
                        className: 'overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-foreground',
                        style: { maxHeight: 620, maxWidth: '72ch', overflowWrap: 'anywhere' },
                        children: data.copy_text
                      })
                    : jsx(EmptyReadout, {
                        title: data.state === 'peer_unavailable' ? 'TARGET_UNAVAILABLE' : 'EMPTY_CONTEXT',
                        description: data.errors?.[0]?.message || 'Honcho returned no session context for the configured target peer.'
                      })
                })
              ]
            })
          : null
      })
    ]
  })
}

function SearchTab() {
  const layout = useLayout()
  const focus = useFocusScope()
  const [queryText, setQueryText] = useState('')
  const [scope, setScope] = useState('session')
  const [scopeId, setScopeId] = useState('')
  const [limit, setLimit] = useState(20)
  const [run, setRun] = useState(null)
  const scopesQuery = useHonchoEndpoint(
    '/scopes',
    [1, 100],
    { page: 1, size: 100 },
    { retry: 0, staleTime: 60_000 }
  )
  const scopeSearchAvailable = Boolean(scopesQuery.data?.capabilities?.scope_search)
  const honchoScopes = scopeSearchAvailable && scopesQuery.data?.ok ? (scopesQuery.data.items || []) : []
  const scopeOptions = [
    { id: 'session', label: 'CURRENT_SESSION' },
    { id: 'peer', label: 'USER_PEER' },
    { id: 'workspace', label: 'WORKSPACE' },
    ...(honchoScopes.length ? [{ id: 'honcho', label: 'HONCHO_SCOPE' }] : [])
  ]
  const currentRun = run?.fingerprint === focus.fingerprint ? run : null
  const query = useEndpointForFocus(
    focus,
    '/search',
    currentRun ? [currentRun.scope, currentRun.scopeId || null, currentRun.query, currentRun.limit] : ['idle'],
    currentRun
      ? { scope: currentRun.scope, scope_id: currentRun.scopeId || null, query: currentRun.query, limit: currentRun.limit }
      : { scope, scope_id: scopeId || null, query: 'not-submitted', limit },
    { enabled: Boolean(currentRun), retry: 0, staleTime: 60_000 }
  )

  useEffect(() => {
    if (run && run.fingerprint !== focus.fingerprint) setRun(null)
  }, [focus.fingerprint, run])

  useEffect(() => {
    if (scope === 'honcho' && !honchoScopes.some(item => item.id === scopeId)) {
      setScopeId(honchoScopes[0]?.id || '')
      setRun(null)
    }
    if (scope === 'honcho' && honchoScopes.length === 0) {
      setScope('session')
      setScopeId('')
      setRun(null)
    }
  }, [honchoScopes, scope, scopeId])

  function submit(event) {
    event.preventDefault()
    if (event.type === 'submit' && event.nativeEvent.submitter?.name !== 'honcho-search') return
    const cleaned = queryText.trim()
    if (!cleaned || focus.routeMismatch || query.isFetching || (scope === 'honcho' && !scopeId)) return
    setRun({ fingerprint: focus.fingerprint, query: cleaned, scope, scopeId, limit })
  }

  return jsxs('div', {
    className: 'space-y-3',
    children: [
      jsx(ConsolePanel, {
        title: 'NATIVE_SEARCH',
        tone: query.isFetching ? 'warn' : 'good',
        children: jsx('form', {
          onSubmit: submit,
          // SearchField owns a clear button. Avoid implicit Enter submission
          // activating that button instead of the explicit search action.
          onKeyDown: event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.target.matches('input[type="text"]')) submit(event)
          },
          className: 'space-y-3',
          children: [
            jsxs('div', {
              className: cn('flex gap-2', layout === 'narrow' && 'flex-col'),
              children: [
                jsx(SearchField, {
                  value: queryText,
                  onChange: setQueryText,
                  placeholder: 'Search Honcho memory…',
                  'aria-label': 'Search Honcho memory',
                  loading: query.isFetching,
                  containerClassName: 'flex-1',
                  inputClassName: 'w-full'
                }),
                jsx(ActionButton, {
                  type: 'submit',
                  name: 'honcho-search',
                  icon: 'search',
                  variant: 'default',
                  disabled: !queryText.trim() || focus.routeMismatch || query.isFetching || (scope === 'honcho' && !scopeId),
                  children: query.isFetching ? 'SEARCHING…' : 'SEARCH'
                })
              ]
            }),
            jsxs('div', {
              className: 'flex flex-wrap items-end gap-3',
              children: [
                jsxs('div', {
                  children: [
                    jsx('div', { className: 'mb-1 text-xs text-(--ui-text-secondary)', children: 'Search scope' }),
                    jsx(ScopeToggle, {
                      value: scope,
                      label: 'Search scope',
                      onChange: next => {
                        setScope(next)
                        setRun(null)
                      },
                      options: scopeOptions
                    })
                  ]
                }),
                scope === 'honcho'
                  ? jsxs('label', {
                      className: 'min-w-48 flex-1',
                      children: [
                        jsx('span', {
                          className: 'mb-1 block text-xs text-(--ui-text-secondary)',
                          children: 'Existing Honcho scope'
                        }),
                        jsxs(Select, {
                          value: scopeId,
                          onValueChange: next => {
                            setScopeId(next)
                            setRun(null)
                          },
                          children: [
                            jsx(SelectTrigger, {
                              className: 'w-full',
                              children: jsx(SelectValue, { placeholder: 'Select a scope' })
                            }),
                            jsx(SelectContent, {
                              children: honchoScopes.map(item =>
                                jsx(SelectItem, {
                                  value: item.id,
                                  children: text(item.id)
                                }, item.id)
                              )
                            })
                          ]
                        })
                      ]
                    })
                  : null,
                jsxs('label', {
                  children: [
                    jsx('span', { className: 'mb-1 block text-xs text-(--ui-text-secondary)', children: 'Max results' }),
                    jsx(Input, {
                      type: 'number',
                      min: 1,
                      max: 100,
                      value: limit,
                      onChange: event => setLimit(Math.max(1, Math.min(100, Number(event.target.value) || 1))),
                      className: 'w-24 font-mono tabular-nums'
                    })
                  ]
                })
              ]
            }),
            jsx('p', {
              className: 'text-xs leading-5 text-(--ui-text-secondary)',
              children: 'Search is submitted explicitly and preserves Honcho relevance ordering. Results never poll or carry into another focused chat.'
            })
          ]
        })
      }),
      !currentRun
        ? jsx(ConsolePanel, {
            title: 'SEARCH_READY',
            tone: 'muted',
            children: jsx(EmptyReadout, {
              title: 'ENTER_A_QUERY',
              description: 'Search this session by default, or widen the scope to the configured user peer or active workspace.'
            })
          })
        : jsx(QueryState, {
            query,
            title: 'SEARCH_RESULTS',
            children: query.data
              ? jsx(ConsolePanel, {
                  title: 'SEARCH_RESULTS',
                  tone: query.data.ok ? 'good' : 'warn',
                  bodyClassName: 'p-0',
                  actions: jsx('span', {
                    className: 'font-mono text-[10px] text-muted-foreground',
                    children: `${number(query.data.items?.length, '0')} MATCHES`
                  }),
                  children: query.data.items?.length
                    ? jsx('div', {
                        children: query.data.items.map(item =>
                          jsx(MessageRow, { message: item, rank: item.rank }, item.id)
                        )
                      })
                    : jsx(EmptyReadout, {
                        title: query.data.ok ? 'NO_MATCHES' : 'SEARCH_UNAVAILABLE',
                        description: query.data.errors?.[0]?.message || `No Honcho messages matched “${currentRun.query}”.`
                      })
                })
              : null
          })
    ]
  })
}

function QueueStrip({ queue }) {
  return jsx(MetricStrip, {
    columns: 4,
    children: [
      jsx(MetricCell, { label: 'PENDING', value: number(queue?.pending, '—') }),
      jsx(MetricCell, { label: 'IN_PROGRESS', value: number(queue?.in_progress, '—'), accent: true }),
      jsx(MetricCell, { label: 'COMPLETED', value: number(queue?.completed, '—') }),
      jsx(MetricCell, { label: 'TOTAL', value: number(queue?.total, '—') })
    ]
  })
}

function ActivityTab() {
  const layout = useLayout()
  const query = useHonchoEndpoint('/activity', [], {}, { poll: true, staleTime: 5_000 })
  const data = query.data
  const hasDetailCapabilities = Boolean(
    data?.capabilities?.failed_task_detail || data?.capabilities?.recent_task_detail
  )

  return jsx(QueryState, {
    query,
    title: 'ACTIVITY',
    children: data
      ? jsxs('div', {
          className: 'space-y-3',
          children: [
            jsx(StateLine, {
              tone: data.ok ? (data.session_queue?.pending || data.session_queue?.in_progress ? 'warn' : 'good') : 'warn',
              title: data.session_queue ? queueLabel(data.session_queue) : text(data.state, 'UNAVAILABLE').toUpperCase(),
              children: `Hermes local state: ${localState(query)}. Honcho background reasoning is reported separately below.`
            }),
            jsxs('div', {
              className: 'grid grid-cols-1 gap-3',
              style: layout === 'wide' ? { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' } : undefined,
              children: [
                jsx(ConsolePanel, {
                  title: 'CURRENT_SESSION_QUEUE',
                  tone: data.session_queue?.pending || data.session_queue?.in_progress ? 'warn' : 'good',
                  children: jsx(QueueStrip, { queue: data.session_queue })
                }),
                jsx(ConsolePanel, {
                  title: 'WORKSPACE_QUEUE',
                  tone: data.workspace_queue?.pending || data.workspace_queue?.in_progress ? 'warn' : 'good',
                  children: jsx(QueueStrip, { queue: data.workspace_queue })
                })
              ]
            }),
            jsx(StateLine, {
              tone: hasDetailCapabilities ? 'good' : 'muted',
              title: hasDetailCapabilities ? 'TASK_DETAIL_AVAILABLE' : 'AGGREGATE_QUEUE_ONLY',
              children: jsxs('span', {
                children: [
                  data.capability_note,
                  ` Honcho AI ${text(data.sdk_version)} · data as of ${formatTime(data.stale_at)}.`
                ]
              })
            })
          ]
        })
      : null
  })
}

function ActiveTab() {
  const active = useValue($activeTab)
  if (active === 'MESSAGES') return jsx(MessagesTab, {})
  if (active === 'CONCLUSIONS') return jsx(ConclusionsTab, {})
  if (active === 'CONTEXT') return jsx(ContextTab, {})
  if (active === 'SEARCH') return jsx(SearchTab, {})
  if (active === 'ACTIVITY') return jsx(ActivityTab, {})
  return jsx(OverviewTab, {})
}

function HonchoPage() {
  const snapshot = useHonchoSnapshot()
  const active = useValue($activeTab)
  return jsx('main', {
    className: 'h-full overflow-y-auto',
    children: jsx(ResponsiveSurface, {
      // Runtime plugins have no Tailwind build. Keep container geometry explicit.
      className: 'min-h-full font-sans',
      style: { padding: '20px clamp(20px, 4%, 64px)' },
      children: jsxs('div', {
        className: 'flex flex-col gap-4',
        children: [
          jsx(PageHeader, { query: snapshot }),
          jsx(LineageStrip, { focus: snapshot, snapshot }),
          jsx(TabRail, {}),
          jsx('section', {
            id: 'honcho-section',
            'aria-label': uiLabel(active),
            children: jsx(ActiveTab, {})
          }),
          jsx(AddToSessionDialog, { origin: 'page', snapshot })
        ]
      })
    })
  })
}

function PaneSection({ title, children }) {
  return jsxs('section', {
    className: 'border-t border-(--ui-stroke-tertiary) first:border-t-0',
    children: [
      jsx('div', {
        className: 'px-3 py-2 text-xs font-medium text-foreground',
        children: uiLabel(title)
      }),
      jsx('div', { className: 'px-3 pb-3', children })
    ]
  })
}

function HonchoMemoryPaneContent() {
  const paneVisible = useValue(host.paneVisibility(`${PLUGIN_ID}:memory`))
  const snapshot = useHonchoSnapshot({ enabled: paneVisible })
  const context = useHonchoEndpoint('/context', [2048], { token_budget: 2048 }, { enabled: paneVisible, staleTime: 60_000 })
  const data = snapshot.data
  const chat = data?.chat
  const tone = stateTone(data, snapshot.isError)

  if (snapshot.routeMismatch) {
    return jsx('div', {
      className: 'h-full overflow-y-auto p-3',
      children: jsx(StateLine, {
        tone: 'warn',
        title: 'ROUTING_BLOCKED',
        children: 'The focused chat belongs to another profile or connection. No Honcho request was sent.'
      })
    })
  }

  if (snapshot.isLoading) {
    return jsx('div', {
      className: 'space-y-2 p-3',
      children: [0, 1, 2, 3, 4].map(index => jsx(Skeleton, { className: 'h-10 rounded-none' }, index))
    })
  }

  if (snapshot.isError || !data) {
    return jsx('div', {
      className: 'p-3',
      children: [
        jsx(StateLine, {
        tone: 'bad',
        title: 'MEMORY_UNAVAILABLE',
        children: jsxs('div', {
          children: [
            jsx('p', { children: snapshot.error instanceof Error ? snapshot.error.message : 'The Honcho plugin API could not be reached.' }),
            jsx(ActionButton, { icon: 'refresh', className: 'mt-2', onClick: () => snapshot.refetch(), children: 'TRY_AGAIN' })
          ]
        })
        })
      ]
    })
  }

  return jsxs('div', {
    className: 'h-full overflow-y-auto text-xs',
    children: [
      jsxs('div', {
        className: 'flex items-center justify-between border-b border-border/70 px-3 py-2',
        children: [
          jsxs('div', {
            className: 'flex items-center gap-2 text-xs font-medium',
            children: [jsx(StatusDot, { tone }), data.ok ? 'Focused memory' : uiLabel(text(data.state, 'CHECKING').toUpperCase())]
          }),
          jsx(ActionButton, {
            icon: 'refresh',
            size: 'icon-xs',
            variant: 'ghost',
            'aria-label': 'Refresh Honcho memory',
            disabled: snapshot.isFetching || context.isFetching,
            onClick: () => {
              snapshot.refetch()
              context.refetch()
            },
            children: null
          })
        ]
      }),
      jsx(PaneSection, {
        title: 'SESSION',
        children: jsxs('div', {
          className: 'space-y-2',
          children: [
            jsx(LineageStrip, { focus: snapshot, snapshot }),
            jsx('dl', {
              children: [
                jsx(DetailRow, { label: 'STRATEGY', value: data.config?.session_strategy }),
                jsx(DetailRow, { label: 'MESSAGES', value: number(chat?.messages) }),
                jsx(DetailRow, { label: 'CONCLUSIONS', value: number(data.totals?.conclusions) }),
                jsx(DetailRow, { label: 'PEERS', value: chat?.peers?.join(', ') || null, mono: true }),
                jsx(DetailRow, { label: 'QUEUE', value: queueLabel(chat?.queue) }),
                jsx(DetailRow, { label: 'LATEST', value: formatTime(chat?.latest_message_at) })
              ]
            })
          ]
        })
      }),
      jsx(PaneSection, {
        title: 'RECALL_PREVIEW',
        children: context.isLoading
          ? jsxs('div', { className: 'space-y-2', children: [jsx(Skeleton, { className: 'h-3 rounded-none' }), jsx(Skeleton, { className: 'h-3 rounded-none' }), jsx(Skeleton, { className: 'h-3 w-3/4 rounded-none' })] })
          : context.data?.preview
            ? jsxs('div', {
                children: [
                  jsx('p', { className: 'line-clamp-6 whitespace-pre-wrap text-xs leading-5 text-foreground', children: compact(context.data.preview, 640) }),
                  jsxs('div', {
                    className: 'mt-2 flex flex-wrap items-center gap-1 font-mono text-[10px] text-muted-foreground',
                    children: [
                      context.data.layers?.peer_card ? jsx('span', { className: 'border border-border/70 px-1 py-0.5', children: 'CARD' }) : null,
                      context.data.layers?.conclusions ? jsx('span', { className: 'border border-border/70 px-1 py-0.5', children: 'CONCLUSIONS' }) : null,
                      context.data.layers?.summaries ? jsx('span', { className: 'border border-border/70 px-1 py-0.5', children: 'SUMMARY' }) : null,
                      context.data.layers?.messages ? jsx('span', { className: 'border border-border/70 px-1 py-0.5', children: 'MESSAGES' }) : null
                    ]
                  })
                ]
              })
            : jsx('p', { className: 'text-xs leading-5 text-muted-foreground', children: context.data?.errors?.[0]?.message || 'No representation or context is available yet.' })
      }),
      jsx(PaneSection, {
        title: 'ACTIONS',
        children: jsxs('div', {
          className: 'grid grid-cols-1 gap-1.5',
          children: [
            jsx(ActionButton, {
              icon: 'cloud-upload',
              variant: 'default',
              className: 'justify-start',
              disabled: !data.ok || !chat?.found,
              onClick: () => $uploadOrigin.set({ origin: 'pane', fingerprint: snapshot.fingerprint }),
              children: 'ADD_TO_SESSION'
            }),
            jsx(ActionButton, {
              icon: 'open-preview',
              className: 'justify-start',
              onClick: () => {
                $activeTab.set('OVERVIEW')
                host.navigate(ROUTE)
              },
              children: 'OPEN_FULL_COCKPIT'
            }),
            jsx(ActionButton, {
              icon: 'search',
              className: 'justify-start',
              onClick: () => {
                $activeTab.set('SEARCH')
                host.navigate(ROUTE)
              },
              children: 'SEARCH_MEMORY'
            }),
            context.data?.copy_text
              ? jsx(CopyButton, {
                  appearance: 'button',
                  buttonSize: 'default',
                  buttonVariant: 'secondary',
                  className: 'justify-start',
                  text: context.data.copy_text,
                  label: 'Copy context',
                  showLabel: true
                })
              : null
          ]
        })
      }),
      jsx(AddToSessionDialog, { origin: 'pane', snapshot })
    ]
  })
}

function HonchoMemoryPane() {
  return jsx(ResponsiveSurface, {
    className: 'h-full',
    children: jsx(HonchoMemoryPaneContent, {})
  })
}

function HonchoStatusChip() {
  const snapshot = useHonchoSnapshot()
  const viewport = useValue(host.state.viewport)
  const compactStatus = viewport?.width < 640
  const data = snapshot.data
  const queue = data?.chat?.queue || data?.queue
  const tone = stateTone(data, snapshot.isError)
  let label = 'Honcho'
  if (snapshot.routeMismatch) label = 'Honcho · blocked'
  else if (snapshot.isLoading) label = 'Honcho · checking'
  else if (snapshot.isError || data?.state === 'unreachable' || data?.state === 'error') label = 'Honcho · unavailable'
  else if (data?.state === 'not_configured') label = 'Honcho · setup needed'
  else if (data?.state === 'disabled') label = 'Honcho · disabled'
  else if (snapshot.busy) label = snapshot.awaitingResponse ? 'Honcho · waiting' : 'Honcho · working'
  else if (queue?.in_progress > 0) label = `Honcho · ${number(queue.in_progress)} processing`
  else if (queue?.pending > 0) label = `Honcho · ${number(queue.pending)} pending`
  else if (data?.ok) label = 'Honcho · ready'

  const tip = snapshot.routeMismatch
    ? 'Focused chat belongs to another profile or connection; memory reads are blocked'
    : data?.ok
      ? `${text(data.config?.workspace_id)} · ${queueLabel(queue)} · updated every 10 seconds`
      : data?.errors?.[0]?.message || 'Open Honcho Memory for details'

  return jsx(Tip, {
    label: tip,
    children: jsxs('button', {
      type: 'button',
      onClick: () => host.navigate(ROUTE),
      className: cn(
        'inline-flex h-full items-center gap-1.5 rounded-none px-1.5 text-[0.6875rem] tabular-nums transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      children: [jsx(StatusDot, { tone }), compactStatus ? null : jsx('span', { children: label })]
      })
      })
}

export default {
  id: PLUGIN_ID,
  name: 'Honcho',
  description: 'Focused-conversation Honcho memory cockpit for Hermes Desktop.',
  defaultEnabled: true,
  register(ctx) {
    requestPlugin = ctx.rest
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
          width: '300px'
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
          label: 'Honcho: Open memory cockpit',
          keywords: ['honcho', 'memory', 'session', 'context', 'search'],
          run: () => host.navigate(ROUTE)
        }
      }
    ])
  }
}
