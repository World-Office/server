/**
 * Root jest config — behavioral editor tests (*.test.mjs in
 * apps/web/apps/documenteditor-wysiwyg). Those suites are written as
 * CommonJS on purpose and drive a LIVE editor through the playwright
 * *library* (`require('playwright')`), not @playwright/test: Node 22's
 * jest cannot require ESM .mjs files, and the repo ships no babel
 * toolchain. Keep them CJS + jest, or run @playwright/test suites from a
 * rig that has the runner installed.
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
