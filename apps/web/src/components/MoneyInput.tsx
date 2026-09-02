'use client';

import type { InputHTMLAttributes } from 'react';

type MoneyInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'>;

/**
 * A price field carrying a faded currency mark inside the box.
 *
 * The mark is decoration, not text: it sits in the padding via CSS and stays
 * put while the field is being typed into, so the field still reads as money
 * once it has a value — which a real `placeholder` would not, since that
 * vanishes on the first keystroke. It is hidden from assistive tech because the
 * field's own label already says what the number is.
 *
 * The value stays a bare number. Nothing here parses or reformats what is
 * typed, so a pasted "$89.00" is still the caller's problem to clean up.
 */
export default function MoneyInput({ className, placeholder, ...props }: MoneyInputProps) {
  return (
    <span className="money-input">
      <input
        type="text"
        inputMode="decimal"
        placeholder={placeholder ?? '0.00'}
        className={className}
        {...props}
      />
    </span>
  );
}
