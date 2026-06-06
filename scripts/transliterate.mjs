// Devanagari → ISO 15919 transliteration with Marathi final-schwa deletion.
//
// Conventions:
// - Independent vowels and matras follow ISO 15919: ā ī ū ē ō ai au r̥ l̥.
// - Anusvara ं is transliterated context-sensitively to ṅ/ñ/ṇ/n/m before
//   the matching place-of-articulation; otherwise ṁ. This matches reader
//   expectations even though strict ISO 15919 always uses ṁ.
// - Visarga ः → ḥ, candrabindu ँ → m̐.
// - Word-final 'a' (the inherent schwa) is deleted — Marathi pronunciation.
// - Medial schwas are kept (Marathi retains them more than Hindi).

const VOWELS_INDEPENDENT = {
  'अ': 'a', 'आ': 'ā', 'इ': 'i', 'ई': 'ī', 'उ': 'u', 'ऊ': 'ū',
  'ऋ': 'r̥', 'ॠ': 'r̥̄', 'ऌ': 'l̥', 'ॡ': 'l̥̄',
  'ऍ': 'ê', 'ऎ': 'e', 'ए': 'ē', 'ऐ': 'ai',
  'ऑ': 'ô', 'ऒ': 'o', 'ओ': 'ō', 'औ': 'au',
};

const VOWEL_SIGNS = {
  'ा': 'ā', 'ि': 'i', 'ी': 'ī', 'ु': 'u', 'ू': 'ū',
  'ृ': 'r̥', 'ॄ': 'r̥̄', 'ॢ': 'l̥', 'ॣ': 'l̥̄',
  'ॅ': 'ê', 'ॆ': 'e', 'े': 'ē', 'ै': 'ai',
  'ॉ': 'ô', 'ॊ': 'o', 'ो': 'ō', 'ौ': 'au',
};

const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ṅ',
  'च': 'c', 'छ': 'ch', 'ज': 'j', 'झ': 'jh', 'ञ': 'ñ',
  'ट': 'ṭ', 'ठ': 'ṭh', 'ड': 'ḍ', 'ढ': 'ḍh', 'ण': 'ṇ',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'ś', 'ष': 'ṣ', 'स': 's', 'ह': 'h',
  'ळ': 'ḷ',
};

const VIRAMA = '्';
const ANUSVARA = 'ं';
const VISARGA = 'ः';
const CHANDRABINDU = 'ँ';
const NUKTA = '़';
const ZWJ = '‍';
const ZWNJ = '‌';

function literalTransliterate(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (CONSONANTS[c] !== undefined) {
      out += CONSONANTS[c];
      const next = text[i + 1];
      if (next === VIRAMA) {
        // Conjunct — suppress inherent vowel and continue.
        i += 2;
      } else if (VOWEL_SIGNS[next] !== undefined) {
        out += VOWEL_SIGNS[next];
        i += 2;
      } else {
        // Inherent schwa.
        out += 'a';
        i += 1;
      }
    } else if (VOWELS_INDEPENDENT[c] !== undefined) {
      out += VOWELS_INDEPENDENT[c];
      i += 1;
    } else if (c === ANUSVARA) {
      out += 'ṁ';
      i += 1;
    } else if (c === VISARGA) {
      out += 'ḥ';
      i += 1;
    } else if (c === CHANDRABINDU) {
      out += 'm̐';
      i += 1;
    } else if (c === NUKTA || c === ZWJ || c === ZWNJ) {
      // Skip — these modify the previous char in ways we don't model here.
      i += 1;
    } else if (VOWEL_SIGNS[c] !== undefined) {
      // Standalone matra (OCR artifact — matras only make sense after a consonant).
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

// Context-sensitive nasal: ṁ → ṅ/ñ/ṇ/n/m before homorganic consonants.
function contextSensitiveNasal(text) {
  return text
    .replace(/ṁ(?=\s*(?:kh?|gh?|ṅ))/g, 'ṅ')
    .replace(/ṁ(?=\s*(?:ch?|jh?|ñ))/g, 'ñ')
    .replace(/ṁ(?=\s*(?:ṭh?|ḍh?|ṇ))/g, 'ṇ')
    .replace(/ṁ(?=\s*(?:th?|dh?|n))/g, 'n')
    .replace(/ṁ(?=\s*(?:ph?|bh?|m))/g, 'm');
}

// Drop word-final inherent schwa (Marathi pronunciation).
// Match 'a' (the bare schwa, not ā/ai/au) that follows a non-vowel character
// and is followed by whitespace, danda, hyphen, punctuation, or end-of-string.
function deleteFinalSchwa(text) {
  // Drop bare-schwa 'a' that follows a consonant and ends a word.
  // Hyphen is NOT a word boundary here — compound-internal schwas stay
  // (e.g. स्व-जन → "sva-jan", not "sv-jan").
  return text.replace(/([^aāiīuūeēoôê̥̄])a(?=[\s।॥.,;:!?]|$)/g, '$1');
}

export function devanagariToRoman(text) {
  if (!text) return text;
  let s = literalTransliterate(text);
  s = contextSensitiveNasal(s);
  s = deleteFinalSchwa(s);
  return s;
}
