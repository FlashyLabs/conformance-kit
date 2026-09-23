#!/usr/bin/env node
// The simplest possible conformance adapter: everything is valid.
//
// Run it and read the disagreement count. Every one of those is a document
// the corpus refuses and this program accepted — which is exactly the class
// of bug two independent implementations exist to find in each other.
import { createInterface } from 'node:readline'

const lines = createInterface({ input: process.stdin, crlfDelay: Infinity })

for await (const line of lines) {
  if (!line.trim()) continue
  const { id } = JSON.parse(line)
  process.stdout.write(JSON.stringify({ id, valid: true }) + '\n')
}
