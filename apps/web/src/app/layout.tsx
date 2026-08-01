import type { Metadata } from 'next';
import './globals.css';
import Providers from '@/components/Providers';

export const metadata: Metadata = {
  title: 'Optical EHR',
  description: 'Electronic health records for the optical practice',
};

/** Runs before paint to apply cached theme/font/a11y attributes and avoid a flash. */
const PREFS_BOOT_SCRIPT = `
(function () {
  try {
    var raw = localStorage.getItem('ehr.prefs');
    if (!raw) return;
    var p = JSON.parse(raw);
    var a = (p && p.appearance) || {};
    var x = (p && p.accessibility) || {};
    var root = document.documentElement;
    if (a.theme) root.setAttribute('data-theme', a.theme);
    if (a.fontScale) root.setAttribute('data-font-scale', a.fontScale);
    if (a.density) root.setAttribute('data-density', a.density);
    if (a.fontFamily) root.setAttribute('data-font-family', a.fontFamily);
    root.setAttribute('data-reduced-motion', x.reducedMotion ? 'on' : 'off');
    root.setAttribute('data-focus-ring', x.boldFocusRing ? 'bold' : 'default');
    root.setAttribute('data-underline-links', x.underlineLinks ? 'on' : 'off');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
