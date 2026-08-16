/** Clinical outline diagrams used as drawing-pad backgrounds. */

export function AnteriorEyeSvg() {
  return (
    <svg viewBox="0 0 200 170" className="exam-draw-svg" aria-hidden>
      <path
        d="M18 88 C38 28, 162 28, 182 88"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M18 88 C42 148, 158 148, 182 88"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="100" cy="88" r="40" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <circle cx="100" cy="88" r="16" fill="none" stroke="currentColor" strokeWidth="1.35" />
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const x1 = 100 + Math.cos(a) * 18;
        const y1 = 88 + Math.sin(a) * 18;
        const x2 = 100 + Math.cos(a) * 38;
        const y2 = 88 + Math.sin(a) * 38;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="0.7" opacity="0.45" />;
      })}
    </svg>
  );
}

export function LensSvg() {
  return (
    <svg viewBox="0 0 90 130" className="exam-draw-svg" aria-hidden>
      <text x="8" y="68" fontSize="11" fill="currentColor">
        A
      </text>
      <text x="76" y="68" fontSize="11" fill="currentColor">
        P
      </text>
      <ellipse cx="45" cy="65" rx="22" ry="52" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <line x1="24" y1="65" x2="66" y2="65" stroke="currentColor" strokeWidth="1" opacity="0.7" />
    </svg>
  );
}

export function CorneaSvg() {
  return (
    <svg viewBox="0 0 220 130" className="exam-draw-svg" aria-hidden>
      <ellipse cx="110" cy="65" rx="98" ry="52" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function GonioXSvg() {
  return (
    <svg viewBox="0 0 200 200" className="exam-draw-svg exam-gonio-x" aria-hidden>
      <line x1="28" y1="28" x2="172" y2="172" stroke="currentColor" strokeWidth="1.4" />
      <line x1="172" y1="28" x2="28" y2="172" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
