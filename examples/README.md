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
