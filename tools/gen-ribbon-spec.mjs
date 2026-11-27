#!/usr/bin/env node
/**
 * gen-ribbon-spec.mjs — derive the Rust ribbon spec from the TypeScript source of truth.
 *
 * packages/editor-common/src/ribbon/specs/word-ribbon.ts is the single source of truth for the
 * ribbon (ADR-F1 keeps the TS spec as data; the Leptos UI consumes a derived copy). Hand-porting
 * 1.9k lines is drift waiting to happen, so this tool:
 *   1. transpiles the spec with TypeScript's own transpileModule (types erased, nothing else),
 *   2. evaluates the resulting plain JS to get the real object graph,
 *   3. emits `ribbon_spec.rs` — `pub fn tabs() -> Vec<Tab>` in the crate's data types.
 *
 * Closures in the TS spec (`visible: (ctx) => ctx.isEditMode`) cannot be data. They are lowered
 * to a `when: Option<Cond>` enum (see COND below); anything not in the table fails the build
 * loudly rather than being silently dropped.
 *
 * Usage: node tools/gen-ribbon-spec.mjs [--check]
 *   --check  exit 1 if the committed .rs is stale (CI gate)
 */
import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, "..")
const SPEC = path.resolve(ROOT, "packages/editor-common/src/ribbon/specs/word-ribbon.ts")
const TYPES = path.resolve(ROOT, "packages/editor-common/src/ribbon/types.ts")
const OUT = path.resolve(ROOT, "apps/web/apps/ribbon-leptos/src/ribbon/spec.rs")
const CHECK = process.argv.includes("--check")

// TS is a devDependency of the workspace; resolve it from wherever node_modules lives.
const ts = createRequire(path.join(ROOT, "package.json"))("typescript")

/// Emit rustfmt-canonical text so `--check` and `cargo fmt` can never disagree about the file.
function rustfmt(src) {
  const r = spawnSync("rustfmt", ["--edition", "2021", "--emit", "stdout"], { input: src, encoding: "utf8" })
  if (r.status !== 0) throw new Error(`gen-ribbon-spec: rustfmt failed:\n${r.stderr}`)
  return r.stdout
}

const src = fs.readFileSync(SPEC, "utf8")
// Strip the single `import type` line so the eval'd module has no imports; transpile to ESM JS.
const js = ts.transpileModule(src.replace(/^import type[^\n]*\n/m, ""), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const mod = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)
const spec = mod.default ?? mod.wordRibbonSpec ?? Object.values(mod)[0]

// ── closure lowering ──────────────────────────────────────────────────────
// Every `(ctx) => …` in the spec is a pure predicate over RibbonContext. The whole family is
// `ctx.<field> ?? <default>` (verified below), which lowers to Cond::Ctx { field, default } and is
// evaluated at render time against the live context. A predicate outside that shape is a hard
// error so nothing can ever be dropped silently.
function lowerCond(fn, where) {
  const key = fn.toString().replace(/^\(?ctx\)?\s*=>\s*/, "").replace(/;$/, "").trim()
  // `ctx.x` alone (no `??`) is falsy when undefined — same as `?? false` in a boolean context.
  const m = /^ctx\.([a-zA-Z]+)(?:\s*\?\?\s*(true|false))?$/.exec(key)
  if (!m) throw new Error(`gen-ribbon-spec: unmapped predicate ${JSON.stringify(key)} at ${where}`)
  return `Ctx { field: ${rsStr(m[1])}, default: ${m[2] ?? "false"} }`
}
// `value: () => ""` / `color: (ctx) => "#000000"` are constants in the spec — lower to a literal.
function lowerConstFn(fn, where) {
  const s = fn.toString().replace(/^\(?(?:ctx)?\)?\s*=>\s*/, "").replace(/;$/, "").trim()
  const m = /^"([^"]*)"$/.exec(s)
  if (!m) throw new Error(`gen-ribbon-spec: non-constant value fn ${JSON.stringify(s)} at ${where}`)
  return m[1]
}

const rsStr = (s) => JSON.stringify(String(s)) // JSON string escaping is valid Rust
const rsOpt = (v) => (v == null ? "None" : `Some(${rsStr(v)})`)

function control(c, tabId, groupId) {
  const where = `${tabId}/${groupId}/${c.id}`
  const base = `id: ${rsStr(c.id)}, label: ${rsOpt(c.label)}, tooltip: ${rsOpt(c.tooltip ?? c.label)}`
  let when = "None"
  if (c.visible) when = `Some(${lowerCond(c.visible, where + ".visible")})`
  switch (c.type) {
    case "button": {
      const value = c.value ? `Some(${rsStr(c.value)})` : "None"
      return `Control { ${base}, when: ${when}, kind: Kind::Button { command: ${rsStr(c.command)}, icon: ${rsStr(c.icon)}, shortcut: ${rsOpt(c.shortcut)}, value: ${value}, toggleable: ${!!c.toggleable} } }`
    }
    case "checkbox": {
      const checked = lowerCond(c.checked, where + ".checked")
      const cmd = c.command ? `Some(${rsStr(c.command)})` : "None"
      return `Control { ${base}, when: ${when}, kind: Kind::Checkbox { command: ${cmd}, checked_when: ${checked} } }`
    }
    case "select": {
      const opts = c.options.map((o) => `SelectOption { value: ${rsStr(o.value)}, label: ${rsStr(o.label)} }`).join(", ")
      const value = lowerConstFn(c.value, where + ".value")
      return `Control { ${base}, when: ${when}, kind: Kind::Select { options: vec![${opts}], value: ${rsStr(value)}, command: ${rsOpt(c.id)} } }`
    }
    case "color-picker": {
      const color = lowerConstFn(c.color, where + ".color")
      return `Control { ${base}, when: ${when}, kind: Kind::ColorPicker { color: ${rsStr(color)}, command: ${rsStr(c.id)} } }`
    }
    case "dropdown": {
      const items = (c.items ?? []).map((it) => `DropdownItem { id: ${rsStr(it.id)}, label: ${rsStr(it.label)}, command: ${rsOpt(it.command)} }`).join(", ")
      return `Control { ${base}, when: ${when}, kind: Kind::Dropdown { icon: ${rsOpt(c.icon)}, items: vec![${items}] } }`
    }
    case "separator":
      return `Control { ${base}, when: ${when}, kind: Kind::Separator }`
    case "spacer":
      return `Control { ${base}, when: ${when}, kind: Kind::Spacer }`
    default:
      throw new Error(`gen-ribbon-spec: unsupported control type ${c.type} at ${where}`)
  }
}

// The TS spec reuses shared group objects (globalLanguageGroup etc.) across tabs; dedupe by
// identity is unnecessary — emit each occurrence where it is used, exactly as React rendered it.
const tabs = spec.tabs.map((t) => {
  const groups = t.groups.map((g) => {
    const gw = g.visible ? `Some(${lowerCond(g.visible, t.id + "/" + g.id + ".visible")})` : "None"
    const ctrls = g.controls.map((c) => control(c, t.id, g.id)).join(",\n")
    return `        Group { id: ${rsStr(g.id)}, label: ${rsStr(g.label)}, when: ${gw}, controls: vec![\n${ctrls},\n        ] }`
  })
  const tw = t.visible ? `Some(${lowerCond(t.visible, t.id + ".visible")})` : "None"
  return `    Tab { id: ${rsStr(t.id)}, label: ${rsStr(t.label)}, when: ${tw}, groups: vec![\n${groups.join(",\n")},\n    ] }`
})

const nTabs = spec.tabs.length
const nGroups = spec.tabs.reduce((n, t) => n + t.groups.length, 0)
const nCtrls = spec.tabs.reduce((n, t) => n + t.groups.reduce((m, g) => m + g.controls.length, 0), 0)

const out = `//! GENERATED FILE — do not edit. Source of truth: packages/editor-common/src/ribbon/specs/word-ribbon.ts
//! Regenerate: \`node tools/gen-ribbon-spec.mjs\` (CI: \`--check\`). ${nTabs} tabs, ${nGroups} groups, ${nCtrls} controls.
use crate::types::*;
use Cond::*;

pub fn tabs() -> Vec<Tab> {
    vec![
${tabs.join(",\n")},
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_ts_source_of_truth() {
        let t = tabs();
        assert_eq!(t.len(), ${nTabs});
        let groups: usize = t.iter().map(|x| x.groups.len()).sum();
        assert_eq!(groups, ${nGroups});
        let controls: usize = t.iter().flat_map(|x| x.groups.iter()).map(|g| g.controls.len()).sum();
        assert_eq!(controls, ${nCtrls});
        // ids are unique within a GROUP (React keyed per group). The spec reuses ids across
        // groups (chart-design has chart-type in two groups), so DOM ids must be group-qualified.
        for tab in &t {
            for g in &tab.groups {
                let mut ids: Vec<&str> = g.controls.iter().map(|c| c.id).collect();
                ids.sort_unstable();
                let n = ids.len();
                ids.dedup();
                assert_eq!(ids.len(), n, "duplicate control id in {}/{}", tab.id, g.id);
            }
        }
    }
}
`

const formatted = rustfmt(out)

if (CHECK) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : ""
  if (cur !== formatted) {
    console.error(`gen-ribbon-spec: ${path.relative(ROOT, OUT)} is stale — run: node tools/gen-ribbon-spec.mjs`)
    process.exit(1)
  }
  console.log(`gen-ribbon-spec: up to date (${nTabs} tabs, ${nGroups} groups, ${nCtrls} controls)`)
} else {
  fs.writeFileSync(OUT, formatted)
  console.log(`gen-ribbon-spec: wrote ${path.relative(ROOT, OUT)} (${nTabs} tabs, ${nGroups} groups, ${nCtrls} controls)`)
}
