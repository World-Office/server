"""HTML sanitizer to prevent XSS in editor content.

Strips dangerous elements and attributes that could lead to XSS attacks
while preserving the formatting (bold, italic, underline, headings, lists)
that editors typically use.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser


class _XSSSanitizer(HTMLParser):
    """Parse HTML and rebuild it without dangerous elements/attributes."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._output: list[str] = []
        self._safe_tags = {"p", "b", "i", "u", "em", "strong", "h1", "h2", "h3", "h4", "h5", "h6",
                          "ul", "ol", "li", "table", "tr", "td", "th", "br", "div", "span",
                          "img", "a"}
        self._unsafe_tags = {"script", "iframe", "object", "embed", "applet", "form", "input",
                            "button", "select", "textarea", "meta", "link", "style", "base",
                            "frame", "frameset", "head", "title", "body", "html"}
        self._void_tags = {"img", "br"}

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag in self._unsafe_tags:
            return  # drop the entire unsafe tag
        if tag in self._safe_tags:
            attr_str = _attrs_to_html(attrs)
            self._output.append(f"<{tag}{attr_str}>")

    def handle_endtag(self, tag: str) -> None:
        if tag in self._unsafe_tags:
            return
        if tag in self._safe_tags:
            self._output.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        # Escape angle brackets in raw data so entity-decoded tags
        # (&#60;script&#62;) can never survive as real HTML elements.
        safe = data.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        self._output.append(safe)

    def handle_entityref(self, name: str) -> None:
        self._output.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._output.append(f"&#{name};")

    def get_output(self) -> str:
        return "".join(self._output)


def _is_safe_url(name: str, value: str) -> bool:
    """Return True if an attribute value is a safe URL for img src / a href."""
    if name == "src":
        # img src: only data:image/ URIs or https(s)/relative (no javascript:, no external tracking)
        if value.startswith("data:image/"):
            return True
        if value.startswith(("https://", "http://", "/", "./", "../")):
            return True
        return False
    if name == "href":
        # a href: http(s), relative, mailto:, tel:, #anchor — but never script schemes
        if value.startswith(("https://", "http://", "mailto:", "tel:", "#", "/", "./", "../")):
            return True
        return False
    return True


def _attrs_to_html(attrs) -> str:
    """Return HTML attribute string, stripping dangerous attributes."""
    if not attrs:
        return ""
    safe_attrs: list[tuple[str, str]] = []
    for name, value in attrs:
        lname = (name or "").lower()
        # Strip dangerous event handler attributes
        if lname.startswith("on"):
            continue
        # Strip style attributes with URL schemes that could load remote content
        if lname == "style" and value:
            # Allow basic color/spacing styles but strip url(), data: URIs, etc.
            safe_style = _sanitize_style(value)
            if safe_style:
                safe_attrs.append(("style", safe_style))
            continue
        # Validate URL-bearing attributes (img src, a href)
        if lname in ("src", "href") and value:
            if not _is_safe_url(lname, value):
                continue  # drop dangerous URL (javascript:, vbscript:, data:text/html)
        safe_attrs.append((name, value))
    return "".join(f' {name}="{value}"' for name, value in safe_attrs)


def _sanitize_style(value: str) -> str | None:
    """Strip unsafe constructs from inline style. Returns None if style is unsafe."""
    # Allow common text styles only (property whitelist)
    safe_props = {
        "color", "background-color", "font-family", "font-size", "font-weight",
        "font-style", "text-align", "text-decoration", "margin", "margin-top",
        "margin-bottom", "margin-left", "margin-right", "padding", "padding-top",
        "padding-bottom", "padding-left", "padding-right", "border", "line-height",
    }

    # Reject any style that contains an unsafe construct anywhere
    unsafe_patterns = [
        r'url\s*\([^)]*\)',      # url(...)
        r'expression\s*\(',       # IE expressions
        r'javascript:',             # javascript: URLs
        r'vbscript:',               # VBScript URLs
        r'behavior:',               # CSS behavior
        r'-moz-binding',            # Mozilla binding
        r'@import',                 # @import
        r'\bposition\s*:',         # position: fixed/absolute (ui hijack)
    ]
    for pattern in unsafe_patterns:
        if re.search(pattern, value, re.IGNORECASE):
            return None

    # Split into individual declarations and keep only whitelisted props.
    result_parts: list[str] = []
    for decl in value.split(";"):
        decl = decl.strip()
        if not decl:
            continue
        if ":" not in decl:
            continue
        prop, _, val = decl.partition(":")
        prop = prop.strip().lower()
        val = val.strip()
        if prop not in safe_props:
            continue
        # Reject dangerous values within an otherwise-safe property
        if re.search(r'(url\s*\(|data:|base64|\bexpression\b|javascript:|vbscript:)', val, re.IGNORECASE):
            continue
        result_parts.append(f"{prop}: {val};")

    result = " ".join(result_parts)
    if not result.strip():
        return None
    if len(result) > 512:
        return None
    return result.strip()


def sanitize_html(html: str) -> str:
    """Sanitize HTML, stripping script tags, iframe, and event handlers.

    Preserves safe formatting tags: p, b, i, u, h1-h6, ul, ol, li, table, tr, td, th, br.
    Removes on* event attributes (onclick, onerror, etc.) and dangerous style values.
    """
    if not html:
        return ""
    sanitizer = _XSSSanitizer()
    try:
        sanitizer.feed(html)
    except Exception:
        # If parsing fails, return empty string for safety
        return ""
    return sanitizer.get_output()
