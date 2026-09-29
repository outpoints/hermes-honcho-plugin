import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const script = fileURLToPath(new URL('../scripts/check.sh', import.meta.url))

function run({ managed = false, legacy = false, override, exit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'honcho-check-'))
  const bin = join(root, 'bin')
  mkdirSync(bin)
  const log = join(root, 'calls')
  const executable = (name, body) => writeFileSync(join(bin, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  executable('node', 'exit 0') // Do not recursively run this suite.
  executable('python3', `printf 'fallback %s\\n' "$*" >> "$CALL_LOG"; exit ${exit}`)
  if (managed) executable('hermes', `if [ "$1" = --print-runtime-command ]; then printf '[]\\n'; exit 0; fi\nprintf 'managed %s\\n' "$*" >> "$CALL_LOG"; exit ${exit}`)
  if (legacy) {
    executable('hermes', 'exit 2')
    executable('python', `printf 'legacy %s\\n' "$*" >> "$CALL_LOG"; exit ${exit}`)
  }
  if (override === 'valid') executable('override-python', 'printf "override %s\\n" "$*" >> "$CALL_LOG"')
  const env = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, CALL_LOG: log }
  delete env.HERMES_PYTHON
  if (override) env.HERMES_PYTHON = join(bin, override === 'valid' ? 'override-python' : 'missing-python')
  try {
    const result = spawnSync('/bin/bash', [script], { env, encoding: 'utf8' })
    let calls = ''
    try { calls = readFileSync(log, 'utf8') } catch {}
    return { ...result, calls }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('check runner uses the managed Hermes environment, not a sibling Python', () => {
  const result = run({ managed: true })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.calls, /managed --run-module unittest discover/)
})

test('check runner retains legacy virtualenv discovery', () => {
  const result = run({ legacy: true })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.calls, /legacy -m unittest discover/)
})

test('explicit Python overrides automatic discovery', () => {
  const result = run({ managed: true, override: 'valid' })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.calls, /override -m unittest discover/)
  assert.doesNotMatch(result.calls, /managed/)
})

test('invalid explicit Python fails without falling back', () => {
  const result = run({ managed: true, override: 'invalid' })
  assert.notEqual(result.status, 0)
  assert.equal(result.calls, '')
  assert.match(result.stderr, /HERMES_PYTHON/)
})

test('no Hermes launcher falls back to Python on PATH', () => {
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.calls, /fallback -m unittest discover/)
})

test('managed test failures propagate without retrying another interpreter', () => {
  const result = run({ managed: true, exit: 7 })
  assert.equal(result.status, 7)
  assert.doesNotMatch(result.calls, /fallback|legacy/)
})
