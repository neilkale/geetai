import Link from 'next/link';
import { notFound } from 'next/navigation';
import { geetai, getChapter, speakerLabel, type Verse } from '@/lib/data';
import { tokenize, marathiFormMap, romanFormMap } from '@/lib/glossary';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { VerseSummaryTooltip } from '@/components/VerseSummaryTooltip';

function renderTokens(text: string, formMap: Map<string, string>) {
  const tokens = tokenize(text, formMap);
  return tokens.map((t, i) =>
    t.kind === 'gloss' ? (
      <span key={i} data-gloss={t.id} className="gloss-term">
        {t.text}
      </span>
    ) : (
      <span key={i}>{t.text}</span>
    ),
  );
}

export function generateStaticParams() {
  return geetai.chapters.map((ch) => ({ chapter: String(ch.number) }));
}

export async function generateMetadata({ params }: { params: Promise<{ chapter: string }> }) {
  const { chapter } = await params;
  const ch = getChapter(Number(chapter));
  if (!ch) return {};
  return { title: `अध्याय ${ch.number} — ${ch.title} | गीताई` };
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ chapter: string }>;
}) {
  const { chapter } = await params;
  const n = Number(chapter);
  const ch = getChapter(n);
  if (!ch) notFound();

  type Group = { speaker: Verse['speaker']; verses: Verse[] };
  const groups: Group[] = [];
  for (const v of ch.verses) {
    const last = groups[groups.length - 1];
    if (!last || last.speaker !== v.speaker) {
      groups.push({ speaker: v.speaker, verses: [v] });
    } else {
      last.verses.push(v);
    }
  }

  const prev = n > 1 ? n - 1 : null;
  const next = n < geetai.chapters.length ? n + 1 : null;

  return (
    <main className="chapter">
      <GlossaryTooltip />
      <VerseSummaryTooltip />
      <nav className="chapter-nav">
        <Link href="/" className="chapter-nav-back">← अनुक्रमणिका</Link>
      </nav>
      <header className="chapter-header">
        <div className="chapter-ord">अध्याय {ch.number} · {ch.name}</div>
        <h1 className="chapter-title">{ch.title}</h1>
      </header>
      <div className="verses">
        {groups.map((g, i) => (
          <section key={i} className="speaker-group">
            {g.speaker && <h2 className="speaker">{speakerLabel(g.speaker)}</h2>}
            <ol className="verse-list">
              {g.verses.map((v) => (
                <li key={v.number} className="verse">
                  <span
                    className={v.summary ? 'verse-num has-summary' : 'verse-num'}
                    data-summary={v.summary || undefined}
                    data-verse-ref={
                      v.summary ? `अध्याय ${ch.number} · ओवी ${v.number}` : undefined
                    }
                  >
                    {v.summary ? (
                      <span className="verse-num-mark">{v.number}</span>
                    ) : (
                      v.number
                    )}
                  </span>
                  <div className="verse-body">
                    <p className="verse-marathi">
                      {renderTokens(v.text, marathiFormMap)}
                    </p>
                    <p className="verse-roman">
                      {renderTokens(v.roman, romanFormMap)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <nav className="chapter-footer-nav">
        {prev ? (
          <Link href={`/${prev}`} className="chapter-nav-link">← अध्याय {prev}</Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link href={`/${next}`} className="chapter-nav-link">अध्याय {next} →</Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
