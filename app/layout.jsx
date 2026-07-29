import './globals.css';
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
        </div>
      </body>
    </html>
  );
}
