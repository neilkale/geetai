#!/usr/bin/env node
// Build the names/concepts glossary for the Geetai reader.
//
// For each chapter, send Marathi + roman verses to Claude and get back structured
// entries (id, category, marathi/roman forms, description) we can render as
// hover tooltips. Merges into app/data/glossary.json keyed by id.
//
// Usage:
//   node scripts/build-glossary.mjs --chapter 1
//   node scripts/build-glossary.mjs --chapters 1,2,3
//   node scripts/build-glossary.mjs --all

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'app/data/geetai.json');
const KEY_FILE = path.join(ROOT, 'anthropic_key.env');
const GLOSSARY = path.join(ROOT, 'app/data/glossary.json');

const MODEL = 'claude-opus-4-8';

function readApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  throw new Error('No API key. Put one in anthropic_key.env or set ANTHROPIC_API_KEY.');
}

const client = new Anthropic({ apiKey: readApiKey() });

const SYSTEM_PROMPT = `You are building a glossary for readers of गीताई (Geetai), Vinoba Bhave's Marathi rendering of the Bhagavad Gita.

Given verses from one chapter (Marathi + ISO 15919 transliteration), extract every term worth annotating with a tooltip:
- Proper nouns: people, dynasties, families, places
- Conches, weapons, named objects (e.g., गांडीव, पांचजन्य)
- Key Sanskrit/Marathi concepts a casual reader might not know (dharma, varna-saṅkara, yajña, kula, brahman, ātman, mokṣa, sāṅkhya, yoga, prakṛti, etc.)

For each entry produce:
- id: stable lowercase kebab-case identifier (e.g. "sanjaya", "kurukshetra", "varna-sankara", "gandiva"). Use simple Hunterian-style romanization for the id (no diacritics).
- category: "person" | "place" | "concept" | "object"
- primary_marathi: the base/canonical Marathi form (nominative)
- primary_roman: the canonical ISO 15919 form
- marathi_forms: every inflected form that ACTUALLY APPEARS in the verses (nominative, vocative, genitive, instrumental, etc.). Use exact strings as they appear, with the same anusvaras/halants.
- roman_forms: every inflected ISO 15919 form that ACTUALLY APPEARS in the verses, corresponding to marathi_forms (same order is helpful but not required).
- description: 1-2 sentence neutral description. For people: who they are + role in the story. For places: location + significance. For concepts: plain meaning. For objects: what it is + owner if relevant.

CRITICAL:
- Be exhaustive on inflected forms. If "संजय" appears as "संजये" or "संजया" anywhere, include all three.
- Roman forms must match exactly what's in the verses (the user has precise ISO 15919 transliterations).
- Avoid editorial language: no "sacred", "holy", "divine", "great" unless that's literally the meaning.
- Don't include common words (the, and, was, etc.) or generic Marathi vocabulary (देश "country", पुत्र "son", सेना "army"). Only annotation-worthy items.
- Do include patronymics and epithets — "द्रुपदात्मज" (Drupada's son = Dhrishtadyumna), "सौभद्र" (Subhadra's son = Abhimanyu), "पार्थ" (Pritha's son = Arjuna), "हृषीकेश" / "माधव" / "केशव" / "जनार्दन" / "वासुदेव" (all Krishna), "गुडाकेश" / "धनंजय" / "किरीटी" (all Arjuna). Each gets its own entry pointing to the underlying person, mentioned in the description.`;

const SCHEMA = {
  type: 'object',
  properties: {
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: ['person', 'place', 'concept', 'object'] },
          primary_marathi: { type: 'string' },
          primary_roman: { type: 'string' },
          marathi_forms: { type: 'array', items: { type: 'string' } },
          roman_forms: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
        },
        required: ['id', 'category', 'primary_marathi', 'primary_roman', 'marathi_forms', 'roman_forms', 'description'],
        additionalProperties: false,
      },
    },
  },
  required: ['entries'],
  additionalProperties: false,
};

async function extractChapter(chapterNum) {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const chapter = data.chapters[chapterNum - 1];
  const versesText = chapter.verses
    .map((v) => `${v.number}. ${v.speaker || '—'}: ${v.text}\n   ${v.roman}`)
    .join('\n');

  const userMessage = `Chapter ${chapterNum} — ${chapter.title} (${chapter.name})\n\nVerses (Marathi + ISO 15919):\n\n${versesText}\n\nExtract every glossary-worthy entry from these verses.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`Ch ${chapterNum}: no text block in response`);
  const parsed = JSON.parse(textBlock.text);
  return { entries: parsed.entries, usage: response.usage };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { chapters: null, concurrency: 1 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--chapter') opts.chapters = [Number(args[++i])];
    else if (a === '--chapters') opts.chapters = expandSpec(args[++i]);
    else if (a === '--all') opts.chapters = Array.from({ length: 18 }, (_, i) => i + 1);
    else if (a === '--concurrency') opts.concurrency = Number(args[++i]);
  }
  if (!opts.chapters) throw new Error('Specify --chapter N or --chapters 1-18 / 1,2,3 or --all');
  return opts;
}

function expandSpec(spec) {
  const out = new Set();
  for (const chunk of spec.split(',')) {
    const m = chunk.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad chapter spec: ${chunk}`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

async function pool(items, concurrency, worker) {
  let cursor = 0;
  const errors = [];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => (async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        await worker(items[idx]);
      } catch (err) {
        errors.push({ item: items[idx], error: err });
      }
    }
  })());
  await Promise.all(runners);
  return errors;
}

async function main() {
  const { chapters, concurrency } = parseArgs();

  let existing = { entries: [] };
  if (fs.existsSync(GLOSSARY)) {
    existing = JSON.parse(fs.readFileSync(GLOSSARY, 'utf8'));
  }
  const byId = new Map(existing.entries.map((e) => [e.id, e]));
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let done = 0;

  console.error(`Extracting glossary for ${chapters.length} chapter(s) at concurrency ${concurrency}...`);

  const errors = await pool(chapters, concurrency, async (ch) => {
    const { entries, usage } = await extractChapter(ch);
    totals.input += usage.input_tokens || 0;
    totals.output += usage.output_tokens || 0;
    totals.cacheRead += usage.cache_read_input_tokens || 0;
    totals.cacheWrite += usage.cache_creation_input_tokens || 0;
    let added = 0;
    for (const e of entries) {
      if (!byId.has(e.id)) added++;
      byId.set(e.id, e);
    }
    done++;
    console.error(`[${done}/${chapters.length}] Ch ${ch}: ${entries.length} entries (${added} new), ${usage.input_tokens} in / ${usage.output_tokens} out`);
    // Save incrementally so we can resume
    const merged = { entries: [...byId.values()].sort((a, b) => a.id.localeCompare(b.id)) };
    fs.writeFileSync(GLOSSARY, JSON.stringify(merged, null, 2) + '\n');
  });

  console.error(`\nTotal: ${byId.size} entries in ${path.relative(ROOT, GLOSSARY)}`);
  console.error(`Tokens — in: ${totals.input} (cached: ${totals.cacheRead}, written: ${totals.cacheWrite}), out: ${totals.output}`);
  if (errors.length) {
    console.error(`\n${errors.length} chapter(s) failed:`);
    for (const e of errors) console.error(`  Ch ${e.item}: ${e.error.message}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
