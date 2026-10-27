#!/usr/bin/python3
"""
ledger/build.py — FEATURE LEDGER v1.

Merges the OO inventory (census-oo-deep: controls/menus/backstage/statusbar,
census-oo-dialogs: dialog FIELD structures, census-oo-interactions: what each
control opens) with the WO inventory (census-wo-deep) into one machine-
checkable ledger: one row per OO feature surface, with the WO counterpart and
a LEVEL:

  L0 MISSING  no WO surface for the feature
  L1 SURFACE  WO has the control/dialog (visual approximation — where the
              old census stopped: "deficit 3")
  L2 ACTS     behavior probe passed: the control mutates the document DOM
  L3 PERSISTS mutation survives editor -> flatHtml -> docx -> reload
  L4 FIDELITY output semantics match OO's own document for the same op

L2 is filled by behavior probes (probe layer); L3 is filled by
ledger/roundtrip.cjs: it applies each document-level command in the real
editor, serializes via flatHtml, round-trips html -> docx -> html through the
docserver conversion endpoint, and reloads a fresh editor to verify the
mutation marker survived. If ledger/roundtrip-results.json exists, this
builder merges its surviving commands into the ledger as L3 PERSISTS and
still emits ledger.json + the report.

Usage: /usr/bin/python3 ledger/build.py   (from the census dir)
"""
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
CEN = HERE.parent / "census"

# ---------------------------------------------------------------- normalize
def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = s.lower()
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()

# token set for fuzzy matching
def toks(s: str):
    return set(norm(s).split()) - {"the", "a", "and", "or", "of"}

def fuzzy(a: str, b: str) -> bool:
    ta, tb = toks(a), toks(b)
    if not ta or not tb:
        return False
    inter = ta & tb
    return len(inter) >= max(1, min(len(ta), len(tb)) - 0) and len(inter) / min(len(ta), len(tb)) >= 0.6

# manual alias seeds: OO surface label -> WO data-cmd / label fragment.
# Grows as triage finds renames; fuzzy match covers most cases.
ALIASES = {
    "text art": "textart", "textart": "textart",
    "drop cap": "dropcap", "dropcap": "dropcap",
    "text from file": "insert-file",
    "table of contents": "toc", "toc options": "toc",
    "page number": "page-number", "page numbers": "page-number",
    "line numbers": "line-numbers", "linenumbers": "line-numbers",
    "mail merge": "mail-merge",
    "track changes": "track-changes",
    "compare": "compare",
    "co authoring": "collab", "coediting": "collab",
    "equation": "equation", "formula": "equation",
    "sheet": "spreadsheet", "slide": "presentation",
    "smart art": "shapes", "shapes": "shapes",
    "clear style": "clear-style",
    "paint format": "copystyle", "copy style": "copystyle",
    "non printing characters": "nonprinting", "formatting marks": "nonprinting",
    "first line indent": "first-line",
    "find": "find", "find and replace": "find",
    "bullets": "list", "multilevel": "multilevel",
    "bullets and numbering": "bullets",
    "symbols": "symbol", "more symbols": "symbol",
    "eraser": "erase",
}

# noise: never ledger-worthy surfaces
NOISE = re.compile(r"^(asc-|0 x |x )|[0-9]+ x [0-9]+", re.I)
def noisy(label: str) -> bool:
    n = norm(label)
    if not n or NOISE.search(label or ""):
        return True
    if not re.search(r"[a-z]", n):
        return True
    # backstage section names (Home/Layout/… file-tab headers) — covered by
    # WO backstage rows via aliases, not as standalone features
    return False

CLUSTER_BY_TAB = {
    "home": "formatting", "ins": "insert", "draw": "insert", "layout": "page",
    "links": "references", "review": "review", "protect": "protect",
    "view": "view", "plugins": "plugins", "collaboration": "collab",
    "headerfooter": "headerfooter", "charttab": "chart", "chart": "chart",
    "table": "table", "picture": "image", "shape": "insert",
    "developer": "macros", "file": "file",
}

def cluster_of(tab: str, label: str = "") -> str:
    lab = norm(label)
    for kw, cl in [
        ("table", "table"), ("chart", "chart"), ("image", "image"),
        ("picture", "image"), ("photo", "image"), ("equation", "insert"),
        ("hyperlink", "references"), ("bookmark", "references"),
        ("footnote", "references"), ("endnote", "references"),
        ("caption", "references"), ("cross reference", "references"),
        ("table of", "references"), ("toc", "references"),
        ("comment", "review"), ("spell", "review"), ("thesaurus", "review"),
        ("translate", "review"), ("macro", "macros"), ("mail merge", "file"),
        ("watermark", "page"), ("header", "headerfooter"),
        ("footer", "headerfooter"), ("numbering", "formatting"),
        ("bullet", "formatting"), ("font", "formatting"),
    ]:
        if kw in lab:
            return cl
    return CLUSTER_BY_TAB.get(tab, "other")

def slug(s: str) -> str:
    s = norm(s).replace(" ", "-")
    return s[:48] or "unnamed"

# ---------------------------------------------------------------- load
oo_deep = json.load(open(CEN / "census-oo-deep.json"))
oo_dlg = json.load(open(CEN / "census-oo-dialogs.json"))
oo_int = json.load(open(CEN / "census-oo-interactions.json"))
wo_deep = json.load(open(CEN / "census-wo-deep.json"))

# WO surface index: labels + data-cmds, for matching
wo_labels = []   # (cluster, label, data_cmd, surface)
for tab, meta in (wo_deep.get("tabs") or {}).items():
    for b in meta.get("buttons", []):
        wo_labels.append((cluster_of(tab, b.get("label", "")), b.get("label", ""), b.get("dataCmd") or b.get("cmd") or b.get("id") or "", "tab:" + tab))
for m in wo_deep.get("menus", []) or []:
    for it in m.get("items", []):
        wo_labels.append((cluster_of(m.get("tab", ""), it.get("label", "")), it.get("label", ""), "", "menu:" + m.get("trigger", "")))
for it in (wo_deep.get("backstage") or []):
    if isinstance(it, dict) and it.get("label"):
        wo_labels.append(("file", it.get("label", ""), it.get("dataCmd") or it.get("id", ""), "backstage"))
for it in (wo_deep.get("statusBar") or []):
    if isinstance(it, dict) and (it.get("label") or it.get("id")):
        wo_labels.append(("statusbar", it.get("label", ""), it.get("id", ""), "statusbar"))

def wo_match(label: str, cluster: str):
    """Best WO surface for an OO label. Returns (dataCmd/label, where) or None."""
    n = norm(label)
    for key, want in ALIASES.items():
        if key in n or n == key:
            for cl, lab, cmd, where in wo_labels:
                if want in norm(cmd) or want in norm(lab):
                    return (cmd or lab, where)
    # exact label
    for cl, lab, cmd, where in wo_labels:
        if n and n == norm(lab):
            return (cmd or lab, where)
    # fuzzy same-cluster first, then anywhere
    for cl, lab, cmd, where in wo_labels:
        if cl == cluster and fuzzy(label, lab):
            return (cmd or lab, where)
    for cl, lab, cmd, where in wo_labels:
        if fuzzy(label, lab):
            return (cmd or lab, where)
    return None

# interactions: what each OO control opens (by toolbar id)
opens_by_id = {}
for i in oo_int.get("interactions", []):
    if i.get("id"):
        opens_by_id[i["id"]] = i.get("opens")

# ---------------------------------------------------------------- ledger rows
ledger = {}

def add(fid, cluster, oo_surface, kind, extra=None):
    row = ledger.setdefault(fid, {
        "feature": fid, "cluster": cluster, "kind": kind,
        "oo": [], "wo": None, "level": 0, "evidence": [],
    })
    row["oo"].append(oo_surface)
    if extra:
        row["evidence"].extend(extra)

# 1. ribbon controls (OO tabs)
for tab, meta in (oo_deep.get("tabs") or {}).items():
    for b in meta.get("buttons", []):
        lab = b.get("label") or b.get("id") or ""
        if not lab or noisy(lab):
            continue
        cl = cluster_of(tab, lab)
        fid = cl + "." + slug(lab)
        oo_surf = {"surface": f"tab:{tab}", "label": lab, "enabled": b.get("enabled", True)}
        m = wo_match(lab, cl)
        add(fid, cl, oo_surf, "control")
        if m:
            ledger[fid]["wo"] = {"match": m[0], "where": m[1]}
            ledger[fid]["level"] = 1

# 2. menu items
for m in oo_deep.get("menus", []) or []:
    for it in m.get("items", []):
        lab = it.get("label", "")
        if not lab or len(lab) < 2 or noisy(lab):
            continue
        cl = cluster_of(m.get("tab", ""), lab)
        fid = cl + "." + slug(lab)
        add(fid, cl, {"surface": f"menu:{m.get('trigger')}", "label": lab, "enabled": it.get("enabled", True)}, "menu-item")
        w = wo_match(lab, cl)
        if w:
            ledger[fid]["wo"] = {"match": w[0], "where": w[1]}
            ledger[fid]["level"] = 1

# 3. dialogs (from the dialogs census): one row PER DIALOG, fields listed —
#    the field list is the port contract: a WO dialog that misses fields is
#    not parity even if it opens.
for e in oo_dlg.get("dialogs", []):
    d = e["dialog"]
    trig = e["trigger"].get("via") or e["trigger"].get("label") or e["trigger"].get("id") or ""
    title = d.get("title") or trig
    cl = cluster_of(e.get("tab", ""), title)
    fid = cl + ".dlg-" + slug(title)
    fields = [f.get("label", "") for f in d.get("fields", []) if f.get("label")]
    add(fid, cl, {"surface": f"dialog:{title}", "trigger": trig, "label": title,
                  "fields": fields, "buttons": d.get("buttons", [])}, "dialog")
    w = wo_match(title, cl)
    if w:
        ledger[fid]["wo"] = {"match": w[0], "where": w[1]}
        ledger[fid]["level"] = 1
    # field-level presence: mark how many fields exist as separate evidence
    if fields:
        ledger[fid]["evidence"].append(f"{len(fields)} OO fields: " + ", ".join(fields[:12]))

# 4. backstage items
for it in (oo_deep.get("backstage") or []):
    lab = (it or {}).get("label", "") if isinstance(it, dict) else ""
    if not lab or noisy(lab) or lab in ("Home", "Recent", "Create New", "Search",
        "Layout", "References", "Collaboration", "Protection", "Plugins",
        "Print", "Download as", "Info", "Settings", "Help", "View", "File Info"):
        continue
    fid = "file." + slug(lab)
    add(fid, "file", {"surface": "backstage", "label": lab}, "backstage-item")
    w = wo_match(lab, "file")
    if w:
        ledger[fid]["wo"] = {"match": w[0], "where": w[1]}
        ledger[fid]["level"] = 1

# 5. statusbar
for it in (oo_deep.get("statusBar") or []):
    lab = (it or {}).get("label") or (it or {}).get("id") or ""
    if not lab:
        continue
    fid = "statusbar." + slug(lab)
    add(fid, "statusbar", {"surface": "statusbar", "label": lab}, "statusbar-item")
    w = wo_match(lab, "statusbar")
    if w:
        ledger[fid]["wo"] = {"match": w[0], "where": w[1]}
        ledger[fid]["level"] = 1

# ------------------------------------------------- L3 merge (roundtrip.cjs)
# Contract: entries with ok=true survived html -> docx -> html; entry.features
# lists ledger feature ids (matched by wo.match incl. label aliases).
rt_path = HERE / "roundtrip-results.json"
rt_merged = False
if rt_path.exists():
    rt = json.load(open(rt_path))
    for entry in rt.get("entries", []):
        if not entry.get("ok"):
            continue
        for fid in entry.get("features", []):
            row = ledger.get(fid)
            if row is not None:
                row["level"] = max(row["level"], 3)
                row["evidence"].append(
                    f"L3 roundtrip ok [{entry.get('key')}]: {str(entry.get('detail'))[:120]}")
    rt_merged = True

# ---------------------------------------------------------------- report
by_cluster = defaultdict(lambda: {"L0": 0, "L1": 0, "L2": 0, "L3": 0, "L4": 0, "rows": []})
for row in ledger.values():
    c = by_cluster[row["cluster"]]
    lvl = "L" + str(row["level"])
    c[lvl] += 1
    c["rows"].append(row)

tot = {k: sum(v[k] for v in by_cluster.values()) for k in ["L0", "L1", "L2", "L3", "L4"]}

out = HERE / "ledger.json"
json.dump({"version": 1, "generated": __import__("datetime").datetime.now().isoformat(),
           "levels": ["L0 missing", "L1 surface", "L2 acts", "L3 persists", "L4 fidelity"],
           "totals": {k: tot[k] for k in ["L0", "L1", "L2", "L3", "L4"]},
           "features": list(ledger.values())}, open(out, "w"), indent=1, ensure_ascii=False)

print(f"ledger: {len(ledger)} features across {len(by_cluster)} clusters")
print(f"  L0 missing : {tot['L0']}")
print(f"  L1 surface : {tot['L1']}  (the old census ceiling)")
if rt_merged:
    print(f"  L3 persists: {tot['L3']}  (roundtrip.cjs: {rt.get('survived', 0)}/{rt.get('probed', 0)} commands survived html->docx->html)")
else:
    print("  L2/L3/L4   : not yet probed (ledger/roundtrip.cjs fills L3)")

# markdown report
md = ["# Feature Ledger v1 — real completeness map", ""]
md.append(f"Generated from: census-oo-deep + census-oo-dialogs + census-wo-deep. ")
if rt_merged:
    md.append(f"L3 layer: ledger/roundtrip.cjs ({rt.get('survived', 0)}/{rt.get('probed', 0)} commands survive html->docx->html).")
md.append("Levels: **L0** missing · **L1** surface exists (visual parity — the old")
md.append("census ceiling, 'deficit 3' lives here) · **L2** acts (behavior probe) ·")
md.append("**L3** persists (round-trip) · **L4** fidelity vs OO output.")
md.append("")
for cl in sorted(by_cluster, key=lambda c: by_cluster[c]["L0"], reverse=True):
    v = by_cluster[cl]
    n = len(v["rows"])
    md.append(f"## {cl} — {n} features (L0:{v['L0']} L1:{v['L1']} L3:{v['L3']})")
    for row in sorted(v["rows"], key=lambda r: r["level"]):
        icon = "❌" if row["level"] == 0 else "🔲" if row["level"] == 1 else "✅"
        wo = f"→ WO: {row['wo']['match']}" if row.get("wo") else ""
        flds = ""
        if row["kind"] == "dialog":
            nf = len(next((o.get("fields", []) for o in row["oo"] if o.get("fields")), []))
            flds = f" ({nf} OO fields)"
        md.append(f"- {icon} L{row['level']} **{row['feature']}** [{row['kind']}]{flds} {wo}")
    md.append("")
(HERE / "LEDGER-REPORT.md").write_text("\n".join(md))
print("wrote", out)
print("wrote", HERE / "LEDGER-REPORT.md")
