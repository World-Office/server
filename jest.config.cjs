/**
 * Root jest config — kept for legacy rigs only.
 *
 * The behavioral editor gates (*.test.mjs) lived in
 * apps/web/apps/documenteditor-wysiwyg — plain ESM node scripts, moved with
 * the editor to branch legacy/wysiwyg-python-editor on 2026-11-16. The
 * remaining suites are the vitest jobs of the react apps. Do NOT add jest
 * suites here — write a plain *.test.mjs gate with node:assert instead.
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
