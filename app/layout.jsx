import './globals.css';
import Link from 'next/link';
import Nav from '@/components/Nav';

export const metadata = {
  title: 'LinkedIn Ads Toolkit',
  description: 'Planning, QA and reporting tools for LinkedIn Ads',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en-GB">
      <body>
        <div className="shell">
          <Nav />
          <main>{children}</main>
          {/* Deliberately not in the nav: it exists to be pointed at, not
            * navigated to. */}
          <footer className="shell-foot">
            <Link href="/privacy">Privacy</Link>
          </footer>
        </div>
      </body>
    </html>
  );
}
