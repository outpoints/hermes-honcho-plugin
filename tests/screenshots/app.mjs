import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { jsx } from 'react/jsx-runtime'
import plugin from '../../desktop/plugin.js'
import { fixtureTransport } from './fixtures.mjs'
import { applyDemoTheme } from 'demo-theme'
import { host } from '@hermes/plugin-sdk'

const contributions = []
const params = new URLSearchParams(location.search)
window.demoCalls = []
window.demoHost = host
window.demoScenario = params.get('scenario') || ''
window.demoHolds = {}
window.demoReleases = {}
plugin.register({
  registerMany: items => contributions.push(...items),
  onDispose() {},
  rest: async (path, options) => {
    window.demoCalls.push({ path, method: options?.method, body: options?.body })
    const endpoint = path.split('?')[0]
    if (window.demoHolds[endpoint]) await new Promise(resolve => { window.demoReleases[endpoint] = resolve })
    if (window.demoScenario === 'disconnected') throw new Error('Synthetic disconnected backend')
    // A new draft: the workspace answers, but the chat has no Honcho session.
    if (window.demoScenario === 'draft' && path.startsWith('/snapshot')) {
      const snapshot = await fixtureTransport(path, options)
      return { ...snapshot, state: 'partial', errors: [{ scope: 'session', message: 'The focused chat has no resolvable Honcho session.' }], chat: { ...snapshot.chat, found: null, honcho_session_id: null, messages: null, hermes_session_id: null } }
    }
    if (window.demoScenario === 'unsupported' && path.startsWith('/capabilities')) return { ok: true, state: 'connected', errors: [], capabilities: { conclusion_search: false, conclusion_detail: false, ask: false, correction: false, ask_evidence: false }, reasons: { conclusion_search: 'Synthetic SDK cannot search conclusions.', conclusion_detail: 'Synthetic SDK cannot inspect provenance.', ask: 'Synthetic SDK cannot ask memory.', correction: 'Synthetic SDK cannot verify corrections.', ask_evidence: 'Synthetic SDK has no evidence.' } }
    if (window.demoScenario === 'unknown-correction' && path.startsWith('/corrections')) return { ok: false, verified: false, outcome: 'unknown', state: 'unknown', errors: [{ scope: 'correction', message: 'Synthetic response lost. Inspect memory before retrying.' }] }
    return fixtureTransport(path, options)
  },
})
applyDemoTheme(params.get('theme') || 'dark')
if (window.demoScenario === 'cross-profile') {
  // The "all profiles" sidebar focuses a chat owned by another local profile
  // while the window's active profile stays put.
  host.state.profile.set('work')
}
if (window.demoScenario === 'focus-handoff') {
  // Model the real host seam: its pane handler runs below window capture and
  // changes the SDK focus from the tile to a different route-primary chat.
  let handedOff = false
  document.addEventListener('pointerdown', event => {
    if (handedOff || !event.target.closest('[data-honcho-surface]')) return
    handedOff = true
    host.state.focusedStoredSessionId.set('primary-other')
    host.state.focusedSessionId.set('primary-runtime')
  }, true)
  const nav = document.createElement('button')
  const label = document.createElement('span')
  label.dataset.tour = 'sidebar-nav-hermes-honcho-plugin:nav'
  label.textContent = 'Open Honcho page'
  nav.append(label)
  nav.onclick = () => {
    location.hash = '#/honcho'
    setTimeout(() => {
      host.state.focusedStoredSessionId.set(null)
      host.state.focusedSessionId.set(null)
      root.render(jsx(QueryClientProvider, { client, children: contributions.find(item => item.id === 'page').render() }))
    }, 0)
  }
  document.getElementById('demo-label').append(nav)
}
const contribution = contributions.find(item => item.id === (params.get('pane') ? 'memory' : 'page'))
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
const root = createRoot(document.getElementById('root'))
root.render(jsx(QueryClientProvider, { client, children: contribution.render() }))
