#!/usr/bin/env node
// P1-04 — re-baseline wasm-api.json resolutions for all 970 asc_* rows.
//
// Adds to every row:
//   resolution        — controlled vocabulary (see P1-MAPPING-rust.md §2)
//   resolution_target — concrete WO counterpart where one is named
//   call_kind         — UI-caller rows only: how the word UI actually reaches
//                       the name (verified call-site scan, §1 method step 2)
//   note              — UI-caller rows and landed/deferred rows worth a word
//   leak_family       — deferred-leakage rows only: spreadsheet|pdf|plugin|macro
// Flips wo_export_name/wo_missing for rows whose counterpart **landed** since
// the ORM-01 baseline (props blob kinds run/paragraph/border/color, P1-01/03).
//
// Run:  node plan/oo-port/p104-rebaseline.cjs   (idempotent, in-place)

'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'wasm-api.json');
const rows = JSON.parse(fs.readFileSync(FILE, 'utf8'));
if (rows.length !== 970) throw new Error('expected 970 rows, got ' + rows.length);
const byName = new Map(rows.map(r => [r.name, r]));

// ---------------------------------------------------------------- vocabulary
// landed-export      a #[wasm_bindgen] export in wo-renderer-wasm serves the row
// landed-blob        served through props.rs set_property/get_property kind + serde struct
// landed-push-frame  a named WsEvent variant is landed for this engine→UI callback
// push-frame-other   callback rides the landed WsEvent::Other{name} 1:1 tail
// planned-export     named export planned (phase in note)
// planned-op         typed op over apply_structure_op/apply_op (D3)
// planned-blob       property payload planned/landed struct without its blob kind (D2)
// planned-alias      #[wasm_bindgen(js_name)] alias over an existing export (D4)
// divergence         named divergence, no counterpart planned (D5)
// deferred-leakage   shared-bundle leakage (spreadsheet/pdf/plugin/macro), name recorded
const RES = {
  LANDED_EXPORT: 'landed-export',
  LANDED_BLOB: 'landed-blob',
  LANDED_FRAME: 'landed-push-frame',
  FRAME_OTHER: 'push-frame-other',
  PLANNED_EXPORT: 'planned-export',
  PLANNED_OP: 'planned-op',
  PLANNED_BLOB: 'planned-blob',
  PLANNED_ALIAS: 'planned-alias',
  DIVERGENCE: 'divergence',
  LEAKAGE: 'deferred-leakage',
};

// ------------------------------------------------- landed coverage (the crate)
// Verified against core/crates/wo-renderer-wasm/src/{lib,session,events,props}.rs.
// The 27 rows already flipped in the ledger (ORM-01 baseline + P1-01/03 commits)
// keep their wo_export_name; three more flip here for the landed props blob kinds.
const LANDED = {
  // lib.rs (renderer boundary)
  asc_enterText: 'insert_text',
  asc_IsSpellCheckCurrentWord: 'spell_check_word',
  asc_Save: 'serialize_document',
  // session.rs (P1-03)
  asc_setDocId: 'asc_setDocId', asc_setToken: 'asc_setToken',
  asc_setServerVersion: 'asc_setServerVersion', asc_setUrlChanges: 'asc_setUrlChanges',
  asc_SetUserId: 'asc_SetUserId', asc_putUserId: 'asc_putUserId',
  asc_SetUserName: 'asc_SetUserName', asc_putUserName: 'asc_putUserName',
  asc_SetUserColor: 'asc_SetUserColor', asc_getUserId: 'asc_getUserId',
  asc_getUserName: 'asc_getUserName', asc_isSupportFeature: 'asc_isSupportFeature',
  asc_getTitle: 'asc_getTitle', asc_getSubject: 'asc_getSubject',
  asc_getCreator: 'asc_getCreator', asc_getKeywords: 'asc_getKeywords',
  asc_getDescription: 'asc_getDescription', asc_getLanguage: 'asc_getLanguage',
  asc_getLastModifiedBy: 'asc_getLastModifiedBy', asc_getCreated: 'asc_getCreated',
  asc_getModified: 'asc_getModified', asc_getCategory: 'asc_getCategory',
  asc_coAuthoringDisconnect: 'coAuthoringDisconnect',
  // events.rs (P1-01) — the export pushes WsEvent::CoAuthoringDisconnect
  // props.rs blob-backed rows (flipped by this re-baseline)
  asc_CColor: 'set_property/get_property("color") \u2194 props::WasmColor',
  asc_CParagraphProperty: 'set_property/get_property("paragraph") \u2194 props::WasmParagraphProperty',
  asc_CTextBorder: 'set_property/get_property("border") \u2194 props::WasmTextBorders',
};

// ORM-03 struct names for planned-blob targets (from wasm-data-classes.json)
const DC_STRUCT = JSON.parse(fs.readFileSync(path.join(__dirname, 'wasm-data-classes.json'), 'utf8'))
  .filter(r => r.wo_struct_name && r.wo_struct_name !== 'NONE')
  .reduce((m, r) => (m[r.name] = r.wo_struct_name, m), {});

// --------------------------------------------- 74 UI-caller rows (classified)
// call_kind verified by the /tmp/oo-src documenteditor controller call-site scan:
//   api-call          `this.api.asc_X(...)` — true engine boundary call
//   event-register    `api.asc_registerCallback('asc_X', ...)` — engine→UI callback
//   payload-accessor  `obj.asc_X()` on an asc_C*/OForm/payload instance — crosses the
//                     boundary inside the ORM-03 payload, not as a standalone call
//   payload-ctor      `new Asc.asc_C*(...)`
const UI = {};
function ui(name, kind, res, target, note) {
  UI[name] = { kind, res, target, note };
}

// --- api-calls (12) ---------------------------------------------------------
ui('asc_registerCallback', 'api-call', RES.PLANNED_EXPORT, 'register_callback / unregister_callback',
  'hottest row of the surface (190 call sites, all 18 word controllers); the sink half (set_event_sink + WsEvent push) landed in P1-01, the UI-facing registration export is the remaining Phase-1 half (D1)');
ui('asc_enableKeyEvents', 'api-call', RES.DIVERGENCE, 'handle_key_event / handle_mouse_event',
  'D5 input split: OO focus-gates raw keys before the api (DocumentHolderExt/LeftMenu/Main/Print); WO consumes raw input unconditionally and does not emulate the gate');
ui('asc_setRestriction', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"set_restriction")',
  'DocProtection/FormsTab/Main; restriction modes (read/fill-forms/comments/forms); D3 typed op, Phase 3 with forms');
ui('asc_setViewerTargetType', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"set_viewer_target_type")',
  'Statusbar/Toolbar/ViewTab viewer-mode target ("select"/fill) switch; bundle-internal twin at sdk-all.js:509144');
ui('asc_coAuthoringDisconnect', 'api-call', RES.LANDED_EXPORT, 'coAuthoringDisconnect',
  'landed P1-01/03: export pushes WsEvent::CoAuthoringDisconnect via events::push (session.rs)');
ui('asc_addImage', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"add_image")',
  'D3 names this row; blocked on the Phase-2 image capability (ORM-04 sev3)');
ui('asc_MoveToFillingForm', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"move_to_filling_form")',
  'FormsTab form navigation; D3 names this row; Phase 3 forms');
ui('asc_AddMath', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"add_math")',
  'DocumentHolderExt/Toolbar; OMML math op, Phase 4 tail (needs OMML model)');
ui('asc_Save', 'api-call', RES.LANDED_EXPORT, 'serialize_document',
  'landed; D4 adds an asc_Save js_name wrapper that also produces the upload payload (alias planned)');
ui('asc_insertSymbol', 'api-call', RES.PLANNED_OP, 'apply_structure_op(op:"insert_symbol")',
  'Toolbar symbol dialog; small structural op');
ui('asc_isSupportFeature', 'api-call', RES.LANDED_EXPORT, 'asc_isSupportFeature',
  'landed P1-03 (session.rs); Main.js featureForms probe');
ui('asc_docs_api', 'payload-ctor', RES.DIVERGENCE, 'init / create_document',
  'Viewport constructs the OO api (`new Asc.asc_docs_api`); WO splits construction into init + create_document \u2014 declared D5 divergence, keep');

// --- event registrations (25) ----------------------------------------------
ui('asc_onError', 'event-register', RES.LANDED_FRAME, 'WsEvent::Error (frame "error")',
  'richest OO funnel (FormsTab/Main/RightMenu); variant landed P1-01, producer wiring pending');
ui('asc_onCurrentPage', 'event-register', RES.LANDED_FRAME, 'WsEvent::CurrentPage (frame "current_page")',
  'FormsTab/Print page indicator; variant landed, producer pending');
ui('asc_onDocumentContentReady', 'event-register', RES.LANDED_FRAME, 'WsEvent::DocumentContentReady',
  'Main.js ready gate; variant landed, producer pending');
ui('asc_onContextMenu', 'event-register', RES.LANDED_FRAME, 'WsEvent::ContextMenu',
  'mirrors editor.js ctx-menu path; variant landed, producer pending');
ui('asc_onShowContentControlsActions', 'event-register', RES.LANDED_FRAME, 'WsEvent::FocusObject{kind:"control"}',
  'CC action-toolbar show = control focus (DocumentHolderExt/FormsTab/Links); FocusObject carries the toolbar-context switch');
ui('asc_onHideContentControlsActions', 'event-register', RES.LANDED_FRAME, 'WsEvent::FocusObject (focus lost)',
  'CC action-toolbar hide = focus loss; same frame as show');
ui('asc_onAddComment', 'event-register', RES.LANDED_FRAME, 'WsEvent::AddComment',
  'LeftMenu; Phase-2 frame variant already landed');
ui('asc_onPrAlign', 'event-register', RES.LANDED_FRAME, 'WsEvent::ToolbarState{align}',
  'Toolbar paragraph-align refresh; rides the collapsed toolbar_state family frame');
ui('asc_onSingleChartSelectionChanged', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt chart selection; candidate focus_object{kind:"chart"} payload later');
ui('asc_onOFormChangeFinal', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'FormsTab OForm final-change notify; Phase 3 forms');
ui('asc_onUpdateOFormRoles', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'FormsTab roles refresh; Phase 3 forms');
ui('asc_onConfirmAction', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Main.js server/confirm dialogs');
ui('asc_onDisconnectEveryone', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Main.js protection disconnect; coauth family tail');
ui('asc_onHideMathTrack', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt math track visibility');
ui('asc_onShowMathTrack', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt math track visibility');
ui('asc_ChangeCropState', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt image-crop UI state; Phase 2 images');
ui('asc_updateListPatterns', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'registered as a callback (Toolbar), not an api method: engine\u2192UI list-pattern refresh');
ui('asc_onAddSmartArtPreview', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar smartart preview pipeline; Phase 4 tail');
ui('asc_onBeginSmartArtPreview', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar smartart preview pipeline; Phase 4 tail');
ui('asc_onEndSmartArtPreview', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar smartart preview pipeline; Phase 4 tail');
ui('asc_onHyperlinkClick', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt hyperlink activation request (UI-action frame)');
ui('asc_onMarkerFormatChanged', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar marker/highlight tool refresh; toolbar_state extension candidate');
ui('asc_onParaSpacingLine', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar line-spacing refresh; toolbar_state extension candidate (spacing field)');
ui('asc_onRulerDblClick', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'DocumentHolderExt ruler interaction; UI-action frame');
ui('asc_onTextDirection', 'event-register', RES.FRAME_OTHER, 'WsEvent::Other{name}',
  'Toolbar text-direction refresh; toolbar_state extension candidate');

// --- payload accessors / ctors (37) ----------------------------------------
ui('asc_CImgProperty', 'payload-ctor', RES.PLANNED_BLOB, 'set_property("image") \u2194 props::WasmImageProperty',
  'struct landed in props.rs; the "image" blob kind is the Phase-2 image work; DocumentHolderExt/PageLayout');
ui('asc_CRect', 'payload-ctor', RES.PLANNED_BLOB, 'props::WasmRect (struct landed; kind pending)',
  'chart-rect/crop coordinates payload; DocumentHolderExt');
ui('asc_CParagraphFrame', 'payload-ctor', RES.PLANNED_BLOB, 'props::WasmParagraphFrame (struct landed; kind pending)',
  'Toolbar text-frame props payload');
ui('asc_getChartProperties', 'payload-accessor', RES.PLANNED_BLOB, 'wo_chart series/props models (ORM-03 partial)',
  'selected-element payload accessor; chart-edit payloads Phase 2/3');
ui('asc_getChartType', 'payload-accessor', RES.PLANNED_BLOB, 'wo_chart::Series (ORM-03 partial)',
  'series payload accessor (chartProps.getSeries()[0])');
ui('asc_getAllRoles', 'payload-accessor', RES.PLANNED_OP, 'apply_op("get_all_roles")',
  'OForm payload roles query; D3 names this row; Phase 3 forms');
ui('asc_addRole', 'payload-accessor', RES.PLANNED_OP, 'apply_op("add_role")',
  'OForm/OFormManager role add; D3 names this row; Phase 3 forms');
ui('asc_canFillRole', 'payload-accessor', RES.PLANNED_OP, 'apply_op("can_fill_role")',
  'OForm payload role query; Phase 3 forms');
ui('asc_getSettings', 'payload-accessor', RES.PLANNED_BLOB, 'OForm role settings payload (forms)',
  'role.asc_getSettings() accessor; Phase 3 forms');
ui('asc_putName', 'payload-accessor', RES.PLANNED_BLOB, 'OForm role payload (forms)',
  'role.asc_putName() mutator; Phase 3 forms');
ui('asc_getName', 'payload-accessor', RES.PLANNED_BLOB, 'payload accessors (style/role/color/image objects)',
  'never an api call in the word UI: eyedropper color, role, style, image payload objects');
ui('asc_getColor', 'payload-accessor', RES.PLANNED_BLOB, 'payload accessors; api-level color rides get_run_formatting/WasmColor',
  'eyedropper/role/border payload accessors; api-level color query is landed via props');
ui('asc_putColor', 'payload-accessor', RES.PLANNED_BLOB, 'payload mutators (role/borderStyle)',
  'FormsTab/Toolbar border/role color mutators; border side rides the landed "border" blob kind');
ui('asc_getValue', 'payload-accessor', RES.PLANNED_BLOB, 'payload accessors (border probe in Toolbar; CCellWatch/CCustomProperty definers)',
  'defining classes are spreadsheet-slice (CCellWatch/CCustomProperty); the word call is a duck-typed border.asc_getValue() width probe \u2014 the landed border blob covers the field family');
ui('asc_getSize', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmBorder.size via set_property("border") (kind landed; definer CBullet)',
  'duck-typed border.asc_getSize() in Toolbar; name defined on CBullet (numbering side)');
ui('asc_putSize', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmBorder.size via set_property("border") (kind landed; definer CBullet)',
  'duck-typed borderStyle.asc_putSize() in Toolbar; name defined on CBullet (numbering side)');
ui('asc_getObjectType', 'payload-accessor', RES.LANDED_FRAME, 'WsEvent::FocusObject / SelectionChanged payload',
  'selectedObjects[i].asc_getObjectType() poll after selection-end \u2014 exactly the poll storm D1 replaces with the focus/selection frames');
ui('asc_getObjectValue', 'payload-accessor', RES.LANDED_FRAME, 'WsEvent::FocusObject / SelectionChanged payload',
  'same selection-element poll family as asc_getObjectType');
ui('asc_getHeight', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmRect (struct landed; kind pending)',
  'asc_CRect/coord payload accessors (DocumentHolderExt)');
ui('asc_getWidth', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmRect (struct landed; kind pending)',
  'asc_CRect/coord payload accessors (DocumentHolderExt)');
ui('asc_getEditType', 'payload-accessor', RES.PLANNED_BLOB, 'get_property("protection") \u2194 props::WasmProtection (planned)',
  'protection-props accessor (DocProtection)');
ui('asc_getIsPassword', 'payload-accessor', RES.PLANNED_BLOB, 'get_property("protection") \u2194 props::WasmProtection (planned)',
  'protection-props accessor (DocProtection)');
ui('asc_setEditType', 'payload-accessor', RES.PLANNED_OP, 'apply_op("set_edit_type")',
  'UI receiver is the protection props payload; PORT-PLAN D3 routes the family through typed ops');
ui('asc_setPassword', 'payload-accessor', RES.PLANNED_OP, 'apply_op("set_password")',
  'UI receiver is the protection props payload; PORT-PLAN D3 routes the family through typed ops');
ui('asc_getSolved', 'payload-accessor', RES.PLANNED_BLOB, 'wo_ooxml::model::Comment (+resolved flag, planned)',
  'comment-data payload accessor (LeftMenu resolve state)');
ui('asc_getCellCoord', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmPasteOptions (planned)',
  'specialPasteShowOptions payload accessor (DocumentHolderExt special-paste popup)');
ui('asc_getOptions', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmPasteOptions (planned)',
  'specialPasteShowOptions payload accessor');
ui('asc_getLastSelectedPasteProperty', 'payload-accessor', RES.PLANNED_BLOB, 'props::WasmPasteOptions (planned)',
  'specialPasteShowOptions payload accessor');
ui('asc_getData', 'payload-accessor', RES.PLANNED_BLOB, 'advOptions download payload (planned)',
  'Main.js advanced-download dialog payload accessor');
ui('asc_getSectionId', 'payload-accessor', RES.PLANNED_BLOB, 'CSmartArtPreviewInfo payload (Phase 4 smartart)',
  'preview.asc_getSectionId(); defining class verified at sdk-all.js:199495');
ui('asc_getImage', 'payload-accessor', RES.PLANNED_BLOB, 'style/preview image payloads (Phase 2 images)',
  'style.asc_getImage()/preview.asc_getImage() accessors (Toolbar)');
ui('asc_CUserInfo', 'payload-ctor', RES.LANDED_EXPORT, 'setUserInfo/getUserInfo \u2194 WasmUserInfo blob',
  'landed P1-03; Main.js builds the OO payload shape over the serde blob');
ui('asc_getUserName', 'payload-accessor', RES.LANDED_EXPORT, 'asc_getUserName',
  'landed P1-03 (UI call sites are comment-data payload accessors; the api-name row is served by the session export)');
ui('asc_getUserId', 'payload-accessor', RES.LANDED_EXPORT, 'asc_getUserId',
  'landed P1-03 (UI call sites are user-info payload accessors; the api-name row is served by the session export)');
ui('asc_CColor', 'payload-ctor', RES.LANDED_BLOB, 'set_property/get_property("color") \u2194 props::WasmColor',
  'Toolbar border/brd color payloads; blob kind landed in props.rs (P1-02) \u2014 flipped this pass');
ui('asc_CParagraphProperty', 'payload-ctor', RES.LANDED_BLOB, 'set_property/get_property("paragraph") \u2194 props::WasmParagraphProperty',
  'PageLayout/Toolbar paragraph props payload; blob kind landed (P1-02) \u2014 flipped this pass');
ui('asc_CTextBorder', 'payload-ctor', RES.LANDED_BLOB, 'set_property/get_property("border") \u2194 props::WasmTextBorders',
  'Toolbar border-style payloads; blob kind landed (P1-02) \u2014 flipped this pass');

// ------------------------------------------------ landed WsEvent frame names
// Variants landed in events.rs (P1-01) + the P1-05 dispatcher frame map; applied
// to non-UI discovery rows. Both zoom spellings stay distinct.
const FRAMES = {
  asc_onSelectionEnd: 'selection_end', asc_onSelectionChanged: 'selection_changed',
  asc_onFocusObject: 'focus_object',
  asc_onBold: 'toolbar_state', asc_onItalic: 'toolbar_state', asc_onUnderline: 'toolbar_state',
  asc_onStrikeout: 'toolbar_state', asc_onFontSize: 'toolbar_state', asc_onFontFamily: 'toolbar_state',
  asc_onTextColor: 'toolbar_state', asc_onVertAlign: 'toolbar_state',
  asc_onZoomChanged: 'zoom_changed', onZoom: 'zoom_change',
  asc_onCurrentPage: 'current_page',
  asc_onDocumentContentReady: 'document_content_ready',
  asc_onDocumentModifiedChanged: 'document_modified_changed',
  asc_onCanUndo: 'can_undo_redo', asc_onCanRedo: 'can_undo_redo',
  asc_onError: 'error', asc_onStartAction: 'long_action', asc_onEndAction: 'long_action',
  asc_onDownloadUrl: 'download_url', asc_onDownloadUrlByUnzip: 'download_url',
  asc_onCoAuthoringDisconnect: 'co_authoring_disconnect',
  asc_onAuthParticipantsChanged: 'auth_participants_changed',
  asc_onLockDocumentProps: 'lock_document_props', asc_onUnLockDocumentProps: 'lock_document_props',
  asc_onTrackRevisionsChange: 'track_revisions_change',
  asc_onAddComment: 'add_comment', asc_onRemoveComment: 'remove_comment',
  asc_onUpdateCommentPosition: 'update_comment_position',
  asc_onSpellCheckVariants: 'spell_check_variants', asc_onTextLanguage: 'text_language',
  asc_onUpdateScrolls: 'update_scrolls', asc_onContextMenu: 'context_menu',
  asc_pluginEvent: 'plugin_event',
};

// ------------------------------------------------------------ leakage rules
function leakFamily(name) {
  if (/^asc_(C[a-z]*)?(FreeText|Closed|Poly)?Annot|AnnotProperty/i.test(name)) return 'pdf';
  if (/pdf|Redact/i.test(name)) return 'pdf';
  if (/plugin/i.test(name)) return 'plugin'; // asc_pluginEvent handled before this via FRAMES
  if (/^(asc_C)?(AutoFilter|DefName|Solver|Calc|Xfs|Pane|SortList|FormatCells|CheckDefName|CheckCopy|CheckForseSet|ExternalReference|AxNumFmt|Worksheet|Pivot|SheetView|SheetPr|Slicer|TableStyleExcel|PrintTitles)/i.test(name)) return 'spreadsheet';
  if (/^(asc_(get|put|set|is|change|update|Add|Set|Get|delete|Delete))?(Cell|Col|Column|Row|Range|Formula|Filter|Error|SolidFill|Gradient|Inverse|TrimSpace|StyleMapper|NumFormat|Locale|Binary|Sheet)/.test(name) && !/^asc_(getCellCoord|getColumnList)$/.test(name)) return 'spreadsheet';
  if (/Demonstration|Slide|Presentation|Notes|putLayout|Master/.test(name)) return 'presentation';
  return null;
}

// ---------------------------------------------------------------- main pass
// Original notes: boilerplate templates are replaced by the verified P1-04
// note; substantive notes are preserved and extended (never dropped).
const BOILER = /^(Member accessor of data-class object\(s\)|SDK-fired event callback)/;
let uiSeen = 0, flips = 0;
for (const r of rows) {
  const prevNote = r.note;
  delete r.resolution; delete r.resolution_target;
  delete r.note; delete r.call_kind; delete r.leak_family;

  // 1. explicit UI-caller classification
  const u = UI[r.name];
  if (u) {
    uiSeen++;
    r.call_kind = u.kind;
    r.resolution = u.res;
    if (u.target) r.resolution_target = u.target;
    if (u.note) {
      if (!prevNote) r.note = u.note;
      else if (prevNote === u.note || prevNote.includes('P1-04 re-baseline:')) r.note = prevNote;
      else if (BOILER.test(prevNote)) r.note = u.note;
      else r.note = prevNote + ' | P1-04 re-baseline: ' + u.note;
    }
  }
  // 2. landed coverage for non-UI rows (the UI table carries its own landed entries)
  else if (LANDED[r.name]) {
    r.resolution = /set_property/.test(LANDED[r.name]) || /^asc_C/.test(r.name)
      ? RES.LANDED_BLOB : RES.LANDED_EXPORT;
    r.resolution_target = LANDED[r.name];
  }
  // 3. non-UI engine→UI callbacks
  else if (r.side === 'discovery' && FRAMES[r.name]) {
    r.resolution = RES.LANDED_FRAME;
    r.resolution_target = 'WsEvent frame "' + FRAMES[r.name] + '" (variant landed P1-01; producer wiring pending)';
  } else if (r.side === 'discovery') {
    r.resolution = RES.FRAME_OTHER;
    r.resolution_target = 'WsEvent::Other{name} (1:1 tail)';
  }
  // 4. data-class constructors (ORM-03 payload members)
  else if (r.side === 'data-class-ctor') {
    const leak = leakFamily(r.name);
    if (leak) {
      r.resolution = RES.LEAKAGE; r.leak_family = leak;
      r.resolution_target = 'deferred with name recorded (PORT-PLAN Phase-1 item 5)';
    } else if (DC_STRUCT[r.name]) {
      r.resolution = RES.PLANNED_BLOB;
      r.resolution_target = DC_STRUCT[r.name] + ' (struct exists; blob wire pending)';
    } else {
      r.resolution = RES.PLANNED_BLOB;
      r.resolution_target = 'props::Wasm' + r.name.replace(/^asc_C/, '') + ' (planned struct)';
    }
  }
  // 5. shared-bundle leakage: named patterns anywhere + the group-'other' residue
  //    (ORM-01 §2 verdict: group other ≈ spreadsheet/pdf/plugin slices bundled into
  //    sdk-all.js; its 13 word-UI-caller rows are payload accessors, classified above)
  else if (r.group === 'other' || leakFamily(r.name)) {
    r.resolution = RES.LEAKAGE;
    r.leak_family = leakFamily(r.name) || 'shared-bundle';
    r.resolution_target = r.leak_family === 'plugin'
      ? 'Phase-3 dedicated plugin module (PORT-PLAN Phase-1 item 5)'
      : 'deferred with name recorded (PORT-PLAN Phase-1 item 5)';
  }
  // 6. everything else: in-surface, zero word-UI callers, no contract requirement
  else {
    r.resolution = 'compat-optional';
    r.resolution_target = 'none required (0 word-UI callers); serve via alias/op when a consumer appears (D4)';
  }

  if (!r.note && prevNote) r.note = prevNote; // original notes never dropped
}

// landed flips: any row whose counterpart is in the crate flips the ledger
// (idempotent — already-covered rows keep their recorded export name)
for (const r of rows) {
  if (LANDED[r.name] && r.wo_missing) {
    r.wo_missing = false;
    r.wo_export_name = LANDED[r.name];
    flips++;
  }
}

// consistency checks
const uiNames = Object.keys(UI);
if (uiSeen !== 74) throw new Error('UI table matched ' + uiSeen + ' of 74 rows');
for (const n of uiNames) {
  const r = byName.get(n);
  if (!r) throw new Error('UI row not in surface: ' + n);
  if (!r.ui_caller_count) throw new Error('UI-classified row has 0 callers: ' + n);
}

// counts
const tally = {};
for (const r of rows) tally[r.resolution] = (tally[r.resolution] || 0) + 1;
const covered = rows.filter(r => !r.wo_missing).length;
const leak = rows.filter(r => r.resolution === RES.LEAKAGE);
const leakByFam = {};
for (const r of leak) leakByFam[r.leak_family] = (leakByFam[r.leak_family] || 0) + 1;

fs.writeFileSync(FILE, JSON.stringify(rows, null, 1) + '\n');
console.log('rows:', rows.length);
console.log('UI-caller rows classified:', uiSeen);
console.log('wo_missing flips this pass:', flips, '| covered now:', covered);
console.log('resolution tally:', JSON.stringify(tally, null, 1));
console.log('deferred-leakage by family:', JSON.stringify(leakByFam));
