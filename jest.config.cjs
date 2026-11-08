/**
 * Root jest config — kept for legacy rigs only.
 *
 * The behavioral editor gates (*.test.mjs in
 * apps/web/apps/documenteditor-wysiwyg) are plain ESM node scripts today:
 * they run with `node <file>` in CI (see .github/workflows/parity-check.yml)
 * and with `node --test <file>` from the acceptance gates, and the few that
 * drive a live editor (`import("playwright")` + WO_EDITOR_URL) self-skip when
 * that stack is missing. Node 22's jest cannot load ESM .mjs files (and the
 * repo ships no babel toolchain), so do NOT add jest suites here — write a
 * plain *.test.mjs gate with node:assert instead.
 *
 * playwright resolves from tests/node_modules (the e2e testsuite's install)
 * via modulePaths, so no new dependencies are added to the root package.
 */
module.exports = {
  testEnvironment: "node",
  // force the default reporter: piped (non-TTY) runs otherwise fall back to
  // the summary-only reporter, which prints lowercase "passed" and no PASS
  // suite line — the behavioral gates grep for "PASS".
  reporters: ["default"],
  testMatch: ["**/?(*.)+(spec|test).mjs"],
  modulePaths: ["<rootDir>/tests/node_modules"],
};
