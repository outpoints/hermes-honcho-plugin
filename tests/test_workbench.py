"""Memory-workbench contracts against the real SDK and an offline HTTP boundary."""
import json
import unittest
from unittest.mock import patch
from types import SimpleNamespace

import httpx
import test_sdk_compatibility as sdk_fixture
from test_sdk_compatibility import ROOT, SESSION, STAMP
from test_plugin_api import plugin_api


class WorkbenchTests(unittest.TestCase):
    def setUp(self):
        self.fixture = sdk_fixture.SDKCompatibilityTests()
        self.fixture.setUp()
        self.addCleanup(self.fixture.doCleanups)
        self.fixture.http._transport = httpx.MockTransport(self.handle)
        self.extra_calls = []
        self.records = {self.fixture.conclusion['id']: self.fixture.conclusion}
        self.fail_create = False
        self.fail_readback = False
        self.bad_pair = False
        self.fail_chat = False
        self.derived_records = []
        self.evidence = {'conclusions': [self.fixture.conclusion], 'messages': [], 'tool_calls': []}

    def handle(self, request):
        path = request.url.path
        body = json.loads(request.content) if request.content else {}
        self.extra_calls.append((request.method, path, body))
        if path == '/openapi.json':
            return httpx.Response(200, json={'info': {'version': '3.2.1'}})
        if path == f'{ROOT}/conclusions/query':
            self.assertEqual(body['filters']['observer_id'], 'agent')
            self.assertEqual(body['filters']['observed_id'], 'human')
            item = dict(self.fixture.conclusion)
            if self.bad_pair:
                item['observed_id'] = 'other'
            return httpx.Response(200, json=[item])
        if path == f'{ROOT}/conclusions/list' and body.get('filters', {}).get('id'):
            self.assertEqual(body['filters']['observer_id'], 'agent')
            self.assertEqual(body['filters']['observed_id'], 'human')
            items = [] if self.fail_readback else [r for r in self.records.values() if r['id'] == body['filters']['id']]
            return httpx.Response(200, json={'items': items, 'total': len(items), 'page': 1, 'size': 1, 'pages': 1})
        if path == f'{ROOT}/conclusions/list' and body.get('filters', {}).get('source_ids'):
            self.assertEqual(body['filters'], {'source_ids': {'contains': 'conclusion-fixture'}, 'observer_id': 'agent', 'observed_id': 'human'})
            self.assertEqual(request.url.params['size'], '10')
            return httpx.Response(200, json={'items': self.derived_records, 'total': len(self.derived_records), 'page': 1, 'size': 10, 'pages': 1})
        if request.method == 'GET' and path.startswith(f'{ROOT}/conclusions/'):
            record = self.records.get(path.rsplit('/', 1)[-1])
            return httpx.Response(200 if record else 404, json=record or {'message': 'not found'})
        if path == f'{ROOT}/conclusions' and request.method == 'POST':
            if self.fail_create:
                return httpx.Response(503, json={'message': 'ambiguous write'})
            item = {**body['conclusions'][0], 'id': 'new-correction', 'level': 'explicit', 'created_at': STAMP}
            self.records[item['id']] = item
            return httpx.Response(200, json=[item])
        if path == f'{ROOT}/peers/agent/chat':
            if self.fail_chat:
                return httpx.Response(503, json={'message': 'synthetic reasoning failure'})
            return httpx.Response(200, json={'content': 'Synthetic answer.', 'evidence': self.evidence if body.get('include_evidence') else None})
        return self.fixture.handle(request)

    def collect(self, name, **values):
        classes = {'conclusion_search': 'ConclusionSearchRequest', 'capabilities': 'SnapshotRequest', 'conclusion_detail': 'ConclusionDetailRequest', 'ask': 'AskRequest', 'correction_ticket': 'CorrectionTicketRequest', 'correction': 'CorrectionRequest'}
        self.assertTrue(hasattr(plugin_api, '_collect_' + name), f'{name} collector must exist')
        request = getattr(plugin_api, classes[name])(stored_session_id='fixture-hermes', **values)
        return getattr(plugin_api, '_collect_' + name)(request, config_factory=lambda: self.fixture.config, client_factory=lambda _: self.fixture.client, session_metadata_loader=lambda _: {})

    def test_semantic_search_preserves_pair_and_session_scope(self):
        result = self.collect('conclusion_search', query='preferences', scope='current', limit=7)
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['items'][0]['id'], 'conclusion-fixture')
        body = next(body for _, path, body in self.extra_calls if path.endswith('/conclusions/query'))
        self.assertEqual(body['filters']['session_id'], SESSION)
        self.assertEqual(body['top_k'], 7)
        self.assertIsNone(result['total'])

    def test_semantic_search_rejects_wrong_pair(self):
        self.bad_pair = True
        result = self.collect('conclusion_search', query='preferences')
        self.assertFalse(result['ok'])
        self.assertEqual(result['items'], [])

    def test_detail_uses_exact_pair_filtered_read_without_creation(self):
        result = self.collect('conclusion_detail', conclusion_id='conclusion-fixture')
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['item']['id'], 'conclusion-fixture')
        self.assertEqual(result['item']['observer_id'], 'agent')

    def test_provenance_reads_only_one_relationship_bound_level(self):
        self.records['premise-fixture'] = {**self.fixture.conclusion, 'id': 'premise-fixture', 'source_ids': []}
        self.derived_records = [{**self.fixture.conclusion, 'id': 'derived-fixture', 'source_ids': ['conclusion-fixture']}]
        result = self.collect('conclusion_detail', conclusion_id='conclusion-fixture')
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['errors'], [])
        if result['capabilities']['derived']:
            self.assertEqual([item['id'] for item in result['parents']], ['premise-fixture'])
            self.assertEqual([item['id'] for item in result['derived']], ['derived-fixture'])
            exact_ids = [body['filters']['id'] for _, path, body in self.extra_calls if path.endswith('/conclusions/list') and body.get('filters', {}).get('id')]
            self.assertEqual(exact_ids, ['conclusion-fixture', 'premise-fixture'])
        else:
            self.assertEqual(result['parents'], [])
            self.assertEqual(result['derived'], [])

    def test_broken_provenance_preserves_original_and_omits_unrelated_children(self):
        self.derived_records = [{**self.fixture.conclusion, 'id': 'unrelated-child', 'source_ids': []}]
        result = self.collect('conclusion_detail', conclusion_id='conclusion-fixture')
        self.assertEqual(result['item']['id'], 'conclusion-fixture')
        self.assertEqual(result['derived'], [])
        if result['capabilities']['derived']:
            self.assertEqual(result['state'], 'partial')
            self.assertEqual({error['scope'] for error in result['errors']}, {'provenance.parent', 'provenance.derived'})

    def test_missing_detail_is_not_an_unrelated_first_record(self):
        result = self.collect('conclusion_detail', conclusion_id='missing')
        self.assertFalse(result['ok'])
        self.assertIsNone(result['item'])

    def test_capabilities_do_not_trigger_reasoning_or_writes(self):
        result = self.collect('capabilities')
        self.assertTrue(result['capabilities']['conclusion_search'])
        self.assertTrue(result['capabilities']['ask'])
        self.assertTrue(result['capabilities']['correction'])
        self.assertFalse(any(path.endswith('/chat') or path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls))

    def test_ask_scopes_reasoning_to_the_configured_pair_and_session(self):
        result = self.collect('ask', query='What do we know?', scope='session', reasoning_level='low')
        self.assertTrue(result['ok'], result)
        self.assertEqual(result['answer'], 'Synthetic answer.')
        body = next(body for _, path, body in self.extra_calls if path.endswith('/chat'))
        self.assertEqual(body['session_id'], SESSION)
        self.assertEqual(body['target'], 'human')
        self.assertEqual(body['reasoning_level'], 'low')

    def test_reasoning_failure_does_not_retry_or_mutate_shared_sdk_policy(self):
        self.fixture.client._http.max_retries = 2
        self.fail_chat = True
        result = self.collect('ask', query='What do we know?')
        self.assertFalse(result['ok'])
        self.assertEqual(sum(path.endswith('/chat') for _, path, _ in self.extra_calls), 1)
        self.assertEqual(self.fixture.client._http.max_retries, 2)

    def test_correction_requires_ticket_and_verifies_exact_created_content(self):
        ticket = self.collect('correction_ticket', content='Use concise answers.', source_conclusion_id='conclusion-fixture')
        self.assertTrue(ticket['ok'], ticket)
        self.assertFalse(any(path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls))
        result = self.collect('correction', ticket=ticket['ticket'])
        self.assertTrue(result['verified'], result)
        self.assertEqual(result['outcome'], 'verified')
        self.assertEqual(result['item']['content'], 'Use concise answers.')
        replay = self.collect('correction', ticket=ticket['ticket'])
        self.assertFalse(replay['verified'])
        self.assertEqual(sum(path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls), 1)

    def test_correction_changed_target_is_rejected_before_write(self):
        ticket = self.collect('correction_ticket', content='Use concise answers.')
        self.fixture.config.ai_peer = 'human'
        result = self.collect('correction', ticket=ticket['ticket'])
        self.assertEqual(result['outcome'], 'rejected')
        self.assertFalse(any(path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls))

    def test_correction_ambiguous_write_has_no_sdk_retry(self):
        self.fixture.client._http.max_retries = 2
        ticket = self.collect('correction_ticket', content='Use concise answers.')
        self.fail_create = True
        result = self.collect('correction', ticket=ticket['ticket'])
        self.assertEqual(result['outcome'], 'unknown')
        self.assertFalse(result['verified'])
        self.assertEqual(sum(path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls), 1)
        self.assertEqual(self.fixture.client._http.max_retries, 2)

    def test_correction_failed_readback_is_unknown_not_success(self):
        ticket = self.collect('correction_ticket', content='Use concise answers.')
        self.fail_readback = True
        result = self.collect('correction', ticket=ticket['ticket'])
        self.assertEqual(result['outcome'], 'unknown')
        self.assertFalse(result['verified'])

    def test_requested_evidence_is_supported_or_explicitly_rejected(self):
        available = self.collect('capabilities')['capabilities']['ask_evidence']
        result = self.collect('ask', query='Which fact?', include_evidence=True)
        if available:
            self.assertTrue(result['ok'], result)
            self.assertEqual(result['evidence']['conclusions'][0]['id'], 'conclusion-fixture')
        else:
            self.assertEqual(result['state'], 'unsupported_sdk')
            self.assertFalse(any(path.endswith('/chat') for _, path, _ in self.extra_calls))

    def test_failed_optional_evidence_keeps_the_answer(self):
        with patch.object(plugin_api, '_workbench_capabilities', return_value={'ask': True, 'ask_evidence': True}), \
             patch.object(plugin_api, '_reasoning_evidence', side_effect=ValueError('Malformed evidence')):
            observer = SimpleNamespace(chat=lambda *a, **k: SimpleNamespace(content='Valid answer.', evidence={}))
            base = {'ok': True, 'session_id': SESSION, 'target': {'observed_id': 'human'}, 'errors': []}
            with patch.object(plugin_api, '_workbench_target', return_value=(base, self.fixture.client, observer, object())):
                result = self.collect('ask', query='Which fact?', include_evidence=True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['answer'], 'Valid answer.')
        self.assertEqual(result['state'], 'partial')

    def test_evidence_from_another_relationship_is_omitted(self):
        record = SimpleNamespace(**{**self.fixture.conclusion, 'observed_id': 'other'})
        result = {'session_id': SESSION, 'target': {'observer_id': 'agent', 'observed_id': 'human'}, 'errors': []}
        evidence = plugin_api._reasoning_evidence(SimpleNamespace(conclusions=[record]), result, True)
        self.assertEqual(evidence['conclusions'], [])
        self.assertTrue(result['errors'])

    def test_missing_or_disconnected_target_never_asks_or_writes(self):
        for state in ('missing', 'disconnected'):
            self.extra_calls.clear()
            self.fixture.session_exists = state != 'missing'
            if state == 'disconnected':
                self.fixture.failures['/v3/workspaces/list'] = 503
            for name, args in [('capabilities', {}), ('ask', {'query': 'fact'}), ('correction_ticket', {'content': 'fact'}), ('conclusion_search', {'query': 'fact'})]:
                self.assertFalse(self.collect(name, **args)['ok'])
            self.assertFalse(any(path.endswith('/chat') or path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls))

    def test_expired_or_focus_mismatched_tickets_are_consumed_without_writing(self):
        ticket = self.collect('correction_ticket', content='Fact.')['ticket']
        with patch.object(plugin_api.time, 'time', return_value=10**12):
            self.assertEqual(self.collect('correction', ticket=ticket)['state'], 'ticket_expired')
        ticket = self.collect('correction_ticket', content='Fact.')['ticket']
        self.assertEqual(self.collect('correction', ticket=ticket, cwd='/other')['state'], 'ticket_mismatch')
        self.assertEqual(self.collect('correction', ticket=ticket)['state'], 'ticket_expired')
        self.assertFalse(any(path == f'{ROOT}/conclusions' for _, path, _ in self.extra_calls))

    def test_new_request_models_reject_malformed_and_extra_input(self):
        for cls, values in [
            (plugin_api.AskRequest, {'query': ' '}),
            (plugin_api.AskRequest, {'query': 'fact', 'scope': 'all'}),
            (plugin_api.AskRequest, {'query': 'fact', 'reasoning_level': 'invented'}),
            (plugin_api.ConclusionSearchRequest, {'query': 'fact', 'limit': 51}),
            (plugin_api.ConclusionDetailRequest, {'conclusion_id': '../other'}),
            (plugin_api.CorrectionTicketRequest, {'content': ' '}),
            (plugin_api.CorrectionTicketRequest, {'content': 'x' * 4001}),
            (plugin_api.CorrectionRequest, {'ticket': 'fixture', 'content': 'injected'}),
        ]:
            with self.subTest(cls=cls, values=values), self.assertRaises(ValueError):
                cls(**values)
