#!/usr/bin/env node
// Generate short per-verse summaries (the "essence") for the Geetai reader.
//
// For each chapter: send verses to Claude, get back { number, summary }, write
// each summary onto its verse in app/data/geetai.json.
//
// Usage:
//   node scripts/build-summaries.mjs --chapter 1
//   node scripts/build-summaries.mjs --chapters 1-18 --concurrency 4

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'app/data/geetai.json');
const KEY_FILE = path.join(ROOT, 'anthropic_key.env');
const MODEL = 'claude-opus-4-8';

function readApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  throw new Error('No API key.');
}

const client = new Anthropic({ apiKey: readApiKey() });

const SYSTEM_PROMPT = `You are writing short verse-by-verse "essence" summaries for readers of गीताई (Geetai), Vinoba Bhave's Marathi rendering of the Bhagavad Gita.

For each verse you receive, write a SHORT (1-2 sentence) summary capturing what is being said or what happens. The reader already has the verse text in Marathi and ISO 15919 transliteration; the summary helps them get the gist without a word-by-word translation.

Rules:
- Plain modern English. Concrete, ~15-30 words. Hard cap: 40 words.
- For narrative verses: describe what's happening — who acts, who speaks to whom.
- For dialogue verses: paraphrase the speaker's point in one sentence.
- For descriptive/teaching verses: capture the key claim or instruction directly.
- DO NOT translate sentence-by-sentence.
- DO NOT add interpretation, commentary, or theology.
- Be direct: "Krishna says X" / "Arjuna asks Y" — not "Krishna teaches us that...".
- Avoid editorial words ("sacred", "divine", "holy") unless they're literal.
- If a verse repeats or continues the previous, say so briefly rather than restating.
- Use the names readers see (Krishna, Arjuna, Sanjaya, Duryodhana, etc.), not epithets the verse uses (Madhava, Partha, Hrishikesha) — resolve the epithet in your summary.

Output JSON with one entry per verse (in order).`;

const SCHEMA = {
  type: 'object',
  properties: {
    summaries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          summary: { type: 'string' },
        },
        required: ['number', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['summaries'],
  additionalProperties: false,
};

async function summarizeChapter(chapterNum) {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const chapter = data.chapters[chapterNum - 1];
  const versesText = chapter.verses
    .map((v) => `${v.number}. ${v.speaker || '—'}: ${v.text}\n   ${v.roman}`)
    .join('\n');

  const userMessage = `Chapter ${chapterNum} — ${chapter.title} (${chapter.name})\n\nVerses (Marathi + ISO 15919):\n\n${versesText}\n\nWrite an essence summary for every verse. Output ${chapter.verses.length} entries.`;

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`Ch ${chapterNum}: no text block in response`);
  const parsed = JSON.parse(textBlock.text);
  return { summaries: parsed.summaries, usage: response.usage };
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

async function pool(items, n, worker) {
  let cursor = 0;
  const errors = [];
  const runners = Array.from({ length: Math.min(n, items.length) }, () => (async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try { await worker(items[idx]); }
      catch (err) { errors.push({ item: items[idx], error: err }); }
    }
  })());
  await Promise.all(runners);
  return errors;
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
  if (!opts.chapters) throw new Error('Specify --chapter N or --chapters 1-18 or --all');
  return opts;
}

async function main() {
  const { chapters, concurrency } = parseArgs();
  const totals = { input: 0, output: 0 };
  let done = 0;

  console.error(`Summarizing ${chapters.length} chapter(s) at concurrency ${concurrency}...`);

  // We mutate one shared JSON; serialize the write step inside the worker.
  let dataLock = Promise.resolve();

  const errors = await pool(chapters, concurrency, async (ch) => {
    const { summaries, usage } = await summarizeChapter(ch);
    totals.input += usage.input_tokens || 0;
    totals.output += usage.output_tokens || 0;

    dataLock = dataLock.then(() => {
      const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
      const chapter = data.chapters[ch - 1];
      const byNumber = new Map(summaries.map((s) => [s.number, s.summary]));
      let matched = 0;
      for (const verse of chapter.verses) {
        const s = byNumber.get(verse.number);
        if (s) {
          verse.summary = s;
          matched++;
        }
      }
      fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
      done++;
      console.error(`[${done}/${chapters.length}] Ch ${ch}: ${matched}/${chapter.verses.length} summaries written (${usage.input_tokens} in / ${usage.output_tokens} out)`);
    });
    await dataLock;
  });

  console.error(`\nTokens — in: ${totals.input}, out: ${totals.output}`);
  if (errors.length) {
    console.error(`\n${errors.length} chapter(s) failed:`);
    for (const e of errors) console.error(`  Ch ${e.item}: ${e.error.message}`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
