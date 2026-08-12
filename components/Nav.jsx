'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { installStorageShim, storage } from '@/lib/storage';
import { TOOLS, API_TOOLS, BRIEFS, SETUP } from '@/lib/tools';

/**
 * The storage shim is installed here, before any tool renders, because the
 * tool components call window.storage during their first effect. Installing it in
 * a page-level component would be too late for whichever tool loaded first.
 */
export default function Nav() {
  const pathname = usePathname();
  const [client, setClient] = useState(null);

  useEffect(() => {
    installStorageShim();
    (async () => {
      try {
        const r = await storage.get('brief:current');
        const b = JSON.parse(r.value);
        setClient(b?.client || null);
      } catch {
        /* no brief captured yet */
      }
    })();
  }, [pathname]);

  return (
    <nav className="topbar">
      <Link href="/" className="topbar-brand">
        <img className="topbar-mark" src="/logos/whitehart.jpg" alt="" width={20} height={20} />
        LinkedIn Ads <em>· Whitehart</em>
      </Link>
      {TOOLS.map((t) => (
        <Link
          key={t.route}
          href={`/${t.route}`}
          className="navlink"
          data-active={pathname === `/${t.route}`}
        >
          {t.name}
        </Link>
      ))}
      {API_TOOLS.map((t) => (
        <Link
          key={t.route}
          href={`/${t.route}`}
          className="navlink api"
          data-active={pathname === `/${t.route}`}
        >
          {t.name}
        </Link>
      ))}
      {client && (
        <span className="topbar-brief">
          Active brief <strong>{client}</strong>
        </span>
      )}
      <Link
        href={`/${BRIEFS.route}`}
        className="navlink setup"
        data-active={pathname === `/${BRIEFS.route}`}
      >
        {BRIEFS.name}
      </Link>
      <Link
        href={`/${SETUP.route}`}
        className="navlink setup"
        data-active={pathname === `/${SETUP.route}`}
      >
        {SETUP.name}
      </Link>
    </nav>
  );
}
