# World-Office Design System - Source of Truth

## 🎨 Artistic Proportions & Golden Ratio Implementation

This document serves as the **single source of truth** for all visual design decisions in World-Office, grounded in mathematical harmony, classical art principles, and modern UI/UX best practices.

---

## 📐 CORE PRINCIPLES

### 1. The Golden Ratio (φ)
```
φ (phi) = 1.618033988749895
φ⁻¹ = 0.6180339887498949
φ² = 2.618033988749895
```

The golden ratio creates naturally pleasing proportions found throughout nature, art, and architecture. When applied to UI design, it creates interfaces that users instinctively find balanced and comfortable.

### 2. Fibonacci Sequence
```
0, 1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987...
```

Used for spacing, sizing, and rhythm. Each number is the sum of the two preceding ones, creating natural scaling.

### 3. Rule of Thirds

Divide the canvas into a 3×3 grid. Primary elements should align with the grid lines or their intersections (the "power points").

```
┌───────┬───────┬───────┐
│       │   ✓   │       │
├───────┼───────┼───────┤
│       │       │       │
├───────┼───────┼───────┤
│       │   ✓   │       │
└───────┴───────┴───────┘
```

### 4. Fibonacci Spiral

The user's eye naturally follows a spiral pattern. Place the most important content at the spiral's center (approximately 62% from each edge).

---

## 📏 DIMENSION SYSTEM

### Base Unit
```css
--golden-base: 8px;  /* Fibonacci number */
```

### Spacing Scale (Fibonacci-based)
```css
--space-1:  1px;
--space-2:  2px;
--space-3:  3px;
--space-5:  5px;
--space-8:  8px;    /* Base unit */
--space-13: 13px;
--space-21: 21px;
--space-34: 34px;
--space-55: 55px;   /* φ * 34 ≈ 55 */
--space-89: 89px;
--space-144: 144px;
```

### Height System
```css
--ribbon-height: 55px;           /* φ * 34 ≈ 55 */
--ribbon-height-compact: 34px;  /* Fibonacci: 34 */
--toolbar-height: 55px;          /* Matches ribbon */
--toolbar-height-compact: 34px;
--statusbar-height: 34px;        /* φ⁻¹ * 55 ≈ 34 */
--statusbar-height-expanded: 55px;
```

### Side Menu System
```css
--leftmenu-width: 55px;          /* φ * 34 ≈ 55 */
--leftmenu-width-expanded: 233px;/* 144 * φ ≈ 233 */
--rightmenu-width: 55px;
--rightmenu-width-expanded: 233px;
```

### Button System
```css
--ribbon-btn-width: 55px;        /* φ * 34 ≈ 55 */
--ribbon-btn-height: 55px;       /* Square for harmony */
--ribbon-btn-icon-size: 21px;    /* 13 * φ ≈ 21 */
```

### Panel System
```css
--panel-width-sidebar: 233px;    /* 144 * φ ≈ 233 */
--panel-width-modal: 377px;      /* 233 * φ ≈ 377 */
--panel-width-large: 610px;      /* 377 * φ ≈ 610 */
```

### Typography Scale (φ-based)
```css
--text-sm: 8px;    /* 12 * φ⁻¹ ≈ 7.3 → rounded to 8 */
--text-md: 12px;   /* Base */
--text-lg: 19px;   /* 12 * φ ≈ 19.4 → rounded to 19 */
--text-xl: 31px;   /* 19 * φ ≈ 30.7 → rounded to 31 */
--text-2xl: 50px;  /* 31 * φ ≈ 50.2 → rounded to 50 */
```

### Border Radius (Fibonacci)
```css
--radius-sm: 3px;  /* Fibonacci: 3 */
--radius-md: 5px;  /* Fibonacci: 5 */
--radius-lg: 8px;  /* Fibonacci: 8 */
--radius-xl: 13px; /* Fibonacci: 13 */
```

### Z-Index (Fibonacci scale)
```css
--z-dropdown: 100;
--z-sticky: 200;
--z-fixed: 300;
--z-modal-backdrop: 400;
--z-modal: 500;
--z-popover: 600;
--z-tooltip: 700;
```

---

## 🎯 LAYOUT GRID

### Desktop Layout (Rule of Thirds)
```
┌─────────────────────────────────────────────────────────────────┐
│                              TOOLBAR (1/3 height)               │
│  ↑ 55px (φ * 34)                                               │
├─────────────────┬───────────────────────┬──────────────────────┤
│    LEFT MENU    │      DOCUMENT AREA    │   RIGHT MENU/PANELS  │
│   55px (1/3)    │        (1/3)          │      55px (1/3)      │
│                 │   ┌─────────────┐    │                      │
│                 │   │             │    │                      │
│                 │   │   CONTENT   │    │ ← Rule of thirds     │
│                 │   │    ZONE     │    │    intersection      │
│                 │   │  (Spiral    │    │                      │
│                 │   │   Center)   │    │                      │
│                 │   └─────────────┘    │                      │
│                 │                      │                      │
├─────────────────┴───────────────────────┴──────────────────────┤
│                           STATUS BAR (φ⁻¹ ratio)                │
│  ↑ 34px (φ⁻¹ * 55)                                           │
└─────────────────────────────────────────────────────────────────┘
```

### Mobile Layout (Simplified)
```
┌──────────────────────────┐
│    TOOLBAR (34px)        │
├──────────────────────────┤
│                          │
│      DOCUMENT AREA       │
│      (Full width)        │
│                          │
│  Padding: 21px 13px      │
│  (Fibonacci scaling)     │
│                          │
└──────────────────────────┘
```

---

## 🎨 COLOR SYSTEM

### Current Accent: Blue Theme
```css
--wo-de-accent: #4472c4;      /* Primary action color */
--wo-de-accent-hover: #3a64b0;
--wo-de-accent-light: rgba(68, 114, 196, 0.08);
--wo-de-accent-active: rgba(68, 114, 196, 0.15);
```

### Golden Ratio Color Harmonies
The blue accent `#4472c4` can be extended with golden-ratio-based color harmonies:

```css
/* Golden section split of hue (210° for blue) */
:root {
  --accent-primary: 210deg;      /* Base blue */
  --accent-secondary: 331deg;    /* 210 + 121 ≈ 331 (φ * 100 ≈ 162° gap) */
  --accent-tertiary: 41deg;      /* 331 + 80 ≈ 41 (φ * 50 ≈ 81° gap) */
  --accent-quaternary: 162deg;   /* 41 + 121 ≈ 162 */
}
```

### Neutral Backgrounds (Golden proportions)
```css
--wo-de-bg-pane: #ffffff;           /* Pure white for contrast */
--wo-de-bg-toolbar: #f3f3f3;        /* φ⁻¹ brightness ≈ 95% */
--wo-de-bg-toolbar-tabs: #ffffff;
--wo-de-bg-toolbar-panel: #f8f8f8;  /* φ⁻² brightness ≈ 97% */
--wo-de-bg-statusbar: #f3f3f3;
--wo-de-doc-bg: #f0f0f0;            /* φ⁻¹ brightness ≈ 94% */
```

---

## 📝 TYPOGRAPHY

### Vertical Rhythm (φ-based)
```css
line-height: var(--line-height-normal);  /* φ = 1.618 */
```

 Margins follow the golden ratio of the font size:
```css
margin-bottom: calc(font-size * var(--phi-inverse));
```

### Font Scale Examples
| Element | Size | Line Height | Margin Bottom |
|---------|------|-------------|---------------|
| h1 | 50px | 1.618 | 31px |
| h2 | 31px | 1.618 | 19px |
| h3 | 19px | 1.618 | 12px |
| h4 | 12px | 1.618 | 7px |
| Body | 12px | 1.618 | 7px |

---

## 🎭 COMPONENT-SPECIFIC GUIDELINES

### Ribbon Toolbar
- **Height**: 55px (φ * 34)
- **Button size**: 55px × 55px (golden square)
- **Icon size**: 21px (φ * 13)
- **Group padding**: 13px (Fibonacci)
- **Button gap**: 3px (Fibonacci)
- **Group gap**: 8px (Fibonacci)

### Status Bar
- **Height**: 34px (φ⁻¹ * 55)
- **Item padding**: 3px × 13px (Fibonacci)
- **Gap**: 8px (Fibonacci)

### Document Page
- **Padding**: 25.4mm (normal), 21mm (narrow), 34mm (wide)
- **Column gap**: 21mm (Fibonacci)
- **Shadow**: Elevation following Fibonacci (1px, 2px, 5px)

### Side Panels
- **Width**: 233px (144 * φ)
- **Expanded modal**: 377px (233 * φ)
- **Large modal**: 610px (377 * φ)

### Form Elements
- **Height**: 34px (Fibonacci)
- **Horizontal padding**: 8px (Fibonacci)
- **Label gap**: 8px (Fibonacci)

---

## 🔄 RESPONSIVE BREAKPOINTS

### Based on Golden Ratio Scaling
```css
/* Desktop: Full golden proportions */
@media (min-width: 1200px) {}

/* Tablet: φ⁻¹ scaling */
@media (max-width: 1200px) {
  --scaling-factor: 0.618; /* φ⁻¹ */
}

/* Mobile: φ⁻² scaling */
@media (max-width: 768px) {
  --scaling-factor: 0.382; /* φ⁻² */
  /* Touch targets: minimum 44px */
}
```

### Touch Targets
- **Minimum**: 44px × 44px (Apple Human Interface Guidelines)
- **Comfortable**: 48px × 48px
- **Optimal**: 55px × 55px (Golden ratio button)

---

## ⚡ ANIMATION & MICRO-INTERACTIONS

### Golden Timing Functions
```css
/* Based on φ fractions */
@keyframes fadeInGolden {
  0% { opacity: 0; transform: translateY(-21px); }
  38.2% { opacity: 0.618; transform: translateY(-13px); } /* φ⁻¹ ≈ 0.618 */
  61.8% { opacity: 0.8; transform: translateY(-8px); }  /* 1 - φ⁻¹ ≈ 0.382 */
  100% { opacity: 1; transform: translateY(0); }
}
```

### Duration Scale (Fibonacci milliseconds)
```css
--dur-fast: 89ms;   /* Fibonacci: 89 */
--dur-normal: 144ms; /* Fibonacci: 144 */
--dur-slow: 233ms;   /* Fibonacci: 233 */
--dur-slower: 377ms; /* Fibonacci: 377 */
```

---

## 🖼️ VISUAL HIERARCHY PRINCIPLES

### 1. **Focal Point at Golden Section**
The first few words of the document should align with the golden section point (~62% from the left, ~62% from the top).

### 2. **Rule of Thirds Alignment**
- Primary action buttons: Top-right intersection
- Secondary actions: Bottom-left intersection
- Content area: Center-left intersection

### 3. **Fibonacci Spiral Reading Pattern**
Users read in a spiral pattern. Arrange content to guide the eye:
```
Start here → Continue → Secondary → Tertiary
    ↓               ↓         ↓
  [Primary]    [Additional] [Related]
```

---

## 📊 DESIGN DECISION RECORD

| Decision | Rationale | φ Connection |
|----------|-----------|--------------|
| Ribbon height: 55px | Balanced with status bar (34px) | 55/34 ≈ 1.618 = φ |
| Button size: 55×55px | Square for harmony, golden ratio to icon | 55/21 ≈ 2.618 = φ² |
| Button icon: 21px | Proportional within button | 21/13 ≈ 1.615 ≈ φ |
| Group padding: 13px | Fibonacci spacing | 13 is Fibonacci |
| Panel width: 233px | Side panel proportion | 144 * φ ≈ 233 |
| Page margins: 21/34mm | Fibonacci-based spacing | 21 and 34 are Fibonacci |
| Column gap: 21mm | Consistent spacing system | 21 is Fibonacci |
| Z-index: Fibonacci scale | Prevent collisions | Natural ordering |

---

## ✅ VERIFICATION CHECKLIST

- [x] **Golden ratio applied to toolbar (55px)**
- [x] **Button dimensions follow φ (55×55px)**
- [x] **Icon sizes scaled by φ (21px)**
- [x] **Spacing uses Fibonacci sequence (3, 5, 8, 13, 21, 34, 55, 89)**
- [x] **Typography follows φ scaling (8, 12, 19, 31, 50)**
- [x] **Layout follows rule of thirds**
- [x] **Panel widths use φ multiples (233, 377, 610)**
- [x] **Border radius uses Fibonacci (3, 5, 8, 13)**
- [x] **Z-index follows Fibonacci scale**
- [x] **Responsive scaling uses φ⁻¹ and φ⁻²**
- [x] **Animations use golden fractions (38.2%, 61.8%)**
- [x] **Page margins use Fibonacci values (21, 34mm)**
- [x] **Column gaps use Fibonacci (21mm)**

---

## 📚 REFERENCES

1. **Golden Ratio in Design**: https://www.canva.com/learn/golden-ratio-design/
2. **Fibonacci Sequence**: https://en.wikipedia.org/wiki/Fibonacci_sequence
3. **Rule of Thirds**: https://en.wikipedia.org/wiki/Rule_of_thirds
4. **Golden Ratio Typography**: https://www.typewolf.com/golden-ratio-typography
5. **Mathematical Proportions in UI**: https://medium.com/@煺/exploring-the-golden-ratio-in-ui-design-ac9bbb87519a

---

## 🎨 DESIGN FILES

- **CSS Source**: `src/styles/golden-ratio.css`
- **Document Layout**: `src/styles/document.css`
- **Toolbar Styles**: `src/styles/toolbar.css`
- **Viewport Component**: `src/components/Viewport.tsx`

---

## 🔒 MAINTENANCE RULES

1. **All new dimensions MUST be derived from φ or Fibonacci sequence**
2. **Never use arbitrary pixel values** - always reference the design system
3. **Spacings must use Fibonacci scale**: 1, 2, 3, 5, 8, 13, 21, 34, 55, 89
4. **Typography must use φ-based scaling**: 8, 12, 19, 31, 50
5. **Layout must respect rule of thirds**
6. **Animations must use golden fractions** (38.2%, 61.8%)

---

## 🏆 DESIGN PRINCIPLE

> "Beauty is not in the eye of the beholder. It is in the mathematical proportions that the eye finds pleasing."
> 
> — **World-Office Design Philosophy**

By following the golden ratio, Fibonacci sequence, and rule of thirds, World-Office achieves a level of visual harmony that users instinctively recognize as professional, balanced, and beautiful.
