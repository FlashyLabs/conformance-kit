#!/usr/bin/env node
// Run a conformance corpus against any executable, in any language.
//
// A specification is implementable by a stranger only if its corpus is
// runnable by one. Ours ship as data precisely so an implementation in any
// language can prove it agrees without importing anything of ours — and until
// this existed, "prove it agrees" still meant *write a harness first*, which
// is a week of somebody's judgement about what we meant before they can find
// out whether they were right.
//
// The protocol is one JSON object per line in, one per line out. That is the
// whole interface, it needs no bindings, and it works with anything that can
// read stdin: a Rust binary, a Python script, a shell pipeline, `jq`.
//
//     in   { "id": "no-rung-zero", "set": "doors", "input": {…}, "context": {…}? }
//     out  { "id": "no-rung-zero", "valid": false, "codes": ["no-rung-zero"] }
//
// ── Four outcomes, not two ─────────────────────────────────────────────────
//
// An implementation that **never answers** a case has not answered it wrongly,
// and the two need opposite fixes: one is a bug in the judgement, the other is
// a crash, a hang, or a case the program did not recognise. Collapsing them
// would let a program that dies halfway through report as merely inaccurate.
//
//   agreed     the verdict matches, and the codes match where the case expects them
//   disagreed  it answered, and the answer is wrong
//   unanswered it produced no verdict for that case
//   unreadable it produced a line that is not a verdict
//
// `unanswered` and `unreadable` are counted separately and never folded into a
// score, for the same reason `unreachable` and `refused` are separate
// everywhere else here: a ratio computed over them is a fiction.
//
// ── Codes are compared only where the case expects them ────────────────────
//
// A corpus case that names its diagnostics is asserting them; one that does
// not is asserting the verdict alone. Comparing codes a case never expected
// would fail every implementation that words its errors differently, which is
// not a conformance question — it is a translation.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

/** A corpus, from a path or a URL. Nothing else is guessed at. */
export async function loadCorpus(where, { fetchImpl = fetch } = {}) {
  if (/^https?:\/\//.test(where)) {
    const res = await fetchImpl(where)
    if (!res.ok) throw new Error(`${where} answered ${res.status}`)
    return res.json()
  }
  return JSON.parse(readFileSync(where, 'utf8'))
}

/**
 * Set kinds a runner can put a question to, and what the answer must carry.
 *
 * `validate` asks whether a document is acceptable, and the answer is a
 * boolean. `decide` asks which of a closed, DECLARED set of outcomes applies,
 * and the answer is one of them.
 *
 * ── Why `decide` exists ────────────────────────────────────────────────────
 *
 * `policy-guard/1` grades a spend as ALLOW, ESCALATE or DENY. Folded into a
 * boolean, ALLOW and ESCALATE become the same answer — and the difference
 * between them is a human being asked before a signature happens, which is the
 * entire point of the profile. A corpus that cannot express "this must
 * escalate, not allow" is a corpus that cannot check the thing worth checking.
 *
 * The alternative on offer was `opaque`: carried in the corpus' own shape, and
 * readable only with the package that owns the profile. That is a corpus a
 * stranger cannot run, which defeats the reason corpora are published at all.
 *
 * The vocabulary travels IN the bundle, as `set.outcomes`. An implementer needs
 * nothing from us to know what answers are legal.
 */
export const SET_KINDS = Object.freeze(['validate', 'decide'])

/** The set kinds this runner understands, since 0.2.0. */
export const DECIDE_SETS_SINCE = '0.2.0'

/** Every case a runner can actually put a question to. */
export function runnableCases(corpus) {
  const cases = []
  const skipped = []
  for (const set of corpus?.sets ?? []) {
    if (!SET_KINDS.includes(set.kind)) {
      skipped.push({ set: set.name, cases: set.cases?.length ?? 0, why: set.about ?? 'not an accept/refuse set' })
      continue
    }
    // A `decide` set that names no vocabulary is refused rather than guessed
    // at: without it an implementer cannot know which answers are legal, and a
    // runner comparing free strings would call a typo a disagreement.
    if (set.kind === 'decide' && !Array.isArray(set.outcomes)) {
      skipped.push({ set: set.name, cases: set.cases?.length ?? 0, why: 'a decide set must declare its `outcomes` vocabulary' })
      continue
    }
    for (const c of set.cases) cases.push({ ...c, set: set.name, kind: set.kind, outcomes: set.outcomes })
  }

  // ── Ids are unique across the BUNDLE, not within a set ───────────────────
  //
  // Answers come back keyed by id alone, because the protocol's whole appeal
  // is that an implementation echoes an id and nothing else. Two cases sharing
  // one id therefore means the second answer silently overwrites the first,
  // and the first case is then judged against an answer to a different
  // question — reported as `unreadable`, which sends the reader looking for a
  // bug in their program that is not there.
  //
  // Found by the first corpus to carry two set kinds: `records/not-an-object`
  // and `envelope-shape/not-an-object` were both reasonable names inside their
  // own set. Refused here rather than deduplicated, because a corpus with two
  // cases under one id has a defect the author needs to fix, and picking one
  // silently is how a runner reports a clean pass over a broken corpus.
  const seen = new Map()
  const duplicates = []
  for (const c of cases) {
    if (seen.has(c.id)) duplicates.push({ id: c.id, sets: [seen.get(c.id), c.set] })
    else seen.set(c.id, c.set)
  }
  if (duplicates.length) {
    const named = duplicates.map((d) => `${d.id} (${d.sets.join(', ')})`).join('; ')
    throw new Error(`corpus has ${duplicates.length} duplicate case id(s), which would make answers overwrite each other: ${named}`)
  }

  return { cases, skipped }
}

/**
 * Compare one expectation against one answer.
 *
 * Exported because it is the part somebody writing a runner in another
 * language has to get right, and because its rules are easier to check than to
 * describe.
 */
export function judge(expected, answer, { outcomes } = {}) {
  if (answer === undefined) return { state: 'unanswered' }

  // A `decide` expectation names a verdict; a `validate` one names a boolean.
  // The expectation decides which question was asked, never the answer — an
  // implementation that replies with the wrong shape is UNREADABLE, which is a
  // different finding from replying with the wrong answer.
  if (typeof expected?.verdict === 'string') {
    if (typeof answer?.verdict !== 'string') return { state: 'unreadable', got: answer }
    if (Array.isArray(outcomes) && !outcomes.includes(answer.verdict))
      return { state: 'unreadable', got: answer, why: `${answer.verdict} is not one of ${outcomes.join(', ')}` }
    if (answer.verdict !== expected.verdict)
      return { state: 'disagreed', why: `expected ${expected.verdict}, got ${answer.verdict}` }
    return codesAgree(expected, answer)
  }

  if (typeof answer?.valid !== 'boolean') return { state: 'unreadable', got: answer }
  if (answer.valid !== expected.valid)
    return { state: 'disagreed', why: `expected valid=${expected.valid}, got valid=${answer.valid}` }
  return codesAgree(expected, answer)
}

/**
 * Codes are compared only where the case states them, and extra codes pass.
 *
 * Policing the full set would fail every implementation that reports one more
 * thing than ours does, which is advice dressed as a conformance failure.
 */
function codesAgree(expected, answer) {
  if (Array.isArray(expected.codes)) {
    const got = Array.isArray(answer.codes) ? answer.codes : []
    const missing = expected.codes.filter((c) => !got.includes(c))
    if (missing.length) return { state: 'disagreed', why: `missing code(s): ${missing.join(', ')}` }
  }
  return { state: 'agreed' }
}

/**
 * Put every case to a command and collect what it said.
 *
 * The command is spawned once and streamed, rather than started per case: a
 * corpus of 149 cases against a process that takes 200ms to boot is 30 seconds
 * of waiting for nothing, and a slow harness is a harness nobody runs twice.
 */
export async function ask(cases, command, args, { timeoutMs = 60000, spawnImpl = spawn } = {}) {
  const child = spawnImpl(command, args, { stdio: ['pipe', 'pipe', 'inherit'] })
  const answers = new Map()
  const extra = []

  const done = new Promise((resolve, reject) => {
    const rl = createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      const text = line.trim()
      if (!text) return
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch {
        // A line that is not JSON is the program talking to a human — a log, a
        // banner, a warning. Recorded, never treated as a verdict.
        extra.push(text)
        return
      }
      if (parsed?.id === undefined) {
        extra.push(text)
        return
      }
      answers.set(parsed.id, parsed)
    })
    child.on('error', reject)
    child.on('close', () => resolve())
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`the command produced no more output for ${timeoutMs}ms — killed`))
    }, timeoutMs)
    timer.unref?.()
    child.on('close', () => clearTimeout(timer))
  })

  for (const c of cases) {
    child.stdin.write(`${JSON.stringify({ id: c.id, set: c.set, input: c.input, ...(c.context ? { context: c.context } : {}) })}\n`)
  }
  child.stdin.end()
  await done
  return { answers, extra }
}

export function report(cases, answers) {
  const rows = cases.map((c) => ({ id: c.id, set: c.set, why: c.why, ...judge(c.expect, answers.get(c.id), { outcomes: c.outcomes }) }))
  const count = (state) => rows.filter((r) => r.state === state).length
  return {
    rows,
    agreed: count('agreed'),
    disagreed: count('disagreed'),
    unanswered: count('unanswered'),
    unreadable: count('unreadable'),
    total: rows.length,
  }
}

const RUN = import.meta.url === `file://${process.argv[1]}`
if (RUN) {
  const argv = process.argv.slice(2)
  const split = argv.indexOf('--')
  if (split === -1 || split === 0 || split === argv.length - 1) {
    process.stderr.write(
      '\n  conformance-kit <corpus-url-or-path> -- <command> [args...]\n\n' +
        '  The command reads one JSON object per line on stdin and writes one\n' +
        '  per line on stdout: { id, valid, codes? }.\n\n' +
        '  The corpus is a path or a URL. A path needs no network, and the\n' +
        '  examples directory ships one:\n\n' +
        '  e.g. conformance-kit examples/frontdoor-1.json -- ./my-validator\n\n',
    )
    process.exit(2)
  }

  const corpus = await loadCorpus(argv[0])
  const [command, ...args] = argv.slice(split + 1)
  const { cases, skipped } = runnableCases(corpus)

  if (!cases.length) {
    process.stderr.write(`\n  ${argv[0]} holds no accept/refuse cases — nothing to run\n\n`)
    process.exit(2)
  }

  const { answers, extra } = await ask(cases, command, args)
  const r = report(cases, answers)

  process.stdout.write(`\n  ${corpus.profile ?? 'corpus'} — ${command}\n\n`)
  for (const row of r.rows.filter((x) => x.state !== 'agreed')) {
    process.stdout.write(`    ${row.state.padEnd(11)} ${row.set}/${row.id}\n`)
    if (row.why) process.stdout.write(`                ${row.why.slice(0, 96)}\n`)
  }
  process.stdout.write(`\n    agreed       ${r.agreed} of ${r.total}\n`)
  if (r.disagreed) process.stdout.write(`    disagreed    ${r.disagreed}\n`)
  // Never folded into the score: a case nobody answered is not a case answered
  // wrongly, and the two need opposite fixes.
  if (r.unanswered) process.stdout.write(`    unanswered   ${r.unanswered}  (no verdict produced)\n`)
  if (r.unreadable) process.stdout.write(`    unreadable   ${r.unreadable}  (a line that is not a verdict)\n`)
  for (const s of skipped) process.stdout.write(`    skipped      ${s.set} (${s.cases}) — ${s.why.slice(0, 70)}\n`)
  if (extra.length) process.stdout.write(`    ${extra.length} non-verdict line(s) on stdout, ignored\n`)
  process.stdout.write('\n')

  process.exit(r.agreed === r.total ? 0 : 1)
}
