'use client';

/** Debounced patient typeahead combobox for the Patients toolbar. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { api } from '@/lib/api';

export interface PatientSuggestion {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  alerts: string | null;
}

interface PatientSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onSelect: (patient: PatientSuggestion) => void;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;
const SUGGESTION_TAKE = 8;

export default function PatientSearchBox({ value, onChange, onSubmit, onSelect }: PatientSearchBoxProps) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const [suggestions, setSuggestions] = useState<PatientSuggestion[]>([]);
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
      void api<PatientSuggestion[]>(
        `/patients?q=${encodeURIComponent(trimmed)}&take=${SUGGESTION_TAKE}`,
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

  function selectPatient(patient: PatientSuggestion) {
    setOpen(false);
    setActiveIndex(-1);
    onSelect(patient);
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
        selectPatient(suggestions[activeIndex]);
      }
      // Otherwise let the form submit run the full search.
    }
  }

  const showList = open && value.trim().length >= MIN_CHARS;
  const activeId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-combo" ref={wrapperRef}>
      <input
        type="search"
        placeholder="Search name, MRN, phone, or email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (suggestions.length > 0 && value.trim().length >= MIN_CHARS) setOpen(true);
        }}
        role="combobox"
        aria-label="Search patients"
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
              No matching patients
            </li>
          )}
          {suggestions.map((p, index) => (
            <li key={p.id} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`search-suggestion${index === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectPatient(p)}
              >
                <span className="search-suggestion-name">
                  {p.lastName}, {p.firstName}
                  {p.alerts ? <span className="badge danger">{p.alerts}</span> : null}
                </span>
                <span className="search-suggestion-meta">
                  {p.mrn}
                  {p.dateOfBirth ? ` · ${new Date(p.dateOfBirth).toLocaleDateString()}` : ''}
                  {p.phone ? ` · ${p.phone}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
