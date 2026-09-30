#!/usr/bin/env node
// A conformant `decide` adapter: it grades a spend, it does not validate one.
//
// Where always-valid.mjs answers a boolean, this answers a VERDICT from a
// closed vocabulary — ALLOW, ESCALATE or DENY — because policy-guard/1 asks
// which of three things must happen, and the difference between ALLOW and
// ESCALATE is whether a human is asked before a signature. Run it against
// examples/policy-guard-1.json and every case agrees; that agreement is the
// end-to-end proof that a `decide` corpus is runnable by a stranger's program
// with nothing imported of ours.
import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of lines) {
  if (!line.trim()) continue
  const { id, input } = JSON.parse(line)
  const { amount, escalateAbove, perTxCap } = input

  // Above the hard cap, no human can wave it through: a DENY with the reason.
  // Above the ceiling but under the cap, a human is asked: ESCALATE, never
  // ALLOW. At or under the ceiling, it clears.
  let verdict = 'ALLOW'
  const codes = []
  if (amount > perTxCap) {
    verdict = 'DENY'
    codes.push('PER_TX_CAP')
  } else if (amount > escalateAbove) {
    verdict = 'ESCALATE'
  }

  process.stdout.write(JSON.stringify({ id, verdict, codes }) + '\n')
}
