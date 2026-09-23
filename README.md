# conformance-kit

**Run a conformance corpus against any executable, in any language.**

A specification is only implementable by a stranger if the corpus is runnable by one. This takes a `conformance/1` corpus and a command, feeds every case to that command on stdin, and diffs the verdicts — so proving a Rust or Python implementation agrees is an afternoon rather than a week of reading somebody else’s test suite.

## Install

```bash
npx @flashyos/conformance-kit https://flashyos.com/.well-known/conformance/frontdoor-1.json -- ./my-validator
```

## Why it exists

Everything here exists because of a defect that shipped somewhere real and
was not noticed. The failure mode these share is a confident wrong answer
rather than an error: nothing goes red, the number looks fine, and it is
acted on.

## It works alone

No account, no API key, no telemetry, and no network call unless you ask
for one. If a tool here ever needs a service of ours to answer, that is a
bug — you would be right to refuse a checker with a dependency on the party
being checked.

## Licence

Apache-2.0, copyright Flashy Labs. See [LICENSE](LICENSE).

## If you are here from a `$id` or a corpus

The formats these tools were written for are published, machine-readable and
implementable without installing anything:

```bash
curl -s https://flashyos.com/.well-known/specs.json | jq .
```
