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
                          "ul", "ol", "li", "table", "tr", "td", "th", "br", "div", "span"}
        self._unsafe_tags = {"script", "iframe", "object", "embed", "applet", "form", "input",
                            "button", "select", "textarea", "meta", "link", "style", "base",
                            "frame", "frameset", "head", "title", "body", "html"}

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
        self._output.append(data)

    def handle_entityref(self, name: str) -> None:
        self._output.append(f"&{name};")

    def handle_charref(self, name: str) -> None:
        self._output.append(f"&#{name};")

    def get_output(self) -> str:
        return "".join(self._output)


def _attrs_to_html(attrs) -> str:
    """Return HTML attribute string, stripping dangerous on* attributes."""
    if not attrs:
        return ""
    safe_attrs: list[tuple[str, str]] = []
    for name, value in attrs:
        # Strip dangerous event handler attributes
        if name.lower().startswith("on"):
            continue
        # Strip style attributes with URL schemes that could load remote content
        if name.lower() == "style" and value:
            # Allow basic color/spacing styles but strip url(), data: URIs, etc.
            safe_style = _sanitize_style(value)
            if safe_style:
                safe_attrs.append(("style", safe_style))
            continue
        safe_attrs.append((name, value))
    return "".join(f' {name}="{value}"' for name, value in safe_attrs)


def _sanitize_style(value: str) -> str | None:
    """Strip unsafe constructs from inline style. Returns None if style is unsafe."""
    # Allow common text styles but block unsafe constructs
    safe_patterns = [
        r'\s*color\s*:[^;]*;',     # color
        r'\s*background-color\s*:[^;]*;',  # background-color
        r'\s*font-family\s*:[^;]*;',  # font-family
        r'\s*font-size\s*:[^;]*;',    # font-size
        r'\s*text-align\s*:[^;]*;',   # text-align
        r'\s*margin\s*:[^;]*;',       # margin
        r'\s*padding\s*:[^;]*;',      # padding
        r'\s*border\s*:[^;]*;',       # border
        r'\s*text-decoration\s*:[^;]*;',  # text-decoration
    ]

    # Check for dangerous patterns
    unsafe_patterns = [
        r'url\s*\([^)]*\)',         # url(...)
        r'data:',                      # data: URIs
        r'expression\s*\(',           # IE expressions
        r'javascript:',                # javascript: URLs
        r'vbscript:',                  # VBScript URLs
        r'behavior:',                  # CSS behavior
        r'-moz-binding:',              # Mozilla binding
    ]

    for pattern in unsafe_patterns:
        if re.search(pattern, value, re.IGNORECASE):
            return None  # Unsafe, drop the entire style

    # Only keep known-safe style properties
    result = ""
    for pattern in safe_patterns:
        for m in re.finditer(pattern, value, re.IGNORECASE):
            result += m.group(0)

    if not result.strip():
        return None  # Empty or no safe properties

    # Limit length to prevent abuse
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
