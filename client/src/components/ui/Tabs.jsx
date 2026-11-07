import React, { useId, useRef } from 'react';
import { cn } from './cn';

/**
 * Pill tabs with roving tabindex and arrow/Home/End keys.
 *   <Tabs tabs={[{id,label,icon}]} value={v} onChange={setV} />
 *   <TabPanel id="a" value={v}>...</TabPanel>   (renders only when active)
 * Pass `idBase` if you render panels far from the tabs; otherwise ids are derived from tab ids.
 */
export const Tabs = ({ tabs, value, onChange, idBase = 'tabs', size = 'md', className, ariaLabel }) => {
  const refs = useRef({});
  const uid = useId();
  const move = (i) => {
    const t = tabs[(i + tabs.length) % tabs.length];
    onChange(t.id);
    refs.current[t.id]?.focus();
  };
  const onKeyDown = (e, i) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); move(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); move(0); }
    else if (e.key === 'End') { e.preventDefault(); move(tabs.length - 1); }
  };
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-uid={uid}
      className={cn('inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-sand/70 p-1', className)}
    >
      {tabs.map((t, i) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            role="tab"
            type="button"
            id={`${idBase}-tab-${t.id}`}
            aria-selected={active}
            aria-controls={`${idBase}-panel-${t.id}`}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full font-semibold transition duration-200',
              size === 'sm' ? 'px-3.5 py-1.5 text-sm' : 'px-5 py-2.5 text-sm',
              active ? 'bg-surface text-ink shadow-soft' : 'text-ink-2 hover:text-ink',
            )}
          >
            {t.icon}
            {t.label}
          </button>
        );
      })}
    </div>
  );
};

export const TabPanel = ({ id, value, idBase = 'tabs', className, children }) => {
  if (id !== value) return null;
  return (
    <div role="tabpanel" id={`${idBase}-panel-${id}`} aria-labelledby={`${idBase}-tab-${id}`} tabIndex={0} className={cn('animate-pop-in', className)}>
      {children}
    </div>
  );
};

export default Tabs;
