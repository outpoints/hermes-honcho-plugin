// Invented demonstration data only. Never capture or import a real profile.
export const sessionId = 'demo-field-notes'
export const timestamp = '2026-01-15T10:30:00Z'
const otherSession = 'demo-trip-planning'
const at = (day, time) => `2026-01-${String(day).padStart(2, '0')}T${time}:00Z`
const sessionQueue = { total: 31, completed: 30, pending: 0, in_progress: 1 }
const workspaceQueue = { total: 212, completed: 211, pending: 0, in_progress: 1 }
const base = { ok: true, state: 'connected', profile: 'demo', errors: [], stale_at: timestamp }

// Real wire formats: Hermes saves assistant turns as markdown and prefixes
// each chunk after the first of an oversized turn with "[continued] ".
const coastalDraft = `## Coastal route draft

The **Harbour Loop** is ready for review.

| Leg | Distance | Terrain |
| --- | --- | --- |
| Harbour to lighthouse | 2.4 km | Paved |
| Lighthouse to cove | 1.8 km | Sand and shingle |
| Cove to car park | 2.0 km | Grass path |

### Seasonal notes

- Check the tide table before crossing the cove. The sand route closes about two hours either side of high tide.
- Pack a wind layer from October to March.

### Packing checklist

- Water
- Wind layer
- Printed map

Two rest stops are marked: the lighthouse bench and the café at the cove.`
const messages = [
  ['demo-user', 'Let’s organize the field guide by habitat. Start with coastal trails, then add woodland routes.', 14, '16:31'],
  ['demo-assistant', 'I’ll keep every route in the same format:\n\n1. **Distance** in kilometers\n2. **Terrain** and surface\n3. **Seasonal notes**\n4. A short packing checklist\n\nThe coastal section comes first.', 14, '16:33'],
  ['demo-user', 'Use kilometers for distance. Keep the overview short and put the detailed observations in a separate section.', 15, '10:11'],
  ['demo-assistant', coastalDraft, 15, '10:14'],
  ['demo-assistant', '[continued] Detailed observations moved to `field-guide/coastal-notes.md`, so the overview stays under 120 words.', 15, '10:14'],
  ['demo-user', 'For the next draft, prioritize routes that can be completed in a morning without specialist equipment.', 15, '10:26'],
  ['demo-assistant', 'Understood. I’ll mark the three **morning-length routes** first and move the ridge traverse to a later section.', 15, '10:28'],
].map(([peer_id, content, day, time], index) => ({ id: `demo-message-${index + 1}`, session_id: sessionId, peer_id, content, created_at: at(day, time), token_count: Math.ceil(content.length / 4), metadata: { source: 'synthetic-demo' } }))

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
// Honcho formats: CATEGORY: Key: value peer cards, markdown summaries, and
// Representation.format_as_markdown() for session and peer context.
const peerCard = [
  'IDENTITY: Name: demo-user',
  'IDENTITY: Role: Organizer of a small walking group',
  'ATTRIBUTE: Units: Kilometers for every distance',
  'ATTRIBUTE: Format: Distance, terrain, seasonal notes, packing checklist',
  'ATTRIBUTE: Prefers practical checklists',
  'ATTRIBUTE: Values clear source provenance',
  'INSTRUCTION: Keep route overviews short',
]
const summary = `A synthetic field guide is being organized by habitat for a small walking group. The coastal section comes first, then woodland routes.

Every route uses one format:

1. **Distance** in kilometers
2. **Terrain** and seasonal notes
3. A short **packing checklist**

Detailed observations live in \`field-guide/coastal-notes.md\`, so each overview stays short. The next draft leads with morning-length routes.`
const representation = `## Explicit Observations

[2026-01-14 16:40:12] demo-user plans to publish the coastal section before the woodland section.
[2026-01-15 10:02:31] demo-user wants the field guide organized by habitat.
[2026-01-15 10:02:31] demo-user wants coastal trails before woodland routes.
[2026-01-15 10:11:05] demo-user uses kilometers for every distance.
[2026-01-15 10:11:05] demo-user wants route overviews kept short.
[2026-01-15 10:26:48] demo-user wants routes that can be finished in a morning without specialist equipment listed first.

## Deductive Observations

[2026-01-15 10:29:40] Morning-length routes that need no specialist equipment are the current planning priority.
   Premises:
   - demo-user wants routes that can be finished in a morning without specialist equipment listed first.
   - demo-user plans to publish the coastal section before the woodland section.

`
const peerContext = `## Explicit Observations

[2026-01-11 10:50:03] demo-user is writing the guide for a small walking group, not for experienced hikers.
[2026-01-12 09:15:44] demo-user asked for tide and wind notes on a coastal route.

## Deductive Observations

[2026-01-11 11:05:19] Practical rest stops matter more to this group than scenic detours.
   Premises:
   - demo-user is writing the guide for a small walking group, not for experienced hikers.

## Inductive Observations

 **Pattern** [high]: Tends to ask for tide and wind notes on any coastal route.
   **Type**: tendency
   **Sources**:
   - demo-user asked for tide and wind notes on a coastal route.
   - demo-user plans to publish the coastal section before the woodland section.

`
// Mirrors the backend's copy_text sections.
const copyText = [
  ['SESSION REPRESENTATION', representation],
  ['SESSION SUMMARY', summary],
  ['SESSION MESSAGES', messages.map(message => `${message.peer_id}: ${message.content}`).join('\n\n')],
  ['PEER CONTEXT', peerContext],
  ['PEER CARD', peerCard.join('\n')],
].map(([label, value]) => `[${label}]\n${value.trim()}`).join('\n\n')
const answer = `Use kilometers. Keep each route overview short, put detailed observations in their own section, and end the route with a short packing checklist.

### What memory says

1. **Units:** every distance is in kilometers.
2. **Format:** distance, terrain and seasonal notes, then the checklist.
   - Detailed observations go in a separate section.
3. **Coastal routes** also get tide and wind notes.

The ridge traverse is still deferred to a later section.`

export const fixtures = {
  '/snapshot': { ...base, latency_ms: 38, config: { workspace_id: 'demo-workspace', endpoint: 'https://honcho.example.com', user_peer: 'demo-user', ai_peer: 'demo-assistant', session_strategy: 'per-repo', recall_mode: 'hybrid', write_frequency: 'async', save_messages: true }, chat: { found: true, hermes_session_id: 'demo-conversation', honcho_session_id: sessionId, messages: messages.length, peers: ['demo-user', 'demo-assistant'], queue: sessionQueue, mapping_source: 'repository', cwd: '/demo/field-guide', latest_message_at: messages.at(-1).created_at, latest_peer_id: 'demo-assistant' }, queue: workspaceQueue, totals: { conclusions: conclusions.length } },
  '/messages': { ...base, items: [...messages].reverse(), total: messages.length, page: 1, pages: 1 },
  '/context': { ...base, session: { summary, messages, token_count: null }, session_representation: representation, peer_context: peerContext, peer_card: peerCard, layers: { peer_card: true, conclusions: true, summaries: true, messages: true }, copy_text: copyText, preview: copyText, character_count: copyText.length, token_estimate: Math.ceil(copyText.length / 4), token_budget: 2048, scope_explanation: 'Session layers come from this demonstration session. The peer card covers the whole workspace.' },
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
  if (endpoint === '/ask') return { ...base, query: body.query, scope: body.scope, answer, evidence: body.include_evidence ? { conclusions: ['demo-conclusion-2', 'demo-conclusion-1', 'demo-conclusion-4'].map(id => conclusions.find(item => item.id === id)), messages: [messages[2]].map(({ id, session_id, peer_id, created_at }) => ({ id, session_id, peer_id, created_at })), tool_calls: [], reasoning_trace_id: 'demo-trace' } : null }
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
