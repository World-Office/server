/*
 * wo-bridge.js — WOPI adapter for the World-Office WYSIWYG editor on the
 * Rust wo-docserver.
 *
 * The editor (editor.js) speaks the python-docserver REST surface:
 *   GET  /api/documents/{id}/html
 *   POST /api/documents/{id}/save            {html}
 *   POST /api/documents/{id}/export?format=
 *   POST /api/documents/{id}/import-docx     multipart
 *   GET  /api/documents/{id}/versions        (+ /{ts}/content, /{ts}/restore)
 *   GET/POST /api/documents/{id}/protect
 *   POST /api/documents/{id}/ai/...          (agentic loop, python-only)
 *   collab/sync|presence|state, unlock (sendBeacon), GET /api/plugins
 *
 * This bridge intercepts window.fetch for exactly those URLs and serves them
 * from the wo-docserver:
 *   GET/POST /wopi/files/{fileId}/contents[?access_token=]   (X-WOPI-Override: PUT)
 *   GET  /wopi/files/{fileId}?access_token=                  (CheckFileInfo)
 *   POST /api/conversion/convert                             {data: base64, source_format, target_format}
 *
 * Standalone mode (no WOPI params): everything passes through untouched, so
 * the vendored editor still runs against a python-docserver if one serves it.
 */
"use strict";

(function () {
  const q = new URLSearchParams(location.search);
  const cfg = (window.__WORLD_OFFICE_CONFIG__ || {});
  const token = q.get("access_token") || q.get("WOPI_ACCESS_TOKEN") || cfg.wopiAccessToken || "";
  const fileId = q.get("file_id") || q.get("WOPI_FILE_ID") || cfg.wopiFileId || "";

  const b64encode = (u8) => {
    let s = "";
    for (let i = 0; i < u8.length; i += 0x8000)
      s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const b64decode = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const jres = (obj, status) => new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "Content-Type": "application/json" },
  });

  async function convert(dataB64, from, to) {
    const res = await fetch("/api/conversion/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: dataB64, source_format: from, target_format: to }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.data || (data.status && data.status !== "Success" && data.status !== "PartialSuccess"))
      throw new Error(data.error || "conversion " + from + "→" + to + " failed (" + res.status + ")");
    return data.data;
  }

  if (!token || !fileId) {
    // Standalone: no interception at all.
    window.__WO_BOOT__ = Promise.resolve();
    return;
  }

  window.__WO_BOOT__ = (async function () {
    const wopiUrl = (suffix) =>
      "/wopi/files/" + encodeURIComponent(fileId) + suffix + "?access_token=" + encodeURIComponent(token);

    // ---- boot: CheckFileInfo + GetFile + convert to HTML -------------------
    let info = {};
    try {
      info = await (await fetch(wopiUrl(""))).json();
    } catch (e) { /* fall back to defaults */ }
    const name = info.BaseFileName || "document.docx";
    window.__DOC_ID__ = fileId;
    window.__DOC_NAME__ = name;
    window.__SESSION__ = "wopi";
    window.__READ_ONLY__ = info.ReadOnly === true || q.get("action") === "view";
    window.__USER_NAME__ = info.UserFriendlyName || info.OwnerFullName || "";
    window.__USER__ = window.__USER_NAME__;

    let lastDocx = new Uint8Array(0); // last saved/loaded document bytes (export source)
    let bootHtml = "";
    try {
      const res = await fetch(wopiUrl("/contents"));
      if (!res.ok) throw new Error("WOPI GetFile failed: " + res.status);
      const buf = new Uint8Array(await (await res.blob()).arrayBuffer());
      if (buf.length) {
        lastDocx = buf;
        const ext = (/\.([a-z0-9]+)$/i.exec(name) || [, "docx"])[1].toLowerCase();
        const htmlB64 = await convert(b64encode(buf), ext === "html" ? "html" : ext, "html");
        // The Rust converter emits a full document; the editor wants a body
        // fragment (the python docserver's /html endpoint returned exactly that).
        const whole = new TextDecoder().decode(b64decode(htmlB64));
        const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(whole);
        bootHtml = body ? body[1] : whole;
      }
    } catch (e) {
      console.error("wo-bridge boot:", e);
      bootHtml = "";
      window.__WO_BOOT_ERROR__ = String(e && e.message || e);
    }

    // ---- fetch interception ------------------------------------------------
    const realFetch = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      const m = /^([^?]*)\/api\/documents\/([^/]+)\/([^?]+)/.exec(url);
      if (!m) {
        if (url === "/api/plugins" || url.indexOf("/api/plugins") === 0) return jres({ plugins: [] });
        return realFetch(input, init);
      }
      const ep = m[3];

      try {
        if (ep === "html") return jres({ html: bootHtml, name: window.__DOC_NAME__ });

        if (ep === "save") {
          const body = JSON.parse((init && init.body) || "{}");
          // flatHtml() emits a bare fragment; the Rust converter needs a
          // full document.
          const frag = body.html || "";
          const full = /^<(!doctype|html[\s>])/i.test(frag.trim())
            ? frag : "<html><body>" + frag + "</body></html>";
          const docxB64 = await convert(b64encode(new TextEncoder().encode(full)), "html", "docx");
          const bytes = b64decode(docxB64);
          const res = await realFetch(wopiUrl("/contents"), {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream", "X-WOPI-Override": "PUT" },
            body: bytes,
          });
          if (!res.ok) return jres({ error: "WOPI PutFile failed: " + res.status }, 502);
          lastDocx = bytes;
          return jres({ ok: true, size: bytes.length });
        }

        if (ep === "export") {
          const fmt = new URL(url, location.origin).searchParams.get("format") || "docx";
          // Export the CURRENT content: serialize the live editor (same path
          // as save) instead of stale lastDocx bytes, so unsaved edits export.
          let src = lastDocx;
          try {
            const ed = document.getElementById("editor");
            const frag = window.__WO_FLAT_HTML__ ? window.__WO_FLAT_HTML__() : (ed ? ed.innerHTML : "");
            if (frag && frag.trim()) {
              const full = /^<(!doctype|html[\s>])/i.test(frag.trim())
                ? frag : "<html><body>" + frag + "</body></html>";
              src = b64decode(await convert(b64encode(new TextEncoder().encode(full)), "html", "docx"));
            }
          } catch (e) { /* fall back to lastDocx */ }
          if (!src.length) return jres({ error: "nothing to export yet" }, 400);
          const outB64 = await convert(b64encode(src), "docx", fmt);
          return new Response(b64decode(outB64), {
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Disposition": 'attachment; filename="' +
                (window.__DOC_NAME__ || "document").replace(/\.[a-z0-9]+$/i, "") + "." + fmt + '"',
            },
          });
        }

        if (ep === "import-docx") {
          const fd = init && init.body;
          if (!(fd && fd.get)) return jres({ error: "empty file" }, 400);
          const f = fd.get("file");
          const inB64 = b64encode(new Uint8Array(await f.arrayBuffer()));
          const htmlB64 = await convert(inB64, "docx", "html");
          return jres({ html: new TextDecoder().decode(b64decode(htmlB64)), name: f && f.name });
        }

        if (ep === "versions") return jres({ versions: [] });
        if (ep === "unlock") return new Response(null, { status: 204 });
        if (ep === "protect") return jres({ restrict_editing: false, password_set: false });
        if (ep.indexOf("collab/") === 0)
          return jres(ep === "collab/sync" ? { ok: true, clients: [] } : { clients: [] });
        // ai/* pass through to the docserver backend: the rust gateway serves
        // propose/review/reject (E-AI-1). A 503 stub here disabled the AI tab
        // even when the backend implements it.
        if (ep.indexOf("ai/") === 0) return realFetch(input, init);
      } catch (e) {
        return jres({ error: String(e && e.message || e) }, 502);
      }
      return realFetch(input, init); // version content/restore & friends: pass through (404s)
    };

    const realBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (u) {
      return /\/api\/documents\//.test(String(u)) ? true : realBeacon(u);
    };
  })();
})();
