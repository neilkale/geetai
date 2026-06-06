import Link from 'next/link';
import { geetai } from '@/lib/data';

export default function Home() {
  return (
    <main className="home">
      <header className="home-header">
        <h1 className="home-title">गीताई</h1>
        <p className="home-tagline">विनोबा भाव्यांची मराठी गीता</p>
      </header>
      <ol className="chapter-list">
        {geetai.chapters.map((ch) => (
          <li key={ch.number}>
            <Link href={`/${ch.number}`} className="chapter-card">
              <div className="chapter-card-ord">अध्याय {ch.number}</div>
              <div className="chapter-card-title">{ch.title}</div>
              <div className="chapter-card-count">{ch.verses.length} ओव्या</div>
            </Link>
          </li>
        ))}
      </ol>
      <footer className="home-footer">
        <p>संत विनोबा भावे यांच्या गीताईचा संग्रह</p>
      </footer>
    </main>
  );
}
