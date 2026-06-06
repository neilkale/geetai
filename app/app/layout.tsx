import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Tillana } from 'next/font/google';
import './globals.css';

const notoSerif = localFont({
  src: '../fonts/NotoSerifDevanagari-Variable.ttf',
  variable: '--font-serif-dev',
  display: 'swap',
  weight: '100 900',
});

const notoSans = localFont({
  src: '../fonts/NotoSansDevanagari-Variable.ttf',
  variable: '--font-sans-dev',
  display: 'swap',
  weight: '100 900',
});

const tillana = Tillana({
  subsets: ['devanagari', 'latin'],
  variable: '--font-display-dev',
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'गीताई',
  description: 'विनोबा भाव्यांची मराठी गीता',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="mr"
      className={`${notoSerif.variable} ${notoSans.variable} ${tillana.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
