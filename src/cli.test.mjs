/**
 * Two guards against defects that passed every check before them.
 *
 * 1. The version marker cannot name a version this package has not reached.
 *    `DECIDE_SETS_SINCE` said `0.2.0` while the package was an unreleased
 *    0.1.0 — a behaviour marker pointing at a release that never shipped, and
 *    a claim that `decide` arrived in a version AFTER a 0.1.0 that went out
 *    without it, when in fact `decide` is present from the first release. A
 *    version in prose is exactly the kind of number that rots silently; this
 *    ties it to package.json and to the feature actually being runnable.
 *
 * 2. The `bin` is a wrapper, not a copy. `src/cli.mjs` was once a byte-for-byte
 *    duplicate of `conformance-run.mjs`, and the drift test guards only the
 *    twin — so the file behind the command users run could rot line by line
 *    with nothing red. It imports the runner now; these tests fail if the copy
 *    ever comes back, and prove the command is still wired to the shared code.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { DECIDE_SETS_SINCE, SET_KINDS, runnableCases } from './conformance-run.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = dirname(HERE)
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

/** Compare two `major.minor.patch` cores. -1 if a<b, 0 if equal, 1 if a>b. */
function cmpVersion(a, b) {
  const core = (v) => v.split('-')[0].split('.').map((n) => Number(n))
  const [pa, pb] = [core(a), core(b)]
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x < y ? -1 : 1
  }
  return 0
}

describe('the decide version marker is a floor, not a phantom', () => {
  test('it parses as a version', () => {
    assert.match(DECIDE_SETS_SINCE, /^\d+\.\d+\.\d+/, `not a version: ${DECIDE_SETS_SINCE}`)
  })

  test('it does not name a version this package has not reached', () => {
    // The exact bug: `0.2.0` while the package is `0.1.0`. A marker for a
    // feature that is present NOW cannot cite a version that has not shipped.
    assert.ok(
      cmpVersion(DECIDE_SETS_SINCE, pkg.version) <= 0,
      `DECIDE_SETS_SINCE (${DECIDE_SETS_SINCE}) is ahead of package version (${pkg.version}) — a phantom release`,
    )
  })

  test('the feature the marker dates is actually present', () => {
    // Tie the number to the behaviour, so the marker cannot claim `decide`
    // exists since some version while `decide` does not work.
    assert.ok(SET_KINDS.includes('decide'), 'SET_KINDS does not include decide')
    const { cases, skipped } = runnableCases({
      sets: [{ name: 's', kind: 'decide', outcomes: ['A', 'B'], cases: [{ id: 'x', input: {}, expect: { verdict: 'A' } }] }],
    })
    assert.equal(cases.length, 1, 'a declared decide set is not runnable')
    assert.equal(skipped.length, 0)
  })
})

describe('the bin is a thin wrapper over the runner, never a copy of it', () => {
  const CLI = join(HERE, 'cli.mjs')
  const cli = readFileSync(CLI, 'utf8')

  test('it imports the driver rather than redefining it', () => {
    assert.match(cli, /import\s*\{[^}]*\brunCli\b[^}]*\}\s*from\s*['"]\.\/conformance-run\.mjs['"]/)
  })

  test('it does not carry a second copy of the runner', () => {
    // The functions that define the runner live in conformance-run.mjs. If any
    // of them reappears as a definition here, the copy is back and the drift
    // test that guards the twin still cannot see it.
    for (const fn of ['runnableCases', 'function judge', 'function ask', 'function report', 'function loadCorpus']) {
      assert.ok(!cli.includes(fn), `cli.mjs defines ${fn} — it is a copy of the runner again, not a wrapper`)
    }
    // A wrapper is short. The old copy was ~12.8 KB; the real interface is a
    // few lines. This is a coarse tripwire, not a style rule.
    assert.ok(cli.length < 2000, `cli.mjs is ${cli.length} bytes — too large to be a wrapper`)
  })

  test('the command is still wired to the shared runner (exit 0 on agreement)', () => {
    // Behaviour, not just shape: run the actual bin against the decide example
    // and confirm it drives the same pipeline to the same result.
    const out = execFileSync(process.execPath, [CLI, join(ROOT, 'examples', 'policy-guard-1.json'), '--', process.execPath, join(ROOT, 'examples', 'policy-guard.mjs')], { encoding: 'utf8' })
    assert.match(out, /agreed\s+6 of 6/)
  })

  test('and exits non-zero when the corpus and the program disagree', () => {
    // always-valid.mjs answers booleans to a decide corpus: every row is
    // unreadable, the run is not all-agreed, and the bin must exit non-zero.
    assert.throws(
      () => execFileSync(process.execPath, [CLI, join(ROOT, 'examples', 'policy-guard-1.json'), '--', process.execPath, join(ROOT, 'examples', 'always-valid.mjs')], { encoding: 'utf8', stdio: 'pipe' }),
      (err) => err.status === 1,
    )
  })

  test('usage with no command exits 2, the same as the runner', () => {
    assert.throws(
      () => execFileSync(process.execPath, [CLI], { encoding: 'utf8', stdio: 'pipe' }),
      (err) => err.status === 2,
    )
  })
})
