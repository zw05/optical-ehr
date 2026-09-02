'use client';

/** Debounced ICD-10 typeahead; selecting a row fills code and description. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';

export interface Icd10Suggestion {
  code: string;
  description: string;
}

interface Icd10LookupProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  onChange: (value: string) => void;
  onSelect: (entry: Icd10Suggestion) => void;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const SUGGESTION_TAKE = 10;

export function Icd10Lookup({
  value,
  placeholder,
  disabled,
  ariaLabel,
  onChange,
  onSelect,
}: Icd10LookupProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const [suggestions, setSuggestions] = useState<Icd10Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_CHARS) {
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    setLoading(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void api<Icd10Suggestion[]>(
        `/codes/icd10?q=${encodeURIComponent(trimmed)}&take=${SUGGESTION_TAKE}`,
      )
        .then((rows) => {
          if (seq !== requestSeq.current) return;
          setSuggestions(rows);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setSuggestions([]);
          setOpen(false);
          setActiveIndex(-1);
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  function selectEntry(entry: Icd10Suggestion) {
    setOpen(false);
    setActiveIndex(-1);
    onSelect(entry);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (!open || suggestions.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!open || suggestions.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      if (open && activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        selectEntry(suggestions[activeIndex]);
      }
    }
  }

  const showList = open && value.trim().length >= MIN_CHARS;
  const activeId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-combo icd10-lookup" ref={wrapperRef}>
      <input
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0 && value.trim().length >= MIN_CHARS) setOpen(true);
        }}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        autoComplete="off"
      />
      {showList && (
        <ul id={listId} className="search-suggestions" role="listbox">
          {loading && suggestions.length === 0 && (
            <li className="search-suggestion-empty muted" role="presentation">
              Searching…
            </li>
          )}
          {!loading && suggestions.length === 0 && (
            <li className="search-suggestion-empty muted" role="presentation">
              No matching diagnoses
            </li>
          )}
          {suggestions.map((entry, index) => (
            <li key={entry.code} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`search-suggestion${index === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectEntry(entry)}
              >
                <span className="search-suggestion-name">{entry.code}</span>
                <span className="search-suggestion-meta">{entry.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
