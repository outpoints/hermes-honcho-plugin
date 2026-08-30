/**
 * Hermes Honcho — runtime-loaded Hermes Desktop plugin.
 *
 * Keep this file as plain, uncompiled ESM. Hermes's runtime loader rewrites
 * only the SDK and React specifiers, so UI is authored with jsx()/jsxs().
 */

import {
  cn,
  Codicon,
  ErrorState,
  host,
  PALETTE_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  Skeleton,
  StatusDot,
  STATUSBAR_AREAS,
  Tip,
  useQuery,
  useValue
} from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'

const PLUGIN_ID = 'hermes-honcho-plugin'
const ROUTE = '/honcho'
const POLL_INTERVAL_MS = 10_000

let requestPlugin = null

function text(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function number(value, fallback = '—') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return fallback
  return new Intl.NumberFormat().format(Number(value))
}

function formatTime(value) {
  if (!value) return 'No messages yet'
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
  if (data?.state === 'not_configured' || data?.state === 'disabled') return 'warn'
  if (data?.ok) return 'good'
  return 'muted'
}

function useHonchoSnapshot() {
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

  const body = {
    profile: activeProfile || 'default',
    connection_id: connectionId || null,
    runtime_session_id: routeMismatch ? null : runtimeSessionId,
    stored_session_id: routeMismatch ? null : storedSessionId,
    cwd: routeMismatch ? null : cwd
  }

  const query = useQuery({
    queryKey: [
      PLUGIN_ID,
      'snapshot',
      activeProfile || 'default',
      connectionId || 'local',
      routeMismatch ? 'route-mismatch' : storedSessionId || runtimeSessionId || 'draft',
      routeMismatch ? '' : cwd || ''
    ],
    queryFn: () => {
      if (!requestPlugin) throw new Error('Honcho plugin backend is not registered')
      return requestPlugin('/snapshot', {
        method: 'POST',
        body,
        timeoutMs: 22_000
      })
    },
    refetchInterval: POLL_INTERVAL_MS,
    retry: 1
  })

  return {
    ...query,
    activeProfile,
    focusedProfile,
    focusedOwner,
    connectionId,
    runtimeSessionId,
    storedSessionId,
    cwd,
    busy,
    awaitingResponse,
    routeMismatch
  }
}

function MetricCard({ icon, label, value, detail, tone = 'muted' }) {
  return jsxs('section', {
    className: 'min-w-0 rounded-xl border border-border/70 bg-card/60 p-4 shadow-sm',
    children: [
      jsxs('div', {
        className: 'mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground',
        children: [jsx(Codicon, { name: icon, size: '0.85rem' }), jsx('span', { children: label })]
      }),
      jsxs('div', {
        className: 'flex items-center gap-2',
        children: [
          jsx(StatusDot, { tone }),
          jsx('div', {
            className: 'truncate text-2xl font-semibold tracking-tight text-foreground',
            title: text(value),
            children: text(value)
          })
        ]
      }),
      detail
        ? jsx('p', {
            className: 'mt-2 truncate text-xs text-muted-foreground',
            title: detail,
            children: detail
          })
        : null
    ]
  })
}

function DetailRow({ label, value, mono = false }) {
  return jsxs('div', {
    className: 'grid min-w-0 grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.5fr)] gap-4 border-b border-border/50 py-2.5 last:border-0',
    children: [
      jsx('dt', { className: 'text-sm text-muted-foreground', children: label }),
      jsx('dd', {
        className: cn(
          'min-w-0 break-words text-right text-sm text-foreground',
          mono && 'font-mono text-xs'
        ),
        title: text(value),
        children: text(value)
      })
    ]
  })
}

function Section({ title, description, children }) {
  return jsxs('section', {
    className: 'rounded-xl border border-border/70 bg-card/40 p-5 shadow-sm',
    children: [
      jsx('h2', { className: 'text-base font-semibold tracking-tight', children: title }),
      description
        ? jsx('p', { className: 'mt-1 text-sm leading-5 text-muted-foreground', children: description })
        : null,
      jsx('div', { className: 'mt-4', children })
    ]
  })
}

function Alert({ icon, tone, title, children }) {
  const toneClasses = {
    good: 'border-primary/25 bg-primary/5',
    warn: 'border-amber-500/30 bg-amber-500/5',
    bad: 'border-destructive/30 bg-destructive/5',
    muted: 'border-border/70 bg-muted/30'
  }
  return jsxs('div', {
    className: cn('flex items-start gap-3 rounded-xl border p-4', toneClasses[tone] || toneClasses.muted),
    children: [
      jsx('div', {
        className: 'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-background/70',
        children: jsx(Codicon, { name: icon, size: '0.9rem' })
      }),
      jsxs('div', {
        className: 'min-w-0',
        children: [
          jsx('p', { className: 'text-sm font-medium text-foreground', children: title }),
          jsx('div', { className: 'mt-1 text-sm leading-5 text-muted-foreground', children })
        ]
      })
    ]
  })
}

function LoadingPage() {
  return jsxs('div', {
    className: 'space-y-5',
    children: [
      jsx(Skeleton, { className: 'h-20 w-full rounded-xl' }),
      jsx('div', {
        className: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4',
        children: [0, 1, 2, 3].map(index =>
          jsx(Skeleton, { className: 'h-32 rounded-xl' }, index)
        )
      }),
      jsx(Skeleton, { className: 'h-72 w-full rounded-xl' })
    ]
  })
}

function BackendError({ error, refetch, isFetching }) {
  const detail = error instanceof Error ? error.message : 'The plugin API could not be reached.'
  return jsx(ErrorState, {
    className: 'mx-auto max-w-lg rounded-xl border border-border/70 p-8',
    title: 'Honcho status is unavailable',
    description: `${detail} Make sure the agent-side plugin is enabled, then restart Hermes Desktop.`,
    children: jsxs('button', {
      type: 'button',
      disabled: isFetching,
      onClick: () => refetch(),
      className: 'mx-auto inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50',
      children: [jsx(Codicon, { name: 'refresh', size: '0.8rem' }), isFetching ? 'Retrying…' : 'Try again']
    })
  })
}

function HonchoPage() {
  const snapshot = useHonchoSnapshot()
  const data = snapshot.data
  const config = data?.config
  const chat = data?.chat
  const workspaceQueue = data?.queue
  const tone = stateTone(data, snapshot.isError)

  return jsx('main', {
    className: 'h-full overflow-y-auto',
    children: jsxs('div', {
      className: 'mx-auto w-full max-w-6xl space-y-5 px-5 py-6 lg:px-8 lg:py-8',
      children: [
        jsxs('header', {
          className: 'flex flex-wrap items-start justify-between gap-4',
          children: [
            jsxs('div', {
              children: [
                jsxs('div', {
                  className: 'flex items-center gap-2',
                  children: [
                    jsx('div', {
                      className: 'flex size-8 items-center justify-center rounded-lg border border-border bg-card',
                      children: jsx(Codicon, { name: 'database', size: '1rem' })
                    }),
                    jsx('h1', { className: 'text-2xl font-semibold tracking-tight', children: 'Honcho' })
                  ]
                }),
                jsx('p', {
                  className: 'mt-2 max-w-2xl text-sm leading-5 text-muted-foreground',
                  children: 'Live memory status for the active Hermes profile and focused chat.'
                })
              ]
            }),
            jsxs('button', {
              type: 'button',
              disabled: snapshot.isFetching,
              onClick: () => snapshot.refetch(),
              className: 'inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50',
              children: [
                jsx(Codicon, {
                  name: 'refresh',
                  size: '0.8rem',
                  className: snapshot.isFetching ? 'animate-spin' : undefined
                }),
                snapshot.isFetching ? 'Refreshing…' : 'Refresh'
              ]
            })
          ]
        }),

        snapshot.routeMismatch
          ? jsx(Alert, {
              icon: 'warning',
              tone: 'warn',
              title: 'Focused chat belongs to another Hermes connection',
              children: `The plugin API is currently routed to ${text(snapshot.activeProfile, 'the active profile')}, while this chat belongs to ${text(snapshot.focusedProfile, 'another profile')}. Workspace metrics are shown, but chat mapping is paused to prevent mixing profiles.`
            })
          : null,

        snapshot.isLoading
          ? jsx(LoadingPage, {})
          : snapshot.isError
            ? jsx(BackendError, {
                error: snapshot.error,
                refetch: snapshot.refetch,
                isFetching: snapshot.isFetching
              })
            : jsxs('div', {
                className: 'space-y-5',
                children: [
                  jsx(Alert, {
                    icon: data?.ok ? 'pass-filled' : 'info',
                    tone,
                    title: data?.ok
                      ? `Connected to ${text(config?.workspace_id)} `
                      : data?.state === 'disabled'
                        ? 'Honcho is disabled for this profile'
                        : data?.state === 'not_configured'
                          ? 'Honcho is not configured for this profile'
                          : 'Honcho needs attention',
                    children: data?.ok
                      ? `${text(config?.endpoint)} responded in ${number(data?.latency_ms)} ms. Polling every 10 seconds.`
                      : data?.errors?.[0]?.message || 'Check the Honcho configuration for this Hermes profile.'
                  }),

                  jsxs('div', {
                    className: 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4',
                    children: [
                      jsx(MetricCard, {
                        icon: 'database',
                        label: 'Workspace',
                        value: config?.workspace_id,
                        detail: config?.host ? `Hermes host: ${config.host}` : null,
                        tone
                      }),
                      jsx(MetricCard, {
                        icon: 'comment-discussion',
                        label: 'Sessions',
                        value: number(data?.totals?.sessions),
                        detail: `${text(config?.session_strategy)} mapping`,
                        tone: data?.totals?.sessions === null ? 'muted' : tone
                      }),
                      jsx(MetricCard, {
                        icon: 'organization',
                        label: 'Peers',
                        value: number(data?.totals?.peers),
                        detail:
                          data?.totals?.conclusions === null || data?.totals?.conclusions === undefined
                            ? 'Workspace identities'
                            : `${number(data.totals.conclusions)} conclusions about ${text(config?.user_peer, 'user')}`,
                        tone: data?.totals?.peers === null ? 'muted' : tone
                      }),
                      jsx(MetricCard, {
                        icon: 'pulse',
                        label: 'Queue',
                        value: queueLabel(workspaceQueue),
                        detail: workspaceQueue
                          ? `${number(workspaceQueue.completed)} of ${number(workspaceQueue.total)} complete`
                          : 'Workspace processing status',
                        tone:
                          workspaceQueue?.in_progress > 0 || workspaceQueue?.pending > 0
                            ? 'warn'
                            : workspaceQueue
                              ? 'good'
                              : 'muted'
                      })
                    ]
                  }),

                  jsx(Section, {
                    title: 'Current chat',
                    description: 'The Honcho session is resolved by Hermes using this profile’s configured session strategy.',
                    children: jsxs('dl', {
                      children: [
                        jsx(DetailRow, {
                          label: 'Local state',
                          value: snapshot.busy
                            ? snapshot.awaitingResponse
                              ? 'Waiting for first response'
                              : 'Hermes is working'
                            : 'Idle'
                        }),
                        jsx(DetailRow, {
                          label: 'Hermes session',
                          value: chat?.hermes_session_id || (snapshot.routeMismatch ? 'Paused — different profile' : 'New draft'),
                          mono: true
                        }),
                        jsx(DetailRow, {
                          label: 'Honcho session',
                          value: chat?.honcho_session_id,
                          mono: true
                        }),
                        jsx(DetailRow, { label: 'Mapping source', value: chat?.mapping_source }),
                        jsx(DetailRow, {
                          label: 'Found in Honcho',
                          value:
                            chat?.found === true
                              ? 'Yes'
                              : chat?.found === false
                                ? 'Not yet'
                                : 'Not checked'
                        }),
                        jsx(DetailRow, { label: 'Messages', value: number(chat?.messages) }),
                        jsx(DetailRow, {
                          label: 'Peers',
                          value: chat?.peers?.length ? chat.peers.join(', ') : null,
                          mono: true
                        }),
                        jsx(DetailRow, {
                          label: 'Session queue',
                          value: queueLabel(chat?.queue)
                        }),
                        jsx(DetailRow, {
                          label: 'Latest memory message',
                          value: chat?.latest_message_at
                            ? `${formatTime(chat.latest_message_at)} · ${text(chat.latest_peer_id)}`
                            : null
                        }),
                        jsx(DetailRow, { label: 'Working directory', value: chat?.cwd, mono: true })
                      ]
                    })
                  }),

                  jsxs('div', {
                    className: 'grid grid-cols-1 gap-5 lg:grid-cols-2',
                    children: [
                      jsx(Section, {
                        title: 'Profile configuration',
                        children: jsxs('dl', {
                          children: [
                            jsx(DetailRow, { label: 'Profile', value: data?.profile }),
                            jsx(DetailRow, { label: 'Endpoint', value: config?.endpoint, mono: true }),
                            jsx(DetailRow, { label: 'Recall mode', value: config?.recall_mode }),
                            jsx(DetailRow, { label: 'Write frequency', value: config?.write_frequency }),
                            jsx(DetailRow, {
                              label: 'Save messages',
                              value: config?.save_messages ? 'Enabled' : 'Disabled'
                            }),
                            jsx(DetailRow, { label: 'User peer', value: config?.user_peer, mono: true }),
                            jsx(DetailRow, { label: 'AI peer', value: config?.ai_peer, mono: true })
                          ]
                        })
                      }),
                      jsx(Section, {
                        title: 'Diagnostics',
                        description: 'Individual read failures are preserved here while healthy metrics continue updating.',
                        children: data?.errors?.length
                          ? jsx('ul', {
                              className: 'space-y-2',
                              children: data.errors.map((error, index) =>
                                jsxs('li', {
                                  className: 'rounded-lg border border-border/60 bg-muted/25 px-3 py-2',
                                  children: [
                                    jsx('p', {
                                      className: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
                                      children: text(error.scope, 'metric')
                                    }),
                                    jsx('p', {
                                      className: 'mt-1 break-words text-sm text-foreground',
                                      children: text(error.message)
                                    })
                                  ]
                                }, `${error.scope}-${index}`)
                              )
                            })
                          : jsxs('div', {
                              className: 'flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-3 text-sm',
                              children: [
                                jsx(StatusDot, { tone: 'good' }),
                                jsx('span', { children: 'All requested Honcho metrics are healthy.' })
                              ]
                            })
                      })
                    ]
                  })
                ]
              })
      ]
    })
  })
}

function HonchoStatusChip() {
  const snapshot = useHonchoSnapshot()
  const data = snapshot.data
  const queue = data?.queue
  const tone = stateTone(data, snapshot.isError)

  let label = 'Honcho'
  if (snapshot.isLoading) label = 'Honcho · checking'
  else if (snapshot.isError || data?.state === 'unreachable' || data?.state === 'error') label = 'Honcho · unavailable'
  else if (data?.state === 'not_configured') label = 'Honcho · setup needed'
  else if (data?.state === 'disabled') label = 'Honcho · disabled'
  else if (snapshot.busy) label = snapshot.awaitingResponse ? 'Honcho · waiting' : 'Honcho · working'
  else if (queue?.in_progress > 0) label = `Honcho · ${number(queue.in_progress)} processing`
  else if (queue?.pending > 0) label = `Honcho · ${number(queue.pending)} pending`
  else if (data?.ok) label = 'Honcho · ready'

  const tip = data?.ok
    ? `${text(data?.config?.workspace_id)} · ${queueLabel(queue)} · updated every 10 seconds`
    : data?.errors?.[0]?.message || 'Open Honcho status for details'

  return jsx(Tip, {
    label: tip,
    children: jsxs('button', {
      type: 'button',
      onClick: () => host.navigate(ROUTE),
      className: cn(
        'inline-flex h-full items-center gap-1.5 rounded-none px-1.5 text-[0.6875rem] tabular-nums transition-colors',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      ),
      children: [jsx(StatusDot, { tone }), jsx('span', { children: label })]
    })
  })
}

export default {
  id: PLUGIN_ID,
  name: 'Honcho',
  description: 'Native Honcho workspace, queue, and current-chat status for Hermes Desktop.',
  // Standalone installs under desktop-plugins are explicitly trusted and load
  // immediately. Unified installs remain opt-in because Hermes caps that root
  // with its own default-disabled posture.
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
          label: 'Honcho: Open memory status',
          keywords: ['honcho', 'memory', 'workspace', 'queue', 'status'],
          run: () => host.navigate(ROUTE)
        }
      }
    ])
  }
}
