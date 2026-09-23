/**
 * The runner, and the difference between wrong and absent.
 *
 * A conformance runner has one temptation: score everything. An implementation
 * that crashed halfway, one that printed a banner, and one that judged a
 * document wrongly all end up as "not agreed" — and they need three different
 * fixes. Folding them into a percentage makes a program that died look merely
 * inaccurate, which is the most expensive possible way to be wrong about
 * somebody else's implementation.
 *
 * So `judge` returns four states and the report counts them apart, and the
 * tests below are mostly about the three that are not `agreed`.
 *
 * The end-to-end case runs the estate's own `frontdoor/1` corpus against the
 * estate's own validator, which is the only test here that would catch the
 * corpus and the runner disagreeing about what a case means.
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ask, judge, loadCorpus, report, runnableCases } from './conformance-run.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const CORPUS = join(ROOT, 'apps/marketing/public/.well-known/conformance/frontdoor-1.json')
const DIST = join(ROOT, 'packages/frontdoor/dist/index.mjs')

/** A tiny implementation-under-test, as a real program on a real stdin. */
function program(body) {
  const file = join(mkdtempSync(join(tmpdir(), 'impl-')), 'impl.mjs')
  writeFileSync(
    file,
    `import { createInterface } from 'node:readline'\n` +
      `const rl = createInterface({ input: process.stdin })\n` +
      `rl.on('line', async (line) => { if (!line.trim()) return; const msg = JSON.parse(line); ${body} })\n`,
  )
  return file
}

describe('four outcomes, because three of them are not "wrong"', () => {
  test('a matching verdict agrees', () => {
    assert.deepEqual(judge({ valid: true }, { id: 'a', valid: true }), { state: 'agreed' })
  })

  test('a different verdict disagrees, and says which way', () => {
    assert.match(judge({ valid: false }, { id: 'a', valid: true }).why, /expected valid=false/)
  })

  test('no answer at all is unanswered, never disagreed', () => {
    // The distinction that matters. A program that crashed on case 40 has not
    // judged cases 41 to 149 incorrectly — it has not judged them.
    assert.deepEqual(judge({ valid: true }, undefined), { state: 'unanswered' })
  })

  test('an answer with no verdict is unreadable, never unanswered', () => {
    // A third state, because "you replied with something I cannot read" and
    // "you did not reply" point at different bugs in the implementation.
    assert.equal(judge({ valid: true }, { id: 'a', result: 'ok' }).state, 'unreadable')
  })
})

describe('codes are compared only where the case expects them', () => {
  test('a case expecting codes requires them', () => {
    assert.match(judge({ valid: false, codes: ['no-rung-zero'] }, { id: 'a', valid: false }).why, /missing code/)
  })

  test('extra codes are allowed — the case asserts what it names, not the whole set', () => {
    assert.equal(judge({ valid: false, codes: ['a'] }, { id: 'x', valid: false, codes: ['a', 'b'] }).state, 'agreed')
  })

  test('a case expecting no codes does not police an implementation’s wording', () => {
    // Otherwise every implementation that words its errors differently fails,
    // which is a translation question rather than a conformance one.
    assert.equal(judge({ valid: false }, { id: 'x', valid: false, codes: ['whatever-we-call-it'] }).state, 'agreed')
  })
})

describe('only the accept/refuse sets are put to a command', () => {
  test('an opaque set is skipped with its reason, not failed', () => {
    const { cases, skipped } = runnableCases({
      sets: [
        { name: 'doors', kind: 'validate', cases: [{ id: 'a', expect: { valid: true } }] },
        { name: 'readings', kind: 'opaque', cases: [{ id: 'b' }], about: 'needs the package' },
      ],
    })
    assert.deepEqual(cases.map((c) => c.id), ['a'])
    assert.deepEqual(skipped, [{ set: 'readings', cases: 1, why: 'needs the package' }])
  })

  test('a corpus with no sets yields nothing rather than throwing', () => {
    assert.deepEqual(runnableCases({}).cases, [])
  })
})

describe('talking to a real program', () => {
  const cases = [
    { id: 'one', set: 's', input: { a: 1 }, expect: { valid: true } },
    { id: 'two', set: 's', input: 'nope', expect: { valid: false } },
  ]

  test('a correct implementation agrees with every case', async () => {
    const impl = program(
      `const ok = msg.input !== null && typeof msg.input === 'object'; process.stdout.write(JSON.stringify({ id: msg.id, valid: ok }) + '\\n')`,
    )
    const { answers } = await ask(cases, process.execPath, [impl])
    assert.equal(report(cases, answers).agreed, 2)
  })

  test('a program that answers nothing is unanswered, not disagreed', async () => {
    const impl = program(`/* silence */`)
    const { answers } = await ask(cases, process.execPath, [impl])
    const r = report(cases, answers)
    assert.equal(r.unanswered, 2)
    assert.equal(r.disagreed, 0)
  })

  test('a banner on stdout is ignored rather than read as a verdict', async () => {
    // Programs print things. A runner that treated the first line of output as
    // an answer would fail every implementation with a startup message.
    const impl = program(
      `process.stdout.write('my-validator v2\\n'); process.stdout.write(JSON.stringify({ id: msg.id, valid: typeof msg.input === 'object' }) + '\\n')`,
    )
    const { answers, extra } = await ask(cases, process.execPath, [impl])
    assert.equal(report(cases, answers).agreed, 2)
    assert.deepEqual([...new Set(extra)], ['my-validator v2'])
  })

  test('the cases are streamed to one process, not one process per case', async () => {
    // 149 cases against a program that takes 200ms to start is half a minute
    // of waiting for nothing, and a slow harness is one nobody runs twice.
    const impl = program(
      `process.stdout.write(JSON.stringify({ id: msg.id, valid: true, pid: process.pid }) + '\\n')`,
    )
    const { answers } = await ask(cases, process.execPath, [impl])
    assert.equal(new Set([...answers.values()].map((a) => a.pid)).size, 1)
  })
})

describe('the corpus and the reference implementation agree', () => {
  test(
    'every frontdoor/1 case passes against the package that defines it',
    { skip: !existsSync(DIST) && 'build @flashyos/frontdoor first' },
    async () => {
      // The only test here that would catch the corpus and the validator
      // drifting apart. It is also how the `valid means no ERRORS` sentence
      // got into the bundle: the first adapter written for this scored 26 of
      // 27, treating a warning as a refusal — the exact conflation an outside
      // implementer would make, found in five minutes.
      const impl = program(
        `const { validate } = await import(${JSON.stringify(DIST)});` +
          `const problems = validate(msg.input).filter((p) => p.level !== 'warning');` +
          `process.stdout.write(JSON.stringify({ id: msg.id, valid: problems.length === 0, codes: problems.map((p) => p.code) }) + '\\n')`,
      )
      const corpus = await loadCorpus(CORPUS)
      const { cases } = runnableCases(corpus)
      assert.ok(cases.length >= 20, `only ${cases.length} cases — the corpus is not the one expected`)
      const { answers } = await ask(cases, process.execPath, [impl])
      const r = report(cases, answers)
      const failed = r.rows.filter((x) => x.state !== 'agreed').map((x) => `${x.id}: ${x.state} ${x.why ?? ''}`)
      assert.deepEqual(failed, [], `the reference implementation does not pass its own corpus`)
    },
  )
})

describe('a decide set: three verdicts, not a boolean', () => {
  // `policy-guard/1` grades a spend ALLOW, ESCALATE or DENY. Folded into a
  // boolean, ALLOW and ESCALATE collapse — and the difference between them is
  // a human being asked before a signature happens, which is the profile's
  // entire subject. The alternative the bundle format offered was `opaque`:
  // readable only with the package that owns the profile, which is a corpus a
  // stranger cannot run.

  const set = {
    name: 'envelopes',
    kind: 'decide',
    outcomes: ['ALLOW', 'ESCALATE', 'DENY'],
    cases: [
      { id: 'under-ceiling', input: {}, expect: { verdict: 'ALLOW' } },
      { id: 'over-ceiling', input: {}, expect: { verdict: 'ESCALATE' } },
      { id: 'over-cap', input: {}, expect: { verdict: 'DENY', codes: ['PER_TX_CAP'] } },
    ],
  }

  test('its cases are runnable, and carry the vocabulary with them', () => {
    const { cases, skipped } = runnableCases({ sets: [set] })
    assert.equal(cases.length, 3)
    assert.equal(skipped.length, 0)
    // The vocabulary travels with the case: an implementer needs nothing from
    // us to know which answers are legal.
    assert.deepEqual(cases[0].outcomes, ['ALLOW', 'ESCALATE', 'DENY'])
  })

  test('a decide set with no declared vocabulary is refused, never guessed', () => {
    const { cases, skipped } = runnableCases({ sets: [{ ...set, outcomes: undefined }] })
    assert.equal(cases.length, 0)
    assert.match(skipped[0].why, /outcomes/)
  })

  test('the verdict is compared, and ALLOW never passes for ESCALATE', () => {
    assert.equal(judge({ verdict: 'ESCALATE' }, { id: 'x', verdict: 'ESCALATE' }).state, 'agreed')
    // The case this whole set kind exists for.
    assert.equal(judge({ verdict: 'ESCALATE' }, { id: 'x', verdict: 'ALLOW' }).state, 'disagreed')
  })

  test('an answer outside the declared vocabulary is unreadable, not disagreed', () => {
    // A different finding: a program answering `MAYBE` has not judged the case
    // wrongly, it has failed to speak the protocol — and `unreadable` enters
    // no ratio while `disagreed` does.
    const r = judge({ verdict: 'ALLOW' }, { id: 'x', verdict: 'MAYBE' }, { outcomes: ['ALLOW', 'ESCALATE', 'DENY'] })
    assert.equal(r.state, 'unreadable')
  })

  test('answering a decide case with a boolean is unreadable', () => {
    assert.equal(judge({ verdict: 'DENY' }, { id: 'x', valid: false }).state, 'unreadable')
  })

  test('the denial code is compared where the case states one', () => {
    assert.equal(judge({ verdict: 'DENY', codes: ['PER_TX_CAP'] }, { id: 'x', verdict: 'DENY', codes: ['PER_TX_CAP'] }).state, 'agreed')
    assert.equal(judge({ verdict: 'DENY', codes: ['PER_TX_CAP'] }, { id: 'x', verdict: 'DENY', codes: ['DAILY_CAP'] }).state, 'disagreed')
    // Extra codes pass: policing the full set fails every implementation that
    // reports one more thing than ours does.
    assert.equal(judge({ verdict: 'DENY', codes: ['PER_TX_CAP'] }, { id: 'x', verdict: 'DENY', codes: ['PER_TX_CAP', 'EXTRA'] }).state, 'agreed')
  })

  test('a validate corpus is judged exactly as before', () => {
    // The addition must not reach the corpora already published against it.
    assert.equal(judge({ valid: true }, { id: 'x', valid: true }).state, 'agreed')
    assert.equal(judge({ valid: false, codes: ['no-rung-zero'] }, { id: 'x', valid: false, codes: ['no-rung-zero'] }).state, 'agreed')
    assert.equal(judge({ valid: false }, { id: 'x', valid: true }).state, 'disagreed')
    assert.equal(judge({ valid: true }, { id: 'x', verdict: 'ALLOW' }).state, 'unreadable')
  })
})

describe('a corpus whose ids collide is refused, not deduplicated', () => {
  // Answers come back keyed by id alone. Two cases sharing one id means the
  // second answer overwrites the first, and the first is judged against an
  // answer to a different question — surfacing as `unreadable`, which sends
  // the reader hunting a bug in their own program that is not there.
  //
  // Found by the first corpus carrying two set kinds: `records/not-an-object`
  // and `envelope-shape/not-an-object`, each a reasonable name inside its own
  // set.

  const corpus = {
    sets: [
      { name: 'records', kind: 'decide', outcomes: ['ALLOW', 'DENY'], cases: [{ id: 'not-an-object', input: 1, expect: { verdict: 'DENY' } }] },
      { name: 'shape', kind: 'validate', cases: [{ id: 'not-an-object', input: 1, expect: { valid: false } }] },
    ],
  }

  test('it throws, and names both sets', () => {
    assert.throws(() => runnableCases(corpus), /duplicate case id/)
    assert.throws(() => runnableCases(corpus), /records, shape/)
  })

  test('the same id inside one set is caught too', () => {
    const one = { sets: [{ name: 'a', kind: 'validate', cases: [{ id: 'x', expect: { valid: true } }, { id: 'x', expect: { valid: false } }] }] }
    assert.throws(() => runnableCases(one), /duplicate case id/)
  })

  test('distinct ids pass, so the guard is not simply always throwing', () => {
    const ok = { sets: [{ name: 'a', kind: 'validate', cases: [{ id: 'x', expect: { valid: true } }, { id: 'y', expect: { valid: false } }] }] }
    assert.equal(runnableCases(ok).cases.length, 2)
  })
})
