# Changelog

All notable changes to `@flashyos/conformance-kit` are recorded
here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

**A version number is a promise about what this package will refuse.** A
change that makes it accept something it previously rejected is a major
version, even when the diff is one line.

## [Unreleased]

### Added

- Initial public release preparation.
- A runnable `decide` example: `examples/policy-guard-1.json` (a `policy-guard/1`
  corpus grading a spend `ALLOW`/`ESCALATE`/`DENY`) and `examples/policy-guard.mjs`,
  the adapter that agrees on it — so `decide` is exercised end to end, not only
  in unit tests of `judge`.

### Fixed

- `DECIDE_SETS_SINCE` named `0.2.0`, a version that never shipped: it implied
  `decide` arrived after a `0.1.0` released without it, when `decide` is present
  from the first release. It is now `0.1.0`, and `src/cli.test.mjs` fails if the
  marker ever names a version this package has not reached.

### Changed

- The `bin` (`src/cli.mjs`) is now a two-line wrapper that imports the driver
  (`runCli`) from `conformance-run.mjs`. It was a byte-for-byte copy of the
  runner that escaped the drift test guarding its twin, so the command users run
  could rot with nothing red. Behaviour is unchanged; there is one copy of the
  runner now, and a wrapper cannot drift from it.
