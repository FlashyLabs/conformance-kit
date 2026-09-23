/**
 * Types for @flashyos/conformance-kit.
 *
 * Hand-written signatures over derived names: `types.test.mjs` imports the
 * real module and fails if this file declares an export the module does not
 * have, or omits one it does.
 */

/** One case as it goes out on stdin. */
export interface Case {
  id: string
  set: string
  input: unknown
  /** Present only where the profile judges a document against something else. */
  context?: unknown
  why?: string
  expect?: Expectation
}

/**
 * What a case expects.
 *
 * A `validate` set states `valid`; a `decide` set states `verdict`. The
 * expectation decides which question was asked — an implementation replying
 * with the wrong shape is `unreadable`, which is a different finding from
 * replying with the wrong answer.
 */
export interface Expectation {
  /** `true` means no ERRORS. A document drawing only warnings is valid. */
  valid?: boolean
  /** One of the set's declared `outcomes`, for a `decide` set. */
  verdict?: string
  /** Compared only when the case states them; extra codes are allowed. */
  codes?: string[]
}

/** One line back from the implementation under test. */
export interface Answer {
  id: string
  /** For a `validate` case. */
  valid?: boolean
  /** For a `decide` case: one of the set's declared `outcomes`. */
  verdict?: string
  codes?: string[]
}

/**
 * The set kinds a runner can put a question to.
 *
 * `validate` asks whether a document is acceptable. `decide` asks which of a
 * closed, DECLARED vocabulary of outcomes applies — for profiles whose answer
 * is not a boolean, such as `policy-guard/1`, where ALLOW and ESCALATE differ
 * by whether a human is asked before a signature happens.
 */
export declare const SET_KINDS: readonly ['validate', 'decide']

/** The version in which `decide` sets became runnable. */
export declare const DECIDE_SETS_SINCE: string

/**
 * Four outcomes, never two, and never folded into one score.
 *
 * A program that crashed on case 40 has not judged cases 41 onward wrongly —
 * it has not judged them. `unanswered` and `unreadable` enter no ratio.
 */
export type Verdict = 'agreed' | 'disagreed' | 'unanswered' | 'unreadable'

export interface CorpusSet {
  name: string
  kind: 'validate' | 'decide' | string
  /** Required on a `decide` set; a set without it is skipped, never guessed. */
  outcomes?: string[]
  about?: string
  cases: Case[]
}

export interface Corpus {
  contract: string
  profile: string
  version?: string
  sets: CorpusSet[]
  [key: string]: unknown
}

export interface Row {
  id: string
  set: string
  why?: string
  state: Verdict
  detail?: string
}

export interface Report {
  rows: Row[]
  agreed: number
  disagreed: number
  unanswered: number
  unreadable: number
  total: number
}

/** A URL or a path. Nothing here requires the network unless you pass a URL. */
export declare function loadCorpus(where: string, opts?: { fetchImpl?: typeof fetch }): Promise<Corpus>

/** The cases that carry an expectation, which are the only runnable ones. */
export declare function runnableCases(corpus: Corpus): Case[]

export declare function judge(
  expected: Expectation | undefined,
  answer: Answer | undefined,
  opts?: { outcomes?: string[] },
): { state: Verdict; detail?: string; why?: string }

/**
 * Spawn the command ONCE and stream every case to it.
 *
 * 149 cases against a 200ms boot is thirty seconds of waiting for nothing.
 * `extra` collects output that was not a verdict — programs print banners,
 * and a runner reading the first line as an answer would fail all of them.
 */
export declare function ask(
  cases: Case[],
  command: string,
  args?: string[],
  opts?: { timeoutMs?: number; spawnImpl?: unknown },
): Promise<{ answers: Map<string, Answer>; extra: string[] }>

export declare function report(cases: Case[], answers: Map<string, Answer>): Report
