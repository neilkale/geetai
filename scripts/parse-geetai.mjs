import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devanagariToRoman } from './transliterate.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'geetai.txt');
const OUT = path.join(ROOT, 'app/data/geetai.json');

const CHAPTER_NAMES = [
  'पहिला', 'दुसरा', 'तिसरा', 'चवथा', 'पाचवा', 'सहावा', 'सातवा', 'आठवा',
  'नववा', 'दहावा', 'अकरावा', 'बारावा', 'तेरावा', 'चौदावा', 'पंधरावा',
  'सोळावा', 'सतरावा', 'अठरावा',
];

function detectChapter(line) {
  for (let i = 0; i < CHAPTER_NAMES.length; i++) {
    if (line.includes(`गीताई अध्याय ${CHAPTER_NAMES[i]}`)) {
      return { number: i + 1, name: CHAPTER_NAMES[i] };
    }
  }
  if (line.includes('गीताई अध्याय चोंदावा')) {
    return { number: 14, name: 'चौदावा' };
  }
  return null;
}

function isChapterEnd(line) {
  return /अध्याय\s+\S+\s+(संपूर्ण|समाप्त)/.test(line);
}

function detectSpeaker(line) {
  const t = line.trim();
  if (/^धृतराष्ट्र\s+म्हणाला/.test(t)) return 'धृतराष्ट्र';
  if (/^संजय\s+म्हणाला/.test(t)) return 'संजय';
  if (/^अर्जुन\s+म्हणाला/.test(t)) return 'अर्जुन';
  if (/^श्री\s+भगवान/.test(t) && /म्हणा/.test(t)) return 'श्री भगवान्';
  return null;
}

const DIGIT_MAP = { '0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९' };
function normalizeVerseNumber(numStr) {
  return numStr.replace(/[0-9]/g, (d) => DIGIT_MAP[d]);
}

const DEV_TO_INT = { '०':0,'१':1,'२':2,'३':3,'४':4,'५':5,'६':6,'७':7,'८':8,'९':9 };
function devanagariToInt(str) {
  let n = 0;
  for (const c of str) {
    if (DEV_TO_INT[c] !== undefined) n = n * 10 + DEV_TO_INT[c];
    else if (c >= '0' && c <= '9') n = n * 10 + Number(c);
  }
  return n;
}

function normalizeShlokaText(text) {
  // Replace stray Latin pipe with Devanagari danda
  return text.replace(/\|/g, '।').replace(/\s+/g, ' ').trim();
}

// Verse-end marker: ॥ <digits> <one or more ॥|>  -- can appear anywhere, not just end of line.
// We use a global regex and find all matches in a buffer.
const VERSE_MARKER_RE = /॥\s*([०-९0-9]+)\s*[॥|]+/g;

function parse() {
  const raw = fs.readFileSync(SRC, 'utf8');
  const lines = raw.split('\n');

  const chapters = [];
  let chapter = null;
  let currentSpeaker = null;
  let buffer = '';

  // Split `buffer` on verse markers, emit verses with currentSpeaker, keep trailing text.
  function flushVerses() {
    if (!chapter) { buffer = ''; return; }
    VERSE_MARKER_RE.lastIndex = 0;
    let lastIdx = 0;
    let m;
    while ((m = VERSE_MARKER_RE.exec(buffer)) !== null) {
      const numStr = normalizeVerseNumber(m[1]);
      const number = devanagariToInt(numStr);
      const text = normalizeShlokaText(buffer.slice(lastIdx, m.index));
      if (text) chapter.verses.push({
        number,
        speaker: currentSpeaker,
        text,
        roman: devanagariToRoman(text),
      });
      lastIdx = m.index + m[0].length;
    }
    buffer = buffer.slice(lastIdx);
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (isChapterEnd(line)) {
      flushVerses();
      continue;
    }

    const ch = detectChapter(line);
    if (ch) {
      flushVerses();
      chapter = { number: ch.number, name: ch.name, verses: [] };
      chapters.push(chapter);
      currentSpeaker = null;
      buffer = '';
      continue;
    }

    const spk = detectSpeaker(line);
    if (spk) {
      flushVerses();
      currentSpeaker = spk;
      continue;
    }

    if (!chapter) continue;
    buffer = buffer ? `${buffer} ${line}` : line;
  }
  flushVerses();

  return { chapters };
}

// Post-pass: detect implausible verse numbers and correct using sequential context.
// Conservative: only fix if delta from expected > 3.
function fixVerseNumbering(chapters) {
  const corrections = [];
  for (const chapter of chapters) {
    for (let i = 0; i < chapter.verses.length; i++) {
      const v = chapter.verses[i];
      const expected = i === 0 ? 1 : chapter.verses[i - 1].number + 1;
      if (Math.abs(v.number - expected) > 3) {
        corrections.push({ chapter: chapter.number, index: i, was: v.number, now: expected });
        v.numberOriginal = v.number;
        v.number = expected;
      }
    }
  }
  return corrections;
}

const data = parse();
const corrections = fixVerseNumbering(data.chapters);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

const expected = [47, 72, 43, 42, 29, 47, 30, 28, 34, 42, 55, 20, 34, 27, 20, 24, 28, 78];
console.log(`Parsed ${data.chapters.length} chapters → ${OUT}`);
let total = 0, totalExpected = 0;
const missing = [];
for (let i = 0; i < data.chapters.length; i++) {
  const c = data.chapters[i];
  const exp = expected[i];
  const ok = c.verses.length === exp ? '✓' : '✗';
  console.log(`  ${ok} Ch ${String(c.number).padStart(2)} (${c.name.padEnd(8)}): ${String(c.verses.length).padStart(3)} verses  (expected ${exp})`);
  total += c.verses.length;
  totalExpected += exp;
  // Find gaps
  const seen = new Set(c.verses.map(v => v.number));
  for (let n = 1; n <= exp; n++) if (!seen.has(n)) missing.push({ ch: c.number, v: n });
}
console.log(`Total: ${total} (expected ${totalExpected})`);
if (corrections.length) {
  console.log(`\nVerse-number corrections (${corrections.length}):`);
  for (const c of corrections) console.log(`  Ch ${c.chapter} idx ${c.index}: ${c.was} → ${c.now}`);
}
if (missing.length) {
  console.log(`\nMissing verses (${missing.length}):`);
  for (const m of missing) console.log(`  Ch ${m.ch} verse ${m.v}`);
}
