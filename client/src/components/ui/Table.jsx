import React from 'react';
import { cn } from './cn';

/**
 * Clean table. Wrapper scrolls horizontally; pass maxHeight (e.g. "28rem") for a sticky header.
 *   <Table zebra><THead><Tr><Th>Name</Th></Tr></THead><TBody><Tr><Td>..</Td></Tr></TBody></Table>
 */
export const Table = ({ zebra = false, maxHeight, className, children }) => (
  <div className={cn('overflow-auto rounded-3xl border border-line bg-surface shadow-soft', className)} style={maxHeight ? { maxHeight } : undefined}>
    <table className={cn('w-full border-collapse text-left text-sm', zebra && '[&_tbody_tr:nth-child(even)]:bg-paper')}>{children}</table>
  </div>
);
export const THead = ({ children }) => <thead className="sticky top-0 z-10 bg-sand/95 backdrop-blur">{children}</thead>;
export const TBody = ({ children }) => <tbody className="divide-y divide-line">{children}</tbody>;
export const Tr = ({ onClick, className, children }) => (
  <tr onClick={onClick} className={cn('transition-colors hover:bg-primary-50/60', onClick && 'cursor-pointer', className)}>{children}</tr>
);
export const Th = ({ className, children, ...rest }) => (
  <th scope="col" className={cn('whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-2', className)} {...rest}>{children}</th>
);
export const Td = ({ className, children, ...rest }) => <td className={cn('px-4 py-3.5 align-middle text-ink', className)} {...rest}>{children}</td>;

export default Table;
