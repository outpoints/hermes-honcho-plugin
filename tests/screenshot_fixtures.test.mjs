import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureTransport } from './screenshots/fixtures.mjs'

test('synthetic workbench transport follows explicit search and question inputs', async () => {
  const capabilities = await fixtureTransport('/capabilities?profile=demo')
  assert.equal(capabilities.capabilities.ask, true)
  const result = await fixtureTransport('/conclusion-search', { body: { query: 'kilometers', scope: 'current' } })
  assert.equal(result.items.length, 1)
  assert.match(result.items[0].content, /kilometers/)
  const answer = await fixtureTransport('/ask', { body: { query: 'Which units?', scope: 'session', include_evidence: true } })
  assert.equal(answer.query, 'Which units?')
  assert.equal(answer.scope, 'session')
  assert.ok(answer.evidence.conclusions.length)
})

test('synthetic correction never accepts unissued or replayed tickets', async () => {
  await assert.rejects(fixtureTransport('/corrections', { body: { ticket: 'missing' } }))
  const ticket = await fixtureTransport('/correction-ticket', { body: { content: 'Use miles for this synthetic example.' } })
  const result = await fixtureTransport('/corrections', { body: { ticket: ticket.ticket } })
  assert.equal(result.verified, true)
  assert.equal(result.item.content, 'Use miles for this synthetic example.')
  await assert.rejects(fixtureTransport('/corrections', { body: { ticket: ticket.ticket } }))
})

test('synthetic session settings save only through a fresh, single-use ticket', async () => {
  await assert.rejects(fixtureTransport('/session-settings-save', { body: { ticket: 'missing' } }))
  const before = await fixtureTransport('/session-settings')
  assert.equal(before.learning.find(row => row.key === 'reasoning').choice, 'inherit')
  const stale = await fixtureTransport('/session-settings-ticket', { body: { revision: '0'.repeat(64), learning: { reasoning: 'off' } } })
  assert.equal(stale.state, 'stale')
  const ticket = await fixtureTransport('/session-settings-ticket', { body: { revision: before.revision, learning: { reasoning: 'off' }, observation: { 'demo-user': { observe_me: 'off' } } } })
  assert.deepEqual(ticket.changes.map(change => change.id), ['learning.reasoning', 'observation.demo-user.observe_me'])
  const saved = await fixtureTransport('/session-settings-save', { body: { ticket: ticket.ticket } })
  assert.equal(saved.outcome, 'verified')
  assert.notEqual(saved.revision, before.revision)
  assert.equal(saved.peers[0].effective_observe_me, false)
  await assert.rejects(fixtureTransport('/session-settings-save', { body: { ticket: ticket.ticket } }))
})
