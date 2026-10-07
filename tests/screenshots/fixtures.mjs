// Invented demonstration data only. Never capture or import a real profile.
export const sessionId = 'demo-field-notes'
export const timestamp = '2026-01-15T10:30:00Z'
const otherSession = 'demo-trip-planning'
const at = (day, time) => `2026-01-${String(day).padStart(2, '0')}T${time}:00Z`
const sessionQueue = { total: 31, completed: 30, pending: 0, in_progress: 1 }
const workspaceQueue = { total: 212, completed: 211, pending: 0, in_progress: 1 }
const base = { ok: true, state: 'connected', profile: 'demo', errors: [], stale_at: timestamp }

const messages = [
  ['demo-user', 'Let’s organize the field guide by habitat. Start with coastal trails, then add woodland routes.', '10:02'],
  ['demo-assistant', 'I’ll keep each route in the same format: distance, terrain, seasonal notes, and a short packing checklist.', '10:03'],
  ['demo-user', 'Use kilometers for distance. Keep the overview short and put the detailed observations in a separate section.', '10:11'],
  ['demo-assistant', 'The coastal route draft is ready. It includes a tide reminder, a wind-layer suggestion, and two rest stops.', '10:14'],
  ['demo-user', 'For the next draft, prioritize routes that can be completed in a morning without specialist equipment.', '10:26'],
  ['demo-assistant', 'Understood. I’ll mark the three morning-length routes first and move the ridge traverse to a later section.', '10:28'],
].map(([peer_id, content, time], index) => ({ id: `demo-message-${index + 1}`, session_id: sessionId, peer_id, content, created_at: at(15, time), token_count: 24 + index * 3, metadata: { source: 'synthetic-demo' } }))

const conclusion = (id, content, { level = 'explicit', session = sessionId, day = 15, time = '10:30', parents = [], derived = 1 } = {}) => ({
  id: `demo-conclusion-${id}`, content, observer_id: 'demo-assistant', observed_id: 'demo-user',
  source_session_id: session, belongs_to_current_session: session === sessionId, level,
  created_at: at(day, time), source_ids: parents.map(parent => `demo-conclusion-${parent}`), times_derived: derived,
})
// Honcho lists conclusions newest first, so the fixture does too.
const conclusions = [
  conclusion(3, 'Morning-length routes that need no specialist equipment are the current planning priority.', { level: 'deductive', time: '10:29', parents: [5, 1] }),
  conclusion(4, 'Wants each route to end with a short packing checklist.', { level: 'deductive', time: '10:16', parents: [1] }),
  conclusion(2, 'Uses kilometers for every distance and a fixed distance, terrain, and seasonal-notes format.', { time: '10:12', derived: 2 }),
  conclusion(1, 'Prefers concise route overviews, with detailed observations kept in a separate section.', { time: '10:04', derived: 3 }),
  conclusion(5, 'Plans to publish the coastal section before the woodland section.', { day: 14, time: '16:40' }),
  conclusion(6, 'Tends to ask for tide and wind notes on any coastal route.', { level: 'inductive', session: otherSession, day: 12, parents: [5, 7], derived: 4 }),
  conclusion(8, 'Practical rest stops matter more to this group than scenic detours.', { level: 'deductive', session: otherSession, day: 11, time: '11:05', parents: [7] }),
  conclusion(7, 'Is writing the guide for a small walking group, not for experienced hikers.', { session: otherSession, day: 11, time: '10:50' }),
]
const current = conclusions.filter(item => item.belongs_to_current_session)
const peerCard = ['Writes a field guide for a small walking group.', 'Prefers practical checklists.', 'Uses metric distances.', 'Values clear source provenance.']
const summary = 'A synthetic field guide is being organized by habitat. The coastal section comes first, with short morning routes, kilometers, and a packing checklist on each route.'
const representation = current.map(item => item.content).join('\n')
const copyText = `Session summary\n${summary}\n\nCurrent-session representation\n${representation}\n\nPeer card\n${peerCard.map(fact => `• ${fact}`).join('\n')}`

export const fixtures = {
  '/snapshot': { ...base, latency_ms: 38, config: { workspace_id: 'demo-workspace', endpoint: 'https://honcho.example.com', user_peer: 'demo-user', ai_peer: 'demo-assistant', session_strategy: 'per-repo', recall_mode: 'hybrid', write_frequency: 'async', save_messages: true }, chat: { found: true, hermes_session_id: 'demo-conversation', honcho_session_id: sessionId, messages: messages.length, peers: ['demo-user', 'demo-assistant'], queue: sessionQueue, mapping_source: 'repository', cwd: '/demo/field-guide', latest_message_at: messages.at(-1).created_at, latest_peer_id: 'demo-assistant' }, queue: workspaceQueue, totals: { conclusions: conclusions.length } },
  '/messages': { ...base, items: [...messages].reverse(), total: messages.length, page: 1, pages: 1 },
  '/context': { ...base, session: { summary, messages, token_count: null }, session_representation: representation, peer_card: peerCard, layers: { peer_card: true, conclusions: true, summaries: true, messages: true }, copy_text: copyText, preview: copyText, character_count: copyText.length, token_estimate: Math.ceil(copyText.length / 4), token_budget: 2048, scope_explanation: 'Session layers come from this demonstration session. The peer card covers the whole workspace.' },
  '/scopes': { ...base, items: [], capabilities: { scope_search: false } },
  '/activity': { ...base, session_queue: sessionQueue, workspace_queue: workspaceQueue, sdk_version: '2.5.1', capability_note: 'Detailed reasoning traces are not exposed by this SDK.' },
}

let ticketSequence = 0
const correctionTickets = new Map()
const correctionTarget = { workspace_id: 'demo-workspace', session_id: sessionId, observer_id: 'demo-assistant', observed_id: 'demo-user' }

export async function fixtureTransport(path, options = {}) {
  const endpoint = path.split('?')[0]
  const body = options.body || {}
  if (endpoint === '/capabilities') return { ...base, capabilities: { conclusion_search: true, conclusion_detail: true, ask: true, correction: true, ask_evidence: true }, reasons: {} }
  if (endpoint === '/conclusions') {
    const items = body.scope === 'all' ? conclusions : current
    return { ...base, items, total: items.length, page: 1, pages: 1, observer_id: 'demo-assistant', observed_id: 'demo-user' }
  }
  if (endpoint === '/conclusion-search') {
    const pool = body.scope === 'all' ? conclusions : current
    const items = pool.filter(item => item.content.toLowerCase().includes((body.query || '').toLowerCase()))
    return { ...base, items, total: items.length, query: body.query, scope: body.scope }
  }
  if (endpoint === '/conclusion-detail') {
    const item = conclusions.find(candidate => candidate.id === body.conclusion_id)
    return { ...base, item: item || null, parents: conclusions.filter(parent => item?.source_ids.includes(parent.id)), derived: conclusions.filter(child => child.source_ids.includes(body.conclusion_id)), capabilities: { parents: true, derived: true }, truncated: false }
  }
  if (endpoint === '/search') {
    const query = (body.query || '').toLowerCase().replace(/s$/, '')
    return { ...base, items: messages.filter(message => message.content.toLowerCase().includes(query)).map((message, index) => ({ ...message, rank: index + 1 })), query: body.query }
  }
  if (endpoint === '/ask') return { ...base, query: body.query, scope: body.scope, answer: 'Use kilometers. Keep each route overview short, put detailed observations in their own section, and end the route with a short packing checklist.', evidence: body.include_evidence ? { conclusions: ['demo-conclusion-2', 'demo-conclusion-1', 'demo-conclusion-4'].map(id => conclusions.find(item => item.id === id)), messages: [messages[2]], tool_calls: [], reasoning_trace_id: 'demo-trace' } : null }
  if (endpoint === '/correction-ticket') {
    const ticket = `demo-ticket-${++ticketSequence}`
    correctionTickets.set(ticket, body.content)
    return { ...base, ticket, target: correctionTarget, content: body.content }
  }
  if (endpoint === '/corrections') {
    if (!correctionTickets.has(body.ticket)) throw new Error('Synthetic ticket is missing or already consumed')
    const content = correctionTickets.get(body.ticket)
    correctionTickets.delete(body.ticket)
    return { ...base, verified: true, outcome: 'verified', target: correctionTarget, item: { ...conclusions[0], id: `demo-correction-${ticketSequence}`, content, created_at: at(15, '10:40'), level: 'explicit', source_ids: [], times_derived: 1 } }
  }
  if (!(endpoint in fixtures)) throw new Error(`Demo blocks writes and unknown endpoints: ${endpoint}`)
  return structuredClone(fixtures[endpoint])
}
