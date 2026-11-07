import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

/**
 * Animated accordion. items: [{ id, title, content }]. Single-open by default (multiple to allow many).
 * Height animates with the grid-rows 0fr -> 1fr technique (no JS measuring).
 */
const Accordion = ({ items, defaultOpen = null, multiple = false, className }) => {
  const base = useId();
  const [open, setOpen] = useState(() => new Set(defaultOpen == null ? [] : [].concat(defaultOpen)));
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(multiple ? prev : []);
      if (prev.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  return (
    <div className={cn('divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface', className)}>
      {items.map((it) => {
        const isOpen = open.has(it.id);
        const bid = `${base}-b-${it.id}`;
        const pid = `${base}-p-${it.id}`;
        return (
          <div key={it.id}>
            <h3>
              <button
                id={bid}
                type="button"
                aria-expanded={isOpen}
                aria-controls={pid}
                onClick={() => toggle(it.id)}
                className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left font-display text-lg font-semibold text-ink transition hover:bg-sand/50 sm:px-7"
              >
                <span>{it.title}</span>
                <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line bg-paper transition duration-300', isOpen && 'rotate-180 bg-primary-600 border-primary-600 text-white')}>
                  <ChevronDown size={16} aria-hidden="true" />
                </span>
              </button>
            </h3>
            <div
              id={pid}
              role="region"
              aria-labelledby={bid}
              className={cn('grid transition-[grid-template-rows,opacity] duration-300 ease-out', isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}
            >
              <div className="overflow-hidden">
                <div className="px-5 pb-6 text-ink-2 sm:px-7">{it.content}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default Accordion;
