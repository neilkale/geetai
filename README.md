# गीताई · Geetai

A web reader for **Geetai (गीताई)** — Vinoba Bhave's Marathi rendering of the Bhagavad Gita, written so the verses can be sung in folk meter.

The site reads chapter-by-chapter, with romanization beneath every verse, a names-and-concepts glossary that highlights cross-script, and a one-line essence summary on every verse.

## Features

- **All 18 chapters, 699 verses**, rendered as a clean reading site.
- **ISO 15919 romanization** under every Marathi line, computed with Marathi-aware schwa deletion (so `धर्म` reads `dharma`, not `dharmaa`).
- **Names & concepts glossary** — 373 annotated entries (people, places, concepts, objects). Hover any annotated word and a tooltip surfaces a short description; both the Marathi form and its romanization light up together.
- **Per-verse summaries** — one or two sentences capturing the gist of each verse without translating it word-for-word.
- **Touch-friendly**: on mobile, tooltips become a tap-to-open bottom sheet.

## How it works

### PDF as the source of truth

The starting OCR was noisy — conjuncts dropped, anusvaras lost, verse numbers garbled. Rather than trust the OCR, every page of the source PDF is re-transcribed by **Claude (vision) with a JSON schema**, page by page, and merged back into the dataset. Verses that span pages are flagged partial and stitched by adjacency; verse numbers are renumbered 1..N per chapter because the printed margin labels themselves were unreliable.

### Romanization

A small script walks the Devanagari with **ISO 15919** mappings and context-sensitive rules:

- Anusvara `ं` resolves to `ṅ/ñ/ṇ/n/m` depending on the following consonant's place of articulation.
- Final and pre-pause schwas are dropped (Marathi convention), but compound-internal schwas are preserved.

### Glossary

Claude is given each chapter's verses and asked to extract every term a casual reader would want a footnote for — names, places, weapons, philosophical concepts — along with *every inflected form that actually appears in the verse text*. That last part matters: tokenization at render time only matches what's in the lookup table, so epithets like हृषीकेश (Krishna) and गुडाकेश (Arjuna) all need to be enumerated.

### Verse summaries

The same pattern: per chapter, Claude returns short neutral summaries — "Krishna says X" / "Arjuna asks Y" — no commentary, no theology, no translation, just the essence. Stored on each verse and surfaced on hover/tap over the verse number.

## Tech

- **Next.js 15** (App Router, RSC, static prerendering of every chapter)
- **Tailwind v4** for styling, with semantic class names in `globals.css`
- **TypeScript**
- **Claude API** for the data pipeline (vision OCR, glossary extraction, summary generation), driven by small Node scripts under `scripts/`
- Noto Serif / Noto Sans Devanagari for body type; Tillana for display titles

## Source

Vinoba Bhave's *Geetai* (गीताई), the Marathi metric rendering of the Bhagavad Gita.
