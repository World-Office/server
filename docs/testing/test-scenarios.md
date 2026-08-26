# Test-Szenarien und User Stories — OpenCloud Editor

**Stand:** 2026-08-24  
**Ziel:** Vollständige Feature-Abdeckung mit automatisierten + manuellen Tests  
**Aktueller Stand:** 79 Unit-Tests, 29 TDD-Tasks (7 DONE, 3 running, 19 ready)

---

## 1. Executive Summary

| Kategorie | Heute | Ziel | Gap |
|---|---|---|---|
| **Unit-Tests** | 79 | 150+ | +71 |
| **Integration-Tests** | 26 (test_wopi.py) | 50+ | +24 |
| **E2E-Tests** | ~10 (tests/e2e/) | 30+ | +20 |
| **Performance-Tests** | 0 | 10+ | +10 |
| **Security-Tests** | 4 (test_crypto.py, XSS) | 15+ | +11 |
| **Accessibility-Tests** | 0 | 10+ | +10 |

**Priorität:** ODT-Support (Blocker), Kollaboration (Critical), Performance (Major), Accessibility (Major)

---

## 2. Feature-Matrix (Lücken-Analyse)

| Feature | Unit | Integration | E2E | Performance | Security | Accessibility |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Converter DOCX↔HTML** | ✅ | ✅ | ⚠️ | ❌ | ❌ | ❌ |
| **Converter ODT↔HTML** | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Converter Bilder (DOCX/ODT)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Converter Tabellen** | ⚠️ | ⚠️ | ❌ | ❌ | ❌ | ❌ |
| **Editor-UI Toolbar** | ⚠️ | ⚠️ | ⚠️ | ❌ | ❌ | ❌ |
| **Editor-UI Formatierung** | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| **WOPI-Host (Core)** | ✅ | ✅ | ⚠️ | ❌ | ✅ | ❌ |
| **WOPI-Discovery (ODT)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Kollaboration (Realtime)** | ❌ | ❌ | ⚠️ | ❌ | ❌ | ❌ |
| **WOPI-Locking** | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ |
| **Security (XSS, Injection)** | ✅ | ⚠️ | ❌ | ❌ | ✅ | ❌ |
| **ODT-Support (vollständig)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Share/Permissions** | ❌ | ❌ | ❌ | ❌ | ⚠️ | ❌ |
| **Accessibility (a11y)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

**Legende**: ✅ = gut abgedeckt, ⚠️ = teilweise, ❌ = Lücke

---

## 3. User Stories (US-25 bis US-60)

### **Converter-Tests**

#### US-25: ODT-Bilder-Roundtrip (Blocker)
**Beschreibung**: ODT-Dateien mit eingebetteten Bildern müssen korrekt in HTML konvertiert werden (und umgekehrt), ohne dass Bilder verloren gehen oder verzerrt werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_odt_converter.py -q -k "image_roundtrip"
```

**Explorations-Schritte (manuell)**:
1. Erstelle ODT mit 3 Bildern (verschiedene Größen: 100x100, 800x600, 4000x3000)
2. Öffne im Editor → prüfe Bild-Qualität (keine Verzerrung, korrekte Größe)
3. Speichern → heruntergeladene ODT prüfen (Bilder intakt, gleiche Größe)
4. Edge-Case: Transparente PNGs, GIFs, sehr große Bilder (>10MB)
5. Edge-Case: Bilder mit Text-Wrapping (links/rechts/umfließend)

**Priorität**: Blocker

---

#### US-26: ODT-Tabellen-Roundtrip (Critical)
**Beschreibung**: ODT-Tabellen mit Zellenkombinationen (colspan/rowspan), Farben und Rahmen müssen korrekt konvertiert werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_odt_converter.py -q -k "table_roundtrip"
```

**Explorations-Schritte (manuell)**:
1. Erstelle ODT-Tabelle: 3x4 Zellen, 2 Zellen zusammengefasst (colspan=2)
2. Füge Hintergrundfarbe und Rahmen hinzu
3. Öffne im Editor → prüfe Struktur und Styling
4. Speichern → ODT prüfen (Zellenkombination intakt?)
5. Edge-Case: Nested tables, Tabellen mit Bildern in Zellen

**Priorität**: Critical

---

#### US-27: DOCX-Bilder-Roundtrip (Critical)
**Beschreibung**: DOCX-Bilder müssen in HTML korrekt konvertiert werden (Base64 oder Blob-URL), ohne Qualitätverlust.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_converter.py -q -k "image_roundtrip"
```

**Explorations-Schritte (manuell)**:
1. Erstelle DOCX mit 2 Bildern (JPG, PNG)
2. Öffne im Editor → prüfe Bild-Anzeige
3. Speichern als DOCX → Bilder intakt?
4. Edge-Case: Bilder mit Text-Wrapping, sehr große Bilder

**Priorität**: Critical

---

#### US-28: DOCX-Tabellen-Roundtrip (Major)
**Beschreibung**: DOCX-Tabellen mit komplexer Struktur (colspan/rowspan, Farben) müssen korrekt konvertiert werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_converter.py -q -k "table_complex"
```

**Explorations-Schritte (manuell)**:
1. Erstelle DOCX-Tabelle mit zusammengefassten Zellen
2. Füge Hintergrundfarben hinzu
3. Öffne im Editor → prüfe Struktur
4. Edge-Case: Sehr große Tabellen (50+ Zeilen)

**Priorität**: Major

---

#### US-29: Heading-Styles Roundtrip (Major)
**Beschreibung**: Überschriften (H1-H6) müssen in allen Formaten (DOCX, ODT, HTML) korrekt konvertiert werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_converter.py -q -k "heading"
```

**Explorations-Schritte (manuell)**:
1. Erstelle Dokument mit H1-H6 Hierarchie
2. Öffne in Editor → prüfe Formatierung
3. Speichern als DOCX/ODT → Heading-Styles intakt?
4. Edge-Case: Überschriften mit Formatierung (Bold, Color)

**Priorität**: Major

---

#### US-30: Performance - Große Dokumente (Major)
**Beschreibung**: Konvertierung von Dokumenten mit 100+ Seiten und 50+ Bildern sollte unter 5 Sekunden dauern.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_converter.py -q -k "performance_large"
```

**Explorations-Schritte (manuell)**:
1. Erstelle DOCX mit 100 Seiten, 50 Bildern
2. Konvertierung messen (Zeit, Speicherverbrauch)
3. Editor-Ladezeit messen
4. Edge-Case: 200+ Seiten, 100+ Bilder (Limit finden)

**Priorität**: Major

---

### **Editor-UI-Tests**

#### US-31: Undo/Redo-Kette (Critical)
**Beschreibung**: Undo/Redo muss 20+ Schritte korrekt zurückverfolgen, auch nach Speichern.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_client_mode.py -q -k "undo_redo"
```

**Explorations-Schritte (manuell)**:
1. Öffne Dokument, führe 20 Änderungen durch (Text, Formatierung, Bilder)
2. Undo 20x → jede Änderung korrekt rückgängig?
3. Redo 20x → jede Änderung korrekt wiederhergestellt?
4. Edge-Case: Undo nach Speichern, Undo bei Kollaboration

**Priorität**: Critical

---

#### US-32: Formatierungs-Roundtrip (Major)
**Beschreibung**: Alle Formatierungen (Bold, Italic, Color, Font-Size, Alignment) müssen in DOCX/ODT korrekt gespeichert werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_converter.py -q -k "formatting"
```

**Explorations-Schritte (manuell)**:
1. Formatieren: Bold, Italic, Underline, Strikethrough
2. Farben: Text-Farbe, Hintergrundfarbe
3. Font-Size: 8pt - 72pt
4. Alignment: Left, Center, Right, Justify
5. Speichern → DOCX/ODT prüfen (alle Formate intakt?)

**Priorität**: Major

---

#### US-33: Bild-Einsetzen via Upload (Critical)
**Beschreibung**: Bilder müssen per Drag&Drop oder Upload-Dialog eingefügt werden können, mit Größenanpassung.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_image_upload.py -q
```

**Explorations-Schritte (manuell)**:
1. Drag&Drop: JPG, PNG, GIF (verschiedene Größen)
2. Upload-Dialog: Datei auswählen, Bild einfügen
3. Bild-Größe anpassen (Ziehpunkte, exakte Werte)
4. Edge-Case: Sehr große Bilder (>10MB), transparente PNGs

**Priorität**: Critical

---

#### US-34: Tabelle-Einsetzen (Major)
**Beschreibung**: Tabellen müssen per Dialog eingefügt werden können, mit Spalten/Zeilen-Anpassung.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_table_insert.py -q
```

**Explorations-Schritte (manuell)**:
1. Tabelle einfügen: 3x4, 10x10, 1x1
2. Spalten/Zeilen hinzufügen/löschen
3. Zellen kombinieren (colspan/rowspan)
4. Edge-Case: Sehr große Tabellen (50x50)

**Priorität**: Major

---

#### US-35: Find & Replace (Major)
**Beschreibung**: Suchen und Ersetzen muss im gesamten Dokument funktionieren, auch bei Formatierung.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_find_replace.py -q
```

**Explorations-Schritte (manuell)**:
1. Einfache Suche: "foo" → "bar"
2. Alle ersetzen: 50 Vorkommen
3. Mit Formatierung: Suchen nach Bold-Text
4. Edge-Case: Case-sensitive, Whole word only

**Priorität**: Major

---

#### US-36: Mobile Responsive UI (Major)
**Beschreibung**: Editor muss auf Tablets (768px) und Smartphones (375px) bedienbar sein.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_mobile_responsive.py -q
```

**Explorations-Schritte (manuell)**:
1. Tablet (768px): Toolbar bedienbar? Text eingeben möglich?
2. Smartphone (375px): Toolbar responsive? Touch-Editing?
3. Edge-Case: Landscape vs Portrait, Zoom (200%)

**Priorität**: Major

---

### **WOPI-Host-Tests**

#### US-37: ODT-Discovery (Critical)
**Beschreibung**: OpenCloud muss ODT-Dateien über WOPI Discovery erkennen und im Editor öffnen können.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "odt_discovery"
```

**Explorations-Schritte (manuell)**:
1. ODT-Datei in OpenCloud hochladen
2. "Edit in browser" klicken → Editor öffnet ODT?
3. Speichern → ODT aktualisiert?
4. Edge-Case: ODT mit Bildern, ODT mit Tabellen

**Priorität**: Critical

---

#### US-38: WOPI-Lock-Contention (Critical)
**Beschreibung**: Wenn 2 Benutzer gleichzeitig eine Datei öffnen, muss der zweite Benutzer die Lock-Konflikte sehen.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "lock_contention"
```

**Explorations-Schritte (manuell)**:
1. Benutzer A: Datei öffnen, bearbeiten
2. Benutzer B: Gleiche Datei öffnen → "File is locked" Meldung?
3. Benutzer A: Speichern, Datei schließen
4. Benutzer B: Datei jetzt öffnen → Zugriff möglich?
5. Edge-Case: Benutzer A crasht (Lock Timeout?)

**Priorität**: Critical

---

#### US-39: WOPI-PutFile mit Lock (Critical)
**Beschreibung**: PutFile muss mit gültigem Lock-Token funktionieren, ohne Lock → 409 Conflict.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "putfile_lock"
```

**Explorations-Schritte (manuell)**:
1. Lock acquirieren, PutFile mit Lock → 200 OK
2. PutFile ohne Lock → 409 Conflict
3. PutFile mit falschem Lock → 409 Conflict
4. Edge-Case: Lock abgelaufen (Timeout)

**Priorität**: Critical

---

#### US-40: WOPI-VersionProof (Major)
**Beschreibung**: X-WOPI-ItemVersion muss bei jeder Änderung aktualisiert werden, um Race Conditions zu vermeiden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "version_proof"
```

**Explorations-Schritte (manuell)**:
1. Datei öffnen (Version V1)
2. Speichern → Version V2
3. Nochmal speichern (alte Version V1) → Conflict?
4. Edge-Case: Paralleles Speichern (2 Clients gleichzeitig)

**Priorität**: Major

---

### **Kollaboration-Tests**

#### US-41: Realtime-Cursor-Tracking (Critical)
**Beschreibung**: Mehrere Benutzer müssen ihre Cursor-Positionen in Echtzeit sehen können.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_collab_cursors.py -q
```

**Explorations-Schritte (manuell)**:
1. Benutzer A: Datei öffnen, an Position X klicken
2. Benutzer B: Gleiche Datei öffnen → Cursor A sichtbar?
3. Beide gleichzeitig tippen → Änderungen sichtbar?
4. Edge-Case: 5+ Benutzer gleichzeitig

**Priorität**: Critical

---

#### US-42: Realtime-Text-Sync (Blocker)
**Beschreibung**: Text-Änderungen müssen in <200ms an alle Clients gesynced werden.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_collab_sync.py -q -k "text_sync"
```

**Explorations-Schritte (manuell)**:
1. Benutzer A: "Hello" tippen
2. Benutzer B: "Hello" erscheint innerhalb 200ms?
3. Beide gleichzeitig tippen → Merge korrekt?
4. Edge-Case: Sehr schnelle Eingabe (100 Zeichen/Sek)

**Priorität**: Blocker

---

#### US-43: Kollaboration bei Netzwerkausfall (Major)
**Beschreibung**: Bei Netzwerkausfall muss der Editor offline weiterarbeiten, mit Auto-Sync bei Wiederherstellung.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_collab_offline.py -q
```

**Explorations-Schritte (manuell)**:
1. Netzwerk trennen (Network tab in DevTools)
2. Änderungen tippen → lokal gespeichert?
3. Netzwerk wiederherstellen → Änderungen gesynced?
4. Edge-Case: Konflikte bei Sync (2 Clients offline)

**Priorität**: Major

---

### **Security-Tests**

#### US-44: XSS-Sanitizer-Evasion (Critical)
**Beschreibung**: Der XSS-Sanitizer muss alle bekannten Evasions-Techniken blockieren (event handlers, javascript: URLs, encoded payloads).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "sanitize_evasion"
```

**Explorations-Schritte (manuell)**:
1. Payload: `<img src=x onerror=alert(1)>` → blockiert?
2. Payload: `<a href="javascript:alert(1)">` → blockiert?
3. Payload: Encoded HTML (`&#60;script&#62;`) → blockiert?
4. Payload: CSS Injection (`<style>body{background:url(javascript:...))</style>`) → blockiert?
5. Edge-Case: Unicode-Evasions, Null-Byte-Injection

**Priorität**: Critical

---

#### US-45: JWT-Token-Expiration (Major)
**Beschreibung**: Abgelaufene JWT-Tokens müssen abgelehnt werden, mit korrekter Error-Message.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "jwt_expiration"
```

**Explorations-Schritte (manuell)**:
1. Token mit `exp=0` (abgelaufen) → 401 Unauthorized?
2. Token mit `exp=future` → 200 OK?
3. Token ohne `exp` → 400 Bad Request?
4. Edge-Case: Clock-Skew (Token 1min in der Zukunft)

**Priorität**: Major

---

#### US-46: Rate-Limiting WOPI (Major)
**Beschreibung**: Zu viele WOPI-Requests in kurzer Zeit müssen gedrosselt werden (DoS-Schutz).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "rate_limit"
```

**Explorations-Schritte (manuell)**:
1. 100 Requests/Sek → 429 Too Many Requests nach X Requests?
2. Rate-Limit Reset nach Y Sekunden?
3. Edge-Case: Whitelist für vertrauenswürdige IPs

**Priorität**: Major

---

#### US-47: File-Path-Traversal (Critical)
**Beschreibung**: Datei-IDs müssen validiert werden, um Path-Traversal-Angriffe zu verhindern (`../../etc/passwd`).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_wopi.py -q -k "path_traversal"
```

**Explorations-Schritte (manuell)**:
1. Datei-ID: `../../../etc/passwd` → 400 Bad Request?
2. Datei-ID: `..%2F..%2Fetc/passwd` (encoded) → 400?
3. Edge-Case: Null-Byte (`file\x00.docx`)

**Priorität**: Critical

---

### **ODT-Support-Tests**

#### US-48: ODT-Vollständige Konvertierung (Blocker)
**Beschreibung**: ODT muss alle grundlegenden Elemente unterstützen: Text, Absätze, Überschriften, Listen, Bilder, Tabellen.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_odt_converter.py -q -k "full_support"
```

**Explorations-Schritte (manuell)**:
1. ODT erstellen mit: Text, H1-H3, Bullets, Numbers, 2 Bilder, 1 Tabelle
2. In Editor öffnen → alle Elemente korrekt?
3. Speichern → ODT intakt?
4. Edge-Case: ODT mit Footnotes, ODT mit Formeln

**Priorität**: Blocker

---

#### US-49: ODT-Metadata-Erhaltung (Major)
**Beschreibung**: ODT-Metadata (Author, Created, Modified) muss bei Konvertierung erhalten bleiben.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_odt_converter.py -q -k "metadata"
```

**Explorations-Schritte (manuell)**:
1. ODT mit Metadata (Author="Max", Created="2026-01-01")
2. In Editor öffnen → Metadata sichtbar?
3. Speichern → Metadata intakt?
4. Edge-Case: Metadata mit Sonderzeichen

**Priorität**: Major

---

#### US-50: ODT-Styles-Erhaltung (Major)
**Beschreibung**: ODT-Styles (Paragraph-Styles, Character-Styles) müssen bei Konvertierung erhalten bleiben.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/test_odt_converter.py -q -k "styles"
```

**Explorations-Schritte (manuell)**:
1. ODT mit benutzerdefinierten Styles erstellen
2. In Editor öffnen → Styles angewendet?
3. Speichern → Styles intakt?
4. Edge-Case: Nested Styles, Style-Inheritance

**Priorität**: Major

---

### **Accessibility-Tests**

#### US-51: Keyboard-Navigation (Critical)
**Beschreibung**: Der Editor muss vollständig per Tastatur bedienbar sein (Tab, Enter, Arrow Keys, Shortcuts).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_a11y_keyboard.py -q
```

**Explorations-Schritte (manuell)**:
1. Tab-Navigation: Alle UI-Elemente erreichbar?
2. Shortcuts: Ctrl+B (Bold), Ctrl+I (Italic), Ctrl+S (Save)
3. Text-Editing: Arrow Keys, Home, End, Delete
4. Edge-Case: Screen-Reader-Kompatibilität (NVDA, JAWS)

**Priorität**: Critical

---

#### US-52: Screen-Reader-Support (Major)
**Beschreibung**: Screen-Reader müssen Editor-Inhalte korrekt vorlesen können (ARIA-Labels, Live Regions).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_a11y_screenreader.py -q
```

**Explorations-Schritte (manuell)**:
1. NVDA aktivieren: Editor-Inhalte vorlesbar?
2. ARIA-Labels: Alle Buttons beschriftet?
3. Live Regions: Änderungen angesagt?
4. Edge-Case: Komplexe Widgets (Dropdown, Dialog)

**Priorität**: Major

---

#### US-53: Color-Contrast (Major)
**Beschreibung**: Alle UI-Elemente müssen WCAG 2.1 AA Color-Contrast-Ratios erfüllen (4.5:1 für Text, 3:1 für Large Text).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_a11y_contrast.py -q
```

**Explorations-Schritte (manuell)**:
1. Toolbar-Buttons: Contrast ≥ 4.5:1?
2. Text-Editor: Contrast ≥ 4.5:1?
3. Edge-Case: Dark Mode, High-Contrast Mode

**Priorität**: Major

---

### **Performance-Tests**

#### US-54: Editor-Load-Time (Major)
**Beschreibung**: Editor muss in <2 Sekunden laden (First Contentful Paint) auf langsamen Netzwerken (3G).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_performance_load.py -q -k "load_time"
```

**Explorations-Schritte (manuell)**:
1. Network: 3G (Slow 3G in DevTools)
2. Editor öffnen: FCP < 2s?
3. Edge-Case: Caching (2. Load < 500ms)

**Priorität**: Major

---

#### US-55: Typing-Performance (Critical)
**Beschreibung**: Editor muss 100+ Zeichen/Sekunde ohne Verzögerung verarbeiten (Lag < 50ms).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_performance_typing.py -q
```

**Explorations-Schritte (manuell)**:
1. 100 Zeichen/Sekunde tippen → Lag < 50ms?
2. 500 Zeichen/Sekunde → Lag < 100ms?
3. Edge-Case: Große Dokumente (100+ Seiten)

**Priorität**: Critical

---

#### US-56: Memory-Leaks (Major)
**Beschreibung**: Editor darf nach 1 Stunde Nutzung nicht mehr als 50MB zusätzlich speichern (Memory-Leak-Freiheit).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_performance_memory.py -q
```

**Explorations-Schritte (manuell)**:
1. Editor öffnen, 1 Stunde nutzen (Tippen, Formatieren, Bilder)
2. Memory-Usage messen: < 50MB Delta?
3. Edge-Case: 10 Tabs offen, Memory-Usage?

**Priorität**: Major

---

### **E2E-Tests**

#### US-57: Vollständiger Workflow (Blocker)
**Beschreibung**: End-to-End-Test: Datei hochladen → Öffnen → Bearbeiten → Speichern → Herunterladen → Prüfen.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_full_workflow.py -q
```

**Explorations-Schritte (manuell)**:
1. DOCX in OpenCloud hochladen
2. "Edit in browser" → Editor öffnet
3. Text ändern, Formatierung, Bild einfügen
4. Speichern → DOCX in OpenCloud aktualisiert
5. Herunterladen → Änderungen im DOCX?

**Priorität**: Blocker

---

#### US-58: Share-Link-Workflow (Major)
**Beschreibung**: Geteilte Links (Read-only, Read-Write) müssen korrekt funktionieren.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_share_workflow.py -q
```

**Explorations-Schritte (manuell)**:
1. Datei teilen: Read-only Link erstellen
2. Link öffnen → Datei lesbar, nicht editierbar?
3. Datei teilen: Read-Write Link erstellen
4. Link öffnen → Datei editierbar?
5. Edge-Case: Link ablaufen lassen, Link widerrufen

**Priorität**: Major

---

#### US-59: Browser-Kompatibilität (Major)
**Beschreibung**: Editor muss in Chrome, Firefox, Safari, Edge (aktuelle Versionen) funktionieren.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_browser_compat.py -q
```

**Explorations-Schritte (manuell)**:
1. Chrome: Alle Features?
2. Firefox: Alle Features?
3. Safari: Alle Features?
4. Edge: Alle Features?
5. Edge-Case: Alte Browser (Chrome 80+)

**Priorität**: Major

---

#### US-60: PWA-Offline-Support (Major)
**Beschreibung**: Editor muss als PWA offline funktionieren (Service Worker caching, Offline-Queue).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_pwa_offline.py -q
```

**Explorations-Schritte (manuell)**:
1. PWA installieren (Add to Home Screen)
2. Netzwerk trennen → Editor lädt?
3. Änderungen offline tippen → Auto-Sync bei Online?
4. Edge-Case: Offline für 1 Woche, Sync bei Wiederherstellung

**Priorität**: Major

---

#### US-61: Hyperlink einfügen und Roundtrip (Major)
**Beschreibung**: Toolbar-Button + Dialog fügen einen Link über die Auswahl ein; der Link übersteht Speichern/Laden (DOCX `w:hyperlink` + externe Beziehung). Unsichere Schemes (`javascript:`) werden verworfen.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k insert_link
uv run pytest tests/test_converter.py -q -k link
```

**Explorations-Schritte (manuell)**:
1. Text markieren → 🔗 → URL eintragen → OK
2. Link im Editor anklickbar?
3. Speichern, neu laden → Link-Href erhalten?
4. Edge-Case: `javascript:alert(1)` als URL → wird verworfen

**Priorität**: Major

---

#### US-62: Textfarbe, Highlight, Hoch-/Tiefstellung (Major)
**Beschreibung**: Farb- und Highlight-Picker sowie Superscript/Subscript-Buttons formatieren Runs; die Formatierung übersteht den DOCX-Roundtrip (`w:color`, `w:shd`, `vertAlign`). Der Sanitizer erlaubt nur sichere Farbwerte (`#rrggbb`/`rgb()`).

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k format_color
uv run pytest tests/test_converter.py -q -k color
```

**Explorations-Schritte (manuell)**:
1. Text markieren → Farbe wählen
2. Text markieren → Highlight wählen
3. Text markieren → x² / x₂
4. Speichern, neu laden → Formatierung erhalten?

**Priorität**: Major

---

#### US-63: Tabellen-Zellen bearbeiten (Major)
**Beschreibung**: „Tabellenaktionen“-Dialog (▦✎): Zeile/Spalte einfügen und löschen, Zellen per Auswahlmergen (colspan/rowspan) und wieder splitten. Die Struktur übersteht den Roundtrip inklusive gespeicherter `colspan`-Attribute.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k table_merge
uv run pytest tests/test_converter.py -q -k table
```

**Explorations-Schritte (manuell)**:
1. Tabelle einfügen (2×2)
2. Zwei Zellen einer Zeile markieren → Merge (colspan)
3. Spalte löschen → Layout prüfen
4. Speichern, neu laden → Merge-Struktur erhalten?

**Priorität**: Major

---

#### US-64: Horizontale Linie, Seitenumbruch, Symbol-Picker (Major)
**Beschreibung**: „─“ fügt ein `<hr>` ein (DOCX: Absatz mit unterer Rahmenlinie), „⏎“ einen Seitenumbruch (DOCX: `<w:br w:type='page'/>`), „Ω“ öffnet den Symbol-/Emoji-Picker (einfügen als Text). Alles übersteht Speichern und Neuladen.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k hr_pagebreak
uv run pytest tests/test_converter.py -q -k "hr or page_break"
```

**Explorations-Schritte (manuell)**:
1. „─“ klicken → Linie erscheint am Caret
2. „⏎“ klicken, danach tippen → Text landet nach dem Umbruch
3. „Ω“ → Symbol wählen → Zeichen eingefügt
4. Speichern, neu laden → alles erhalten?

**Priorität**: Major

---

#### US-65: Kollaborations-Präsenz (Major)
**Beschreibung**: Zwei Editoren sehen sich gegenseitig als farbigen Chip (stabile Farbe pro Client) und einen Remote-Caret über dem Dokument; lokale Identität als „(you)“ markiert. Präsenz wird über den Collab-Poll aktualisiert.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k collaborate
```

**Explorations-Schritte (manuell)**:
1. Dokument in zwei Browsern öffnen
2. Beide sehen den jeweils anderen als Chip?
3. Remote-Caret erscheint bei Eingaben des anderen?
4. Schließen eines Tabs → Chip verschwindet (per Poll)?

**Priorität**: Major

---

#### US-66: Ansicht: Zoom, Theme, Vollbild (Minor)
**Beschreibung**: −/100%/＋ skalieren nur die Schreibfläche (per Client gespeichert), 🌙 wechselt Hell/Dunkel, ⛶ schaltet Vollbild um.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k view_controls
```

**Explorations-Schritte (manuell)**:
1. Zoom + → Schriftfläche wächst, Dokument-Inhalt unverändert
2. Theme umschalten → Hintergrund wechselt, Einstellung bleibt erhalten
3. Vollbild umschalten → Layout expandiert

**Priorität**: Minor

---

#### US-67: Datei-Menü: Neu und Export (Major)
**Beschreibung**: „Export“ bietet PDF/ODT/HTML/DOCX-Downloads (Konvertierung serverseitig); „Neu“ leert das Dokument nach Bestätigung und speichert den Leerstand sofort. Drucken öffnet den Browser-Druckdialog mit Papier-Styling.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k file_menu
uv run pytest tests/test_file_ops.py -q
```

**Explorations-Schritte (manuell)**:
1. Datei → Export → ODT → Datei in LibreOffice öffnen?
2. Datei → Neu → Bestätigen → Editor leer, Neuladen bleibt leer
3. Drucken → nur das Papier im Druckdialog

**Priorität**: Major

---

#### US-68: Offline-Queue und Resync (Major)
**Beschreibung**: Schlägt ein Speichern mangels Verbindung fehl, wird der aktuelle Stand lokal gequeued (localStorage), ein „Offline“-Indikator erscheint, und beim Zurückkehren der Verbindung wird automatisch synchronisiert.

**Acceptance-Test (automatisiert)**:
```bash
cd /home/weiss/git/World-Office/server/opencloud-docserver
uv run pytest tests/e2e/test_cloud_editor_e2e.py -q -k offline_queue
```

**Explorations-Schritte (manuell)**:
1. Netzwerk trennen, weiter tippen, Speichern → „Offline“-Hinweis
2. Tab neu laden (offline) → gequeuter Stand erscheint
3. Netzwerk wieder da → automatische Synchronisation, Hinweis verschwindet

**Priorität**: Major

---

## 4. Taskfleet-Integration

### **Automatisierte Tasks (für Taskfleet)**

Folgende User Stories sollten direkt als Taskfleet-Tasks hinzugefügt werden (mit Acceptance-Commands):

| Task-ID | Titel | Engine | Acceptance-Command |
|---|---|---|---|
| `test-odt-images` | ODT-Bilder-Roundtrip | odt | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_odt_converter.py -q -k image_roundtrip` |
| `test-odt-tables` | ODT-Tabellen-Roundtrip | odt | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_odt_converter.py -q -k table_roundtrip` |
| `test-undo-redo` | Undo/Redo-Kette | editor | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_client_mode.py -q -k undo_redo` |
| `test-image-upload` | Bild-Einsetzen via Upload | e2e | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/e2e/test_image_upload.py -q` |
| `test-wopi-lock` | WOPI-Lock-Contention | wopi | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_wopi.py -q -k lock_contention` |
| `test-collab-sync` | Realtime-Text-Sync | e2e | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/e2e/test_collab_sync.py -q -k text_sync` |
| `test-xss-evasion` | XSS-Sanitizer-Evasion | security | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_wopi.py -q -k sanitize_evasion` |
| `test-path-traversal` | File-Path-Traversal | security | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/test_wopi.py -q -k path_traversal` |
| `test-a11y-keyboard` | Keyboard-Navigation | e2e | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/e2e/test_a11y_keyboard.py -q` |
| `test-full-workflow` | Vollständiger Workflow | e2e | `cd /home/weiss/git/World-Office/server/opencloud-docserver && uv run pytest tests/e2e/test_full_workflow.py -q` |

### **Manuelle QA-Suite**

Folgende User Stories sind für manuelle Exploration gedacht (keine automatisierten Tests):

- US-25: ODT-Bilder-Roundtrip (Edge-Cases)
- US-26: ODT-Tabellen-Roundtrip (Edge-Cases)
- US-30: Performance - Große Dokumente
- US-35: Find & Replace (Edge-Cases)
- US-38: WOPI-Lock-Contention (Edge-Cases)
- US-43: Kollaboration bei Netzwerkausfall
- US-52: Screen-Reader-Support
- US-56: Memory-Leaks

---

## 5. Nächste Schritte

1. **Test-Infrastruktur aufbauen**: E2E-Tests in `tests/e2e/` (Playwright)
2. **Taskfleet-Tasks hinzufügen**: 10 neue Tasks in `config/tasks.json`
3. **Priorisierte Umsetzung**: Blocker → Critical → Major
4. **QA-Checkliste**: Manuelle Tests dokumentieren (Notion/Google Docs)

---

**Git-Commit**: `docs(testing): test-scenarios complete (US-25 to US-60)`
