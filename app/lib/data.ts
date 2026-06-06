import data from '@/data/geetai.json';

export type Speaker = 'धृतराष्ट्र' | 'संजय' | 'अर्जुन' | 'श्री भगवान्' | null;

export interface Verse {
  number: number;
  speaker: Speaker;
  text: string;
  roman: string;
  numberOriginal?: number;
  corrected?: boolean;
  summary?: string;
}

export interface Chapter {
  number: number;
  name: string;
  title: string;
  verses: Verse[];
}

export interface GeetaiData {
  chapters: Chapter[];
}

export const geetai = data as GeetaiData;

export function getChapter(n: number): Chapter | undefined {
  return geetai.chapters.find((c) => c.number === n);
}

export function speakerLabel(s: Speaker): string | null {
  if (!s) return null;
  if (s === 'श्री भगवान्') return 'श्री भगवान् म्हणाले';
  return `${s} म्हणाला`;
}
