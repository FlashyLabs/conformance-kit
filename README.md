# conformance-kit

```
        ██
       ██
      ██████
        ██
       ██
      ██
```

[![CI](https://github.com/flashylabs/conformance-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/flashylabs/conformance-kit/actions/workflows/ci.yml) [![License](https://img.shields.io/badge/licence-Apache--2.0-blue)](LICENSE)

**Run a conformance corpus against any executable, in any language.**

A specification is only implementable by a stranger if its corpus is runnable by one. This takes a corpus and a command, streams every case to that command on stdin, and diffs the verdicts — so proving a Rust or Python implementation agrees is an afternoon rather than a week of reading somebody else’s test suite.

## Using it

A corpus ships in this repository, so the first run needs no network
and no implementation of yours:

```bash
git clone https://github.com/flashylabs/conformance-kit && cd conformance-kit
npx @flashyos/conformance-kit examples/frontdoor-1.json -- node examples/always-valid.mjs
```

`always-valid.mjs` calls every document valid. It agrees on every case the
corpus accepts and disagrees on every one it refuses — which is the shortest
demonstration of why the refusals are the interesting half. Then point it at
your own program:

```bash
npx @flashyos/conformance-kit examples/frontdoor-1.json -- ./my-validator
```

Your program reads one JSON object per line and writes one per line. That is
the entire interface — no bindings, no SDK, no import of ours:

```
in   { "id": "no-rung-zero", "set": "doors", "input": {…}, "context": {…}? }
out  { "id": "no-rung-zero", "valid": false, "codes": ["no-rung-zero"] }
```

A conformant implementation in twelve lines of Python:

```python
import json, sys
from my_validator import validate

for line in sys.stdin:
    if not line.strip():
        continue
    case = json.loads(line)
    problems = [p for p in validate(case["input"]) if p.level == "error"]
    print(json.dumps({
        "id": case["id"],
        "valid": not problems,
        "codes": [p.code for p in problems],
    }), flush=True)
```

Note `p.level == "error"`. A document that draws only **warnings** is valid,
and an implementation that refuses one has confused advice with a rule. That
sentence is in every corpus for a reason — see below.

## The invariants

Everything here follows from these. Each is enforced by something rather
than promised, because a rule with nothing behind it erodes one
convenience at a time.

| Invariant | Why | Enforced by |
| --- | --- | --- |
| **Four outcomes, not two** | A program that crashed on case 40 has not judged cases 41 onward wrongly — it has not judged them | `agreed`, `disagreed`, `unanswered`, `unreadable`, counted apart |
| **Never a single score** | Folding a crash into a percentage makes a dead program look merely inaccurate | `unanswered` and `unreadable` are reported separately and enter no ratio |
| **Codes only where expected** | Policing error wording fails every implementation that words them differently | A case asserting no `codes` accepts any; extra codes are allowed |
| **One process, streamed** | 149 cases against a 200ms boot is 30 seconds of waiting for nothing | The command is spawned once and fed on stdin |
| **Output that is not a verdict is ignored** | Programs print banners, and a runner that read the first line as an answer would fail all of them | Non-JSON and id-less lines are collected as `extra` |

> Agreeing about what must be refused is where interoperability lives.

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If anything here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked. That applies to the documentation too: every command in this
file runs against a file in this repository, because a README whose first
line fetches from our domain is one that stops working when we do.

## Types

Shipped, and checked against the module rather than against somebody’s
memory of it. `src/types.test.mjs` imports the real barrel and fails if a
declaration names an export that does not exist, or if an export has no
declaration — the two directions a `.d.ts` rots in, neither of which a
compiler can catch, because a declaration file is authoritative by
construction.

```ts
import { loadCorpus, runnableCases, ask, report } from '@flashyos/conformance-kit'
```

## What conformance-kit is not

- **Not a test framework.** It runs one corpus against one command. Your assertions, your language, your CI.
- **Not tied to our formats.** Any `conformance/1` document works. The shape is published and nothing in it names us.
- **Not a judge of implementations.** It reports what a corpus says and what your program said. Where those differ, one of them is wrong and it does not assume which.

## The corpus caught its own authors within five minutes

The first adapter ever written against these bundles — by somebody with the
reference implementation open in another window — scored **26 of 27**.

It failed one case: a door whose rung does not say what it costs. The
reference `validate()` returns *problems*, problems include **warnings**, and
the adapter treated any problem as a refusal.

The corpus was right. The runner was right. The adapter made exactly the
conflation an outside implementer would make, because nothing in the bundle
said which was meant. Every corpus now states it: **`valid` means no
errors.** If you are implementing against one of these and something fails
that you expect to pass, check this first.

## An empty string is not a failing suite

If you invoke this from inside another test runner, unset
`NODE_TEST_CONTEXT` first.

Node's test runner sets it for child processes, and a nested `node --test`
that sees it switches from TAP to the serialised protocol its parent expects.
The child runs, passes, and prints nothing the parent can read — which looks
exactly like a suite that produced no output because it died.

## Status

Pre-1.0. The line protocol is the part worth freezing and it is
deliberately tiny: `{id, set, input, context?}` in, `{id, valid, codes?}` out.
It will be locked at 1.0 and has not changed since it was written.

## Contributing

**The most useful thing you can send is an implementation that disagrees
with ours about a refusal.** Two implementations that have never met,
agreeing about what to reject, is the only real evidence a specification
says what it means.

Sign-off rather than a copyright assignment — see
[CONTRIBUTING.md](CONTRIBUTING.md). There is no CLA.

## ⚡ The Strike

This README commits to a sentence that is already on it:

```
sha256: a42d6bd463b082ca456a3da8eb3fd309e531373cdb336ac412bcd73aa4d1e159
```

One line, reconstructable exactly by a careful reader of the invariants.
Recover it, verify the hash yourself — never trust, verify, and that
includes us — and open an issue titled `⚡ STRIKE` containing the
preimage.

No prize, no token, no airdrop.

## Licence

[Apache-2.0](LICENSE), copyright Flashy Labs. The rules are open and the
tooling is open; fork either, and check ours against yours.

## The formats these were written for

`directory/1`, `frontdoor/1`, `countersign/1`, `backlog/1`, `shipped/1` and the
rest are Apache-2.0 and specified in the open at
[github.com/flashylabs](https://github.com/flashylabs). Nothing in them requires
an account, a key, or a call to us — including the checking.
