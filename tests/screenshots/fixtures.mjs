// Invented demonstration data only. Never capture or import a real profile.
export const sessionId = 'demo-field-notes'
export const timestamp = '2026-01-15T10:30:00Z'
const queue = { total: 24, completed: 24, pending: 0, in_progress: 0 }
const base = { ok: true, state: 'connected', profile: 'demo', errors: [], stale_at: timestamp }
const messages = [
  ['demo-user', 'Let’s organize the field guide by habitat. Start with coastal trails, then add woodland routes.'],
  ['demo-assistant', 'I’ll keep each route in the same format: distance, terrain, seasonal notes, and a short packing checklist.'],
  ['demo-user', 'Use kilometers for distance. Keep the overview short and put the detailed observations in a separate section.'],
  ['demo-assistant', 'The coastal route draft is ready. It includes a tide reminder, a wind-layer suggestion, and two rest stops.'],
  ['demo-user', 'For the next draft, prioritize routes that can be completed in a morning without specialist equipment.'],
].map(([peer_id, content], index) => ({ id: `demo-message-${index + 1}`, session_id: sessionId, peer_id, content, created_at: timestamp, token_count: 32 + index, metadata: { source: 'synthetic-demo' } }))
const conclusions = [
  'The demonstration user prefers concise route overviews with detailed observations kept separately.',
  'Route descriptions should use kilometers and a consistent distance, terrain, and seasonal-notes format.',
  'Morning-length routes that do not require specialist equipment are the current planning priority.',
].map((content, index) => ({ id: `demo-conclusion-${index + 1}`, content, observer_id: 'demo-assistant', observed_id: 'demo-user', source_session_id: sessionId, belongs_to_current_session: true, level: 'deductive', created_at: timestamp, source_ids: index ? ['demo-conclusion-1'] : [], times_derived: index + 1 }))
const copyText = 'Session summary\nA synthetic field-guide project is organizing coastal and woodland routes. The current draft focuses on short coastal walks.\n\nCurrent-session representation\nUse kilometers. Keep overviews concise. Place detailed observations in a separate section. Favor morning-length routes without specialist equipment.\n\nPeer card\n• Prefers practical checklists.\n• Uses metric distances.\n• Values clear source provenance.'
export const fixtures = {
  '/snapshot': { ...base, latency_ms: 38, config: { workspace_id: 'demo-workspace', endpoint: 'https://honcho.example.com', user_peer: 'demo-user', ai_peer: 'demo-assistant', session_strategy: 'per-repo', recall_mode: 'hybrid', write_frequency: 'async', save_messages: true }, chat: { found: true, hermes_session_id: 'demo-conversation', honcho_session_id: sessionId, messages: messages.length, peers: ['demo-user', 'demo-assistant'], queue, mapping_source: 'repository', cwd: '/demo/field-guide', latest_message_at: timestamp, latest_peer_id: 'demo-user' }, queue, totals: { conclusions: conclusions.length } },
  '/messages': { ...base, items: messages, total: messages.length, page: 1, pages: 1 },
  '/conclusions': { ...base, items: conclusions, total: conclusions.length, page: 1, pages: 1, observer_id: 'demo-assistant', observed_id: 'demo-user' },
  '/context': { ...base, session: { summary: 'A synthetic field-guide project is organizing coastal and woodland routes.', messages, token_count: null }, session_representation: conclusions.map(c => c.content).join('\n'), peer_card: ['Prefers practical checklists.', 'Uses metric distances.', 'Values clear source provenance.'], layers: { peer_card: true, conclusions: true, summaries: true, messages: true }, copy_text: copyText, preview: copyText, character_count: copyText.length, token_estimate: Math.ceil(copyText.length / 4), token_budget: 2048, scope_explanation: 'Session layers are scoped to this demonstration conversation. The peer card is workspace-wide.' },
  '/scopes': { ...base, items: [], capabilities: { scope_search: false } },
  '/search': { ...base, items: messages.filter(m => m.content.includes('route')), query: 'routes' },
  '/activity': { ...base, session_queue: queue, workspace_queue: queue, sdk_version: '2.2.0', capability_note: 'Aggregate queue status is available. Detailed reasoning traces are not exposed by this SDK.' },
}

export async function fixtureTransport(path) {
  const endpoint = path.split('?')[0]
  if (!(endpoint in fixtures)) throw new Error(`Demo blocks writes and unknown endpoints: ${endpoint}`)
  return structuredClone(fixtures[endpoint])
}
