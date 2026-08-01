'use client';

/** Returns to the previous page, falling back to a route when there is no history to pop. */
import { useRouter } from 'next/navigation';

export default function BackButton({
  fallbackHref = '/dashboard',
  label = 'Back',
}: {
  fallbackHref?: string;
  label?: string;
}) {
  const router = useRouter();

  function goBack() {
    // Direct loads and refreshes leave nothing to pop, so send them somewhere sensible.
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(fallbackHref);
  }

  return (
    <button type="button" className="back-button" onClick={goBack}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M19 12H5" />
        <path d="m12 19-7-7 7-7" />
      </svg>
      <span>{label}</span>
    </button>
  );
}
