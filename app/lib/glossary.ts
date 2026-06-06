import glossaryData from '@/data/glossary.json';

export type GlossaryCategory = 'person' | 'place' | 'concept' | 'object';

export interface GlossaryEntry {
  id: string;
  category: GlossaryCategory;
  primary_marathi: string;
  primary_roman: string;
  marathi_forms: string[];
  roman_forms: string[];
  description: string;
}

export interface GlossaryData {
  entries: GlossaryEntry[];
}

export const glossary = glossaryData as GlossaryData;

// id → entry
export const glossaryById = new Map(glossary.entries.map((e) => [e.id, e]));

// Build form → id lookup maps. A single form can in principle belong to
// multiple entries; first wins (entries are alphabetically sorted, so the
// behavior is stable across builds).
function buildFormMap(field: 'marathi_forms' | 'roman_forms'): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of glossary.entries) {
    for (const form of e[field]) {
      if (!map.has(form)) map.set(form, e.id);
    }
  }
  return map;
}

export const marathiFormMap = buildFormMap('marathi_forms');
export const romanFormMap = buildFormMap('roman_forms');

export type GlossToken =
  | { kind: 'gloss'; text: string; id: string }
  | { kind: 'plain'; text: string };

// Tokenize a verse text, marking tokens that match glossary forms.
// - Splits on whitespace and Devanagari dandas; preserves separators in the
//   output so the rendered text reads correctly.
// - Strips trailing/leading punctuation when looking up a token, but keeps
//   the punctuation attached to the rendered span.
const SEPARATOR_RE = /([\s।॥]+)/;
const STRIP_PUNCT_RE = /^[?.,;:!"'(){}\[\]]+|[?.,;:!"'(){}\[\]]+$/g;

export function tokenize(text: string, formMap: Map<string, string>): GlossToken[] {
  const parts = text.split(SEPARATOR_RE);
  const out: GlossToken[] = [];
  for (const part of parts) {
    if (!part) continue;
    if (SEPARATOR_RE.test(part)) {
      out.push({ kind: 'plain', text: part });
      continue;
    }
    const lookup = part.replace(STRIP_PUNCT_RE, '');
    const id = formMap.get(lookup);
    if (id) out.push({ kind: 'gloss', text: part, id });
    else out.push({ kind: 'plain', text: part });
  }
  return out;
}
