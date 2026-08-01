'use client';

import { useCallback, useId, useRef, type KeyboardEvent } from 'react';

export interface TabItem {
  key: string;
  label: string;
  stub?: boolean;
}

interface TabStripProps {
  tabs: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  /** Optional id prefix for aria-controls panel ids (`${id}-panel-${key}`). */
  id?: string;
  /** When true, tabs act as in-page anchors (href `#panel-${key}`) for single-page mode. */
  anchorMode?: boolean;
  className?: string;
}

/**
 * Accessible horizontal tablist with arrow-key navigation.
 * Active tab is tabbable; others use tabIndex={-1}.
 */
export function TabStrip({
  tabs,
  activeKey,
  onChange,
  id: idProp,
  anchorMode = false,
  className = 'exam-tabs',
}: TabStripProps) {
  const reactId = useId();
  const baseId = idProp ?? `tabs-${reactId.replace(/:/g, '')}`;
  const refs = useRef<Map<string, HTMLButtonElement | HTMLAnchorElement>>(new Map());

  const enabled = tabs.filter((t) => !t.stub);

  const focusTab = useCallback((key: string) => {
    refs.current.get(key)?.focus();
  }, []);

  function onKeyDown(event: KeyboardEvent, key: string) {
    if (!prefsKeyboardRelevant(event.key)) return;
    const idx = enabled.findIndex((t) => t.key === key);
    if (idx < 0) return;
    let next = idx;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      next = (idx + 1) % enabled.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      next = (idx - 1 + enabled.length) % enabled.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = enabled.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const target = enabled[next];
    onChange(target.key);
    focusTab(target.key);
  }

  const tabClassBase = className.includes('subtabs') ? 'subtab' : 'exam-tab';

  return (
    <nav className={className} role="tablist" aria-label="Sections">
      {tabs.map((tab) => {
        const selected = activeKey === tab.key;
        const panelId = `${baseId}-panel-${tab.key}`;
        const tabId = `${baseId}-tab-${tab.key}`;
        const commonClass = `${tabClassBase}${selected ? ' active' : ''}${tab.stub ? ' stub' : ''}`;

        if (anchorMode && !tab.stub) {
          return (
            <a
              key={tab.key}
              id={tabId}
              href={`#${panelId}`}
              role="tab"
              aria-selected={selected}
              aria-controls={panelId}
              tabIndex={selected ? 0 : -1}
              className={commonClass}
              ref={(el) => {
                if (el) refs.current.set(tab.key, el);
                else refs.current.delete(tab.key);
              }}
              onClick={(e) => {
                e.preventDefault();
                onChange(tab.key);
                document.getElementById(panelId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              onKeyDown={(e) => onKeyDown(e, tab.key)}
            >
              {tab.label}
            </a>
          );
        }

        return (
          <button
            key={tab.key}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            className={commonClass}
            disabled={tab.stub}
            title={tab.stub ? 'Coming soon' : undefined}
            ref={(el) => {
              if (el) refs.current.set(tab.key, el);
              else refs.current.delete(tab.key);
            }}
            onClick={() => onChange(tab.key)}
            onKeyDown={(e) => onKeyDown(e, tab.key)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function prefsKeyboardRelevant(key: string) {
  return (
    key === 'ArrowRight' ||
    key === 'ArrowLeft' ||
    key === 'ArrowUp' ||
    key === 'ArrowDown' ||
    key === 'Home' ||
    key === 'End'
  );
}

export default TabStrip;
