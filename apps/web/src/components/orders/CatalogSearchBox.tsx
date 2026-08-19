'use client';

/** Debounced catalog typeahead, used for frame and contact-lens product pickers. */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';

interface CatalogSearchBoxProps<T> {
  placeholder: string;
  ariaLabel: string;
  /** Runs on the debounced query; return the options to offer. */
  search: (query: string) => Promise<T[]>;
  optionKey: (item: T) => string;
  optionLabel: (item: T) => string;
  /** Secondary line under the label (SKU, price, modality…). */
  optionMeta?: (item: T) => string;
  onSelect: (item: T) => void;
}

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

export default function CatalogSearchBox<T>({
  placeholder,
  ariaLabel,
  search,
  optionKey,
  optionLabel,
  optionMeta,
  onSelect,
}: CatalogSearchBoxProps<T>) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const [value, setValue] = useState('');
  const [options, setOptions] = useState<T[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < MIN_CHARS) {
      setOptions([]);
      setOpen(false);
      setActiveIndex(-1);
      setLoading(false);
      return;
    }

    setLoading(true);
    const seq = ++requestSeq.current;
    const timer = setTimeout(() => {
      void search(trimmed)
        .then((rows) => {
          if (seq !== requestSeq.current) return;
          setOptions(rows);
          setOpen(true);
          setActiveIndex(-1);
        })
        .catch(() => {
          if (seq !== requestSeq.current) return;
          setOptions([]);
          setOpen(false);
          setActiveIndex(-1);
        })
        .finally(() => {
          if (seq === requestSeq.current) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // `search` is redefined every render by callers; the query is the real input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function choose(item: T) {
    setOpen(false);
    setActiveIndex(-1);
    setValue('');
    onSelect(item);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      if (!open || options.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % options.length);
      return;
    }
    if (event.key === 'ArrowUp') {
      if (!open || options.length === 0) return;
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (event.key === 'Enter') {
      // Never let Enter reach the surrounding order form.
      event.preventDefault();
      if (open && activeIndex >= 0 && options[activeIndex]) choose(options[activeIndex]);
    }
  }

  const showList = open && value.trim().length >= MIN_CHARS;
  const activeId = activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="search-combo" ref={wrapperRef}>
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (options.length > 0 && value.trim().length >= MIN_CHARS) setOpen(true);
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
          {loading && options.length === 0 && (
            <li className="search-suggestion-empty muted" role="presentation">
              Searching…
            </li>
          )}
          {!loading && options.length === 0 && (
            <li className="search-suggestion-empty muted" role="presentation">
              No matches
            </li>
          )}
          {options.map((item, index) => (
            <li key={optionKey(item)} role="presentation">
              <button
                type="button"
                id={`${listId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`search-suggestion${index === activeIndex ? ' active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                <span className="search-suggestion-name">{optionLabel(item)}</span>
                {optionMeta && <span className="search-suggestion-meta">{optionMeta(item)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
