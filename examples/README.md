# examples

Nothing here reaches the network. That is the point: a conformance checker
with a dependency on the party being checked is one you would be right to
refuse, and that includes ours.

```bash
npx @flashyos/conformance-kit frontdoor-1.json -- node always-valid.mjs
```

## What you should see

`always-valid.mjs` accepts every document. The corpus refuses most of them.
So the run agrees on the accepting cases, disagrees on every refusal, and
leaves nothing unanswered — a program that answers every case and is wrong
about most of them, which is a different finding from one that crashed.

Those are counted apart on purpose. A program that died on case 40 has not
judged cases 41 onward *wrongly*; it has not judged them, and folding the two
together would make a dead implementation look merely inaccurate.

## Writing your own

Read one JSON object per line from stdin, write one per line to stdout:

```
in   { "id": "…", "set": "…", "input": {…}, "context": {…}? }
out  { "id": "…", "valid": true|false, "codes": ["…"]? }
```

`valid` means **no errors**. A document that draws only warnings is valid,
and the first adapter ever written against one of these bundles got that
wrong — see the README.

## Deciding, not just validating

Some profiles ask which of several outcomes applies, not whether a document
is acceptable. `policy-guard-1.json` is one: it grades a spend `ALLOW`,
`ESCALATE` or `DENY`, and the difference between the first two is whether a
human is asked before a signature happens — a distinction a boolean throws
away.

```bash
npx @flashyos/conformance-kit policy-guard-1.json -- node policy-guard.mjs
```

Its cases carry a `verdict` from the set's declared `outcomes`, and the
adapter answers one:

```
in   { "id": "…", "set": "envelopes", "input": { "amount": 0, "escalateAbove": 0, "perTxCap": 0 } }
out  { "id": "…", "verdict": "ALLOW|ESCALATE|DENY", "codes": ["…"]? }
```

`policy-guard.mjs` agrees on every case. Point `always-valid.mjs` at the same
corpus instead and every row is **unreadable**, never *disagreed* — a program
answering a boolean to a `decide` corpus has not judged the case wrongly, it
has failed to speak the protocol, and those are counted apart.
