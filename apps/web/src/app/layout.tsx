import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Providers from '@/components/Providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

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
    var s = (p && p.sidebar) || {};
    var root = document.documentElement;
    if (a.theme) root.setAttribute('data-theme', a.theme);
    if (a.fontScale) root.setAttribute('data-font-scale', a.fontScale);
    if (a.density) root.setAttribute('data-density', a.density);
    if (a.fontFamily) root.setAttribute('data-font-family', a.fontFamily);
    root.setAttribute('data-reduced-motion', x.reducedMotion ? 'on' : 'off');
    root.setAttribute('data-focus-ring', x.boldFocusRing ? 'bold' : 'default');
    root.setAttribute('data-underline-links', x.underlineLinks ? 'on' : 'off');
    var mode = s.mode;
    if (mode !== 'expanded' && mode !== 'rail' && mode !== 'auto') mode = 'expanded';
    root.setAttribute('data-sidebar', mode);
    var w = Math.round(Number(s.width));
    if (!w || isNaN(w)) w = 224;
    if (w < 180) w = 180;
    if (w > 400) w = 400;
    var ceiling = Math.floor(window.innerWidth / 3);
    if (ceiling >= 180 && w > ceiling) w = ceiling;
    root.style.setProperty('--sidebar-w', w + 'px');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_BOOT_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
