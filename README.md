# गीताई · Geetai

A web reader for **Geetai (गीताई)**, Vinoba Bhave's Marathi version of the Bhagavad Gita. He wrote it so the verses could be sung in folk meter.

The site reads chapter by chapter. Every verse has romanization underneath, key names and concepts get a quick description on hover, and you can hover the verse number to see a one-line essence summary.

## Features

- All 18 chapters and 699 verses, in a clean reading layout.
- ISO 15919 romanization beneath every Marathi line, with Marathi-aware schwa deletion (so `धर्म` reads `dharma`, not `dharmaa`).
- Names and concepts glossary: 373 entries covering people, places, ideas, and objects. Hover any annotated word and a short description pops up. Both the Marathi form and its romanization light up together.
- Per-verse summaries: one or two sentences telling you what the verse is about without translating it word for word.
- Touch-friendly. On mobile the tooltips become a tap-to-open bottom sheet.

## How it works

### Using the PDF as the source of truth

The starting OCR was rough. Conjuncts got dropped, anusvaras lost, verse numbers garbled. Instead of cleaning that up by hand, the source PDF gets re-transcribed by Claude (vision) page by page with a JSON schema, and the results get merged back in. Verses that span page breaks are flagged and stitched together by adjacency. Verse numbers are renumbered 1..N per chapter because even the printed margin numbers weren't always right.

### Romanization

A small script walks the Devanagari with ISO 15919 mappings, plus a couple of context-sensitive rules:

- The anusvara `ं` becomes `ṅ`, `ñ`, `ṇ`, `n`, or `m` depending on what consonant follows.
- Final and pre-pause schwas get dropped (that's the Marathi convention), but schwas inside compounds stay.

### Glossary

Claude reads each chapter and pulls out everything a casual reader might want a footnote for. Names, places, weapons, philosophical concepts. For each one it lists *every inflected form that actually appears in the text*. That part matters. Tokenization at render time only matches forms that are in the lookup table, so epithets like हृषीकेश (Krishna) or गुडाकेश (Arjuna) need to be enumerated explicitly.

### Verse summaries

Same idea. Per chapter, Claude returns short neutral summaries. "Krishna says X." "Arjuna asks Y." No commentary, no theology, no translation. Just the gist. They get attached to each verse and show up when you hover the verse number.

## Tech

- Next.js 15 (App Router, RSC, every chapter prerendered statically)
- Tailwind v4 with semantic class names in `globals.css`
- TypeScript
- Claude API for the data pipeline (vision OCR, glossary extraction, summaries), driven by small Node scripts in `scripts/`
- Noto Serif and Noto Sans Devanagari for body type. Tillana for display titles.

## Source

Vinoba Bhave's *Geetai* (गीताई), the Marathi metric rendering of the Bhagavad Gita.
