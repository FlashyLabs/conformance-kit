#!/usr/bin/env node
// The `bin` for @flashyos/conformance-kit.
//
// This file holds NO logic. It imports the driver from conformance-run.mjs and
// runs it — that is the whole file. It used to be a byte-for-byte copy of
// conformance-run.mjs, which is the exact shape a drift test cannot see: the
// drift test guards `conformance-run.mjs`, so the copy behind the `bin` could
// diverge line by line and every check stayed green while the command users
// actually run served stale code. There is one copy of the runner now, and a
// wrapper cannot drift from the thing it imports.
import { runCli } from './conformance-run.mjs'

process.exit(await runCli(process.argv.slice(2)))
