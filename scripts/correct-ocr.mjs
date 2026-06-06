#!/usr/bin/env node
// Re-transcribe geetai.pdf via Claude vision and merge corrections into geetai.json.
//
// Usage:
//   node scripts/correct-ocr.mjs --pages 3              # one page
//   node scripts/correct-ocr.mjs --pages 3-10           # a range
//   node scripts/correct-ocr.mjs --pages 3,5,8          # specific pages
//   node scripts/correct-ocr.mjs --all                  # every verse page
//   node scripts/correct-ocr.mjs --merge                # merge accumulated progress into geetai.json
//
// Reads API key from anthropic_key.env at repo root (raw key on one line), or ANTHROPIC_API_KEY.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { devanagariToRoman } from './transliterate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PDF = path.join(ROOT, 'geetai.pdf');
const DATA = path.join(ROOT, 'app/data/geetai.json');
const KEY_FILE = path.join(ROOT, 'anthropic_key.env');
const TMP = '/tmp/geetai-pages';
const PROGRESS = path.join(__dirname, '.ocr-corrections.json');

const MODEL = 'claude-opus-4-8';
const DPI = 200;
const DEFAULT_CONCURRENCY = 3;

// PDF page ranges per chapter. PDF page = book page + 2 (PDF pages 1-2 are cover/TOC).
// Computed from the TOC in PDF page 2.
const CHAPTER_PAGE_RANGES = [
  { ch: 1, start: 3, end: 10 },
  { ch: 2, start: 11, end: 21 },
  { ch: 3, start: 22, end: 27 },
  { ch: 4, start: 28, end: 33 },
  { ch: 5, start: 34, end: 37 },
  { ch: 6, start: 38, end: 44 },
  { ch: 7, start: 45, end: 49 },
  { ch: 8, start: 50, end: 54 },
  { ch: 9, start: 55, end: 59 },
  { ch: 10, start: 60, end: 65 },
  { ch: 11, start: 66, end: 76 },
  { ch: 12, start: 77, end: 79 },
  { ch: 13, start: 80, end: 84 },
  { ch: 14, start: 85, end: 88 },
  { ch: 15, start: 89, end: 92 },
  { ch: 16, start: 93, end: 96 },
  { ch: 17, start: 97, end: 100 },
  { ch: 18, start: 101, end: 111 },
];
const FIRST_PAGE = CHAPTER_PAGE_RANGES[0].start;
const LAST_PAGE = CHAPTER_PAGE_RANGES.at(-1).end;

function chapterForPage(pageNum) {
  for (const r of CHAPTER_PAGE_RANGES) {
    if (pageNum >= r.start && pageNum <= r.end) return r.ch;
  }
  return null;
}

const SYSTEM_PROMPT = `You are a careful transcriber of गीताई (Geetai), Vinoba Bhave's Marathi rendering of the Bhagavad Gita.

You will be shown one page from the authoritative PDF as a high-resolution image. Transcribe every shloka (ovi) visible on the page into structured JSON.

Page layout:
- Each shloka has its number printed in the left margin in Devanagari digits (e.g., १, २, ३). Use that number in the "number" field.
- The chapter title appears at the top of the first page of each chapter as "अध्याय <name>" (e.g., "अध्याय पहिला", "अध्याय दुसरा"). Otherwise the page is a continuation of the previous chapter.
- Speaker labels appear between shlokas as bold centered headings: "धृतराष्ट्र म्हणाला", "संजय म्हणाला", "अर्जुन म्हणाला", "श्री भगवान् म्हणाले". A speaker stays in effect for subsequent shlokas until another label appears.
- If a shloka on this page has NO speaker label immediately preceding it on this page, set speaker to "" (empty string). The merge step will infer the speaker from prior verses.

Transcription rules:
- Each shloka is typically two printed lines. Join them in the "text" field with " । " (single Devanagari danda U+0964) where the printed text uses one. Longer ovis may contain an internal " ॥ " (double danda U+0965) — preserve it as printed.
- DO NOT include the trailing verse-end marker (॥ N ॥) in the "text" field — the number lives in the "number" field.
- Preserve every Marathi diacritic exactly: anusvara (ं), visarga (ः), halant (्), nukta (़), all matras, candrabindu (ँ). These ARE the text — never normalize, drop, or substitute them.
- Preserve hyphens in compound words exactly as printed (e.g., कुरु-क्षेत्रीं, महा-रथी, स्व-जन).
- Preserve question marks if printed (Vinoba uses Latin "?" at the end of some verses).
- If a shloka appears partially cut off at the top or bottom of the page (continuation from another page), still include what's visible and set "partial" to true.
- Output verses in reading order (top to bottom).

Output as JSON matching the provided schema. Set "chapter_header_visible" to true only if "अध्याय <name>" is printed at the top of THIS page.`;

const SCHEMA = {
  type: 'object',
  properties: {
    chapter_header_visible: {
      type: 'boolean',
      description: 'True if "अध्याय <name>" header is printed at the top of this page.',
    },
    chapter_name: {
      type: 'string',
      description: 'The chapter name (e.g. "पहिला") if chapter_header_visible; otherwise empty string.',
    },
    verses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          chapter: { type: 'integer' },
          number: { type: 'integer' },
          speaker: {
            type: 'string',
            enum: ['धृतराष्ट्र', 'संजय', 'अर्जुन', 'श्री भगवान्', ''],
          },
          text: { type: 'string' },
          partial: { type: 'boolean' },
        },
        required: ['chapter', 'number', 'speaker', 'text', 'partial'],
        additionalProperties: false,
      },
    },
  },
  required: ['chapter_header_visible', 'chapter_name', 'verses'],
  additionalProperties: false,
};

function readApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  throw new Error('No API key. Set ANTHROPIC_API_KEY or put one in anthropic_key.env at repo root.');
}

const client = new Anthropic({ apiKey: readApiKey() });

async function renderPage(pageNum) {
  const outPath = path.join(TMP, `page-${String(pageNum).padStart(3, '0')}.png`);
  if (!fs.existsSync(outPath)) {
    fs.mkdirSync(TMP, { recursive: true });
    await new Promise((resolve, reject) => {
      const proc = spawn('pdftoppm', [
        '-r', String(DPI),
        '-f', String(pageNum), '-l', String(pageNum),
        '-png', PDF, path.join(TMP, 'page'),
      ]);
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`pdftoppm exit ${code}`))));
      proc.on('error', reject);
    });
  }
  return fs.readFileSync(outPath).toString('base64');
}

async function transcribePage(pageNum) {
  const imageB64 = await renderPage(pageNum);
  const expectedChapter = chapterForPage(pageNum);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageB64 },
          },
          {
            type: 'text',
            text: `PDF page ${pageNum}. Per the table of contents this page should be in chapter ${expectedChapter}. Verify against the visible content and transcribe every shloka on this page.`,
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`page ${pageNum}: response has no text block`);
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (err) {
    throw new Error(`page ${pageNum}: response is not valid JSON: ${textBlock.text.slice(0, 200)}`);
  }
  return { pageNum, expectedChapter, parsed, usage: response.usage };
}

async function pool(items, concurrency, worker) {
  let cursor = 0;
  const errors = [];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => (async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        await worker(items[idx], idx);
      } catch (err) {
        errors.push({ item: items[idx], error: err });
      }
    }
  })());
  await Promise.all(runners);
  return errors;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { pages: null, concurrency: DEFAULT_CONCURRENCY, merge: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pages') opts.pages = args[++i];
    else if (a === '--concurrency') opts.concurrency = Number(args[++i]);
    else if (a === '--merge') opts.merge = true;
    else if (a === '--all') opts.pages = `${FIRST_PAGE}-${LAST_PAGE}`;
    else if (a === '--help') {
      console.log('Usage: correct-ocr.mjs [--pages SPEC] [--concurrency N] [--merge] [--all]');
      process.exit(0);
    }
  }
  return opts;
}

function expandPages(spec) {
  const out = new Set();
  for (const chunk of spec.split(',')) {
    const m = chunk.trim().match(/^(\d+)(?:-(\d+))?$/);
    if (!m) throw new Error(`bad page spec: ${chunk}`);
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = a; i <= b; i++) out.add(i);
  }
  return [...out].sort((x, y) => x - y);
}

function loadProgress() {
  if (fs.existsSync(PROGRESS)) return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  return {};
}

function saveProgress(progress) {
  fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
}

// Reconstruct verses for one chapter from progress:
// 1. Collect all entries with verse.chapter === ch, in (pageNum, position) order.
// 2. Walk; if current.partial and previous.partial (same chapter, adjacent),
//    join their text. The numbering in the PDF margin may be wrong (e.g. ch 6
//    page 41) but adjacency + partial flags are reliable.
// 3. Renumber sequentially 1..N.
function reconstructChapter(progress, ch) {
  const entries = [];
  const pageNums = Object.keys(progress).map(Number).sort((a, b) => a - b);
  for (const pageNum of pageNums) {
    const p = progress[pageNum];
    if (!p.verses) continue;
    p.verses.forEach((v, idx) => {
      if (v.chapter === ch) entries.push({ pageNum, idx, ...v });
    });
  }

  const merged = [];
  for (const e of entries) {
    const prev = merged[merged.length - 1];
    // Join when current is first on a page adjacent to prev's page AND either:
    //   (a) both flagged partial (the usual case — verse split across pages), or
    //   (b) same verse number (Claude sometimes forgets the partial flag on one side).
    const adjacentAndAtTop =
      prev && e.pageNum === prev._pageNum + 1 && e.idx === 0;
    const bothPartial = e.partial && prev?._partialTail;
    const sameNumber = prev && prev._number === e.number;
    const isJoinable = adjacentAndAtTop && (bothPartial || sameNumber);
    if (isJoinable) {
      prev.text = `${prev.text} ${e.text}`.trim();
      if (!prev.speaker && e.speaker) prev.speaker = e.speaker;
      prev._partialTail = false;
      prev._pageNum = e.pageNum;
    } else {
      merged.push({
        text: e.text,
        speaker: e.speaker,
        _number: e.number,
        _partialTail: e.partial,
        _pageNum: e.pageNum,
      });
    }
  }

  return merged.map((v, i) => ({
    number: i + 1,
    speaker: v.speaker,
    text: v.text,
  }));
}

function mergeIntoData(progress) {
  const data = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  let updated = 0;
  const mismatches = [];

  for (const chapter of data.chapters) {
    const reconstructed = reconstructChapter(progress, chapter.number);
    if (reconstructed.length !== chapter.verses.length) {
      mismatches.push(
        `Ch ${chapter.number}: PDF has ${reconstructed.length} verses, parser had ${chapter.verses.length}. Trimming to match PDF.`
      );
    }

    // Replace the chapter's verses entirely with the reconstruction. This
    // trims extra slots (so a 47→46 PDF mismatch doesn't leave a stale duplicate).
    let speakerCarry = null;
    const newVerses = reconstructed.map((corr, i) => {
      if (corr.speaker) speakerCarry = corr.speaker;
      return {
        number: i + 1,
        speaker: corr.speaker || speakerCarry || null,
        text: corr.text,
        roman: devanagariToRoman(corr.text),
        corrected: true,
      };
    });
    chapter.verses = newVerses;
    updated += newVerses.length;
  }

  fs.writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n', 'utf8');
  if (mismatches.length) {
    console.error('Chapter count mismatches (manual review needed):');
    for (const m of mismatches) console.error(`  ${m}`);
  }
  return updated;
}

async function main() {
  const opts = parseArgs();
  const progress = loadProgress();

  if (opts.pages) {
    const pages = expandPages(opts.pages);
    const todo = pages.filter((p) => !progress[String(p)]);
    const skipped = pages.length - todo.length;
    console.error(`Pages: ${pages.length} requested, ${skipped} already done, ${todo.length} to transcribe.`);
    if (todo.length === 0) {
      console.error('Nothing to do.');
    } else {
      const totals = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
      let done = 0;
      const errors = await pool(todo, opts.concurrency, async (pageNum) => {
        const result = await transcribePage(pageNum);
        progress[String(pageNum)] = {
          pageNum,
          expectedChapter: result.expectedChapter,
          ...result.parsed,
        };
        totals.input += result.usage.input_tokens || 0;
        totals.output += result.usage.output_tokens || 0;
        totals.cacheWrite += result.usage.cache_creation_input_tokens || 0;
        totals.cacheRead += result.usage.cache_read_input_tokens || 0;
        done++;
        const firstVerse = result.parsed.verses[0];
        const lastVerse = result.parsed.verses.at(-1);
        const verseRange = firstVerse && lastVerse
          ? `ch ${firstVerse.chapter} v${firstVerse.number}–v${lastVerse.number}`
          : 'no verses';
        console.error(`[${done}/${todo.length}] page ${pageNum}: ${verseRange} (${result.parsed.verses.length} verses)`);
        saveProgress(progress);
      });
      console.error(`Tokens — input: ${totals.input} (cache read: ${totals.cacheRead}, write: ${totals.cacheWrite}), output: ${totals.output}`);
      if (errors.length) {
        console.error(`${errors.length} pages failed:`);
        for (const e of errors) console.error(`  page ${e.item}: ${e.error.message}`);
      }
    }
  }

  if (opts.merge) {
    const updated = mergeIntoData(progress);
    console.error(`Merged ${updated} corrected verses into ${path.relative(ROOT, DATA)}.`);
  }
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
