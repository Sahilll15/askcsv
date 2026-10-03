import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Instrument_Serif } from 'next/font/google';
import { JsonLd } from './components/JsonLd';
import { SiteFooter } from './components/SiteFooter';
import { APP_ID, PERSON_ID, SITE_URL, WEBSITE_ID } from '../lib/seo';
import './globals.css';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono', display: 'swap' });
const instrument = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument',
  display: 'swap',
});

const title = 'AskCSV: ask questions about a CSV in plain English';
const description =
  'Upload a CSV and ask questions in plain English. AskCSV writes the SQL, runs it with DuckDB in your browser, charts the result and checks the answer.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: '/' },
  title: { default: title, template: '%s | AskCSV' },
  description,
  keywords: ['CSV analysis', 'chat with CSV', 'ask questions about CSV', 'natural language to SQL', 'text to SQL', 'DuckDB in the browser', 'CSV to chart', 'spreadsheet data analysis'],
  applicationName: 'AskCSV',
  authors: [{ name: 'Sahil Chalke', url: 'https://sahilchalke.com' }],
  creator: 'Sahil Chalke',
  openGraph: { type: 'website', siteName: 'AskCSV', title, description, url: '/', locale: 'en_US' },
  twitter: { card: 'summary_large_image', creator: '@chalke1015', title, description },
  robots: { index: true, follow: true },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': WEBSITE_ID,
      name: 'AskCSV',
      url: SITE_URL,
      description,
      inLanguage: 'en',
      publisher: { '@id': PERSON_ID },
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'WebApplication',
      '@id': APP_ID,
      name: 'AskCSV',
      url: SITE_URL,
      description,
      isPartOf: { '@id': WEBSITE_ID },
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      isAccessibleForFree: true,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      screenshot: `${SITE_URL}/opengraph-image.png`,
      featureList: [
        'Ask questions about a CSV in plain English',
        'SQL runs in the browser with DuckDB-WASM',
        'Read-only SQL guard on the server and in the browser',
        'Bar, line, scatter, table and number charts',
        'Numbers in the answer checked against the result rows',
        'Three sample datasets',
      ],
      author: { '@id': PERSON_ID },
    },
    {
      '@type': 'Person',
      '@id': PERSON_ID,
      name: 'Sahil Chalke',
      url: 'https://sahilchalke.com',
      sameAs: ['https://github.com/Sahilll15', 'https://x.com/chalke1015'],
    },
  ],
};

export const viewport: Viewport = { themeColor: '#f4f4f6' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${mono.variable} ${instrument.variable}`}>
      <body>
        <JsonLd data={jsonLd} />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
