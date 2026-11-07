import React from 'react';
import NavBar from './NavBar';
import PageHeader from './ui/PageHeader';

const WIDTHS = { narrow: 'max-w-3xl', default: 'max-w-7xl', wide: 'max-w-[90rem]' };

/**
 * Standard authenticated page frame: paper background, floating NavBar, centred container and an
 * optional PageHeader.
 *   <AppShell title="Practice" subtitle="..." actions={<Button/>}> ...content... </AppShell>
 * Props: nav (default true), width (narrow|default|wide), eyebrow, title, subtitle, actions.
 */
const AppShell = ({ nav = true, width = 'default', eyebrow, title, subtitle, actions, children }) => (
  <div className="min-h-screen bg-paper text-ink">
    {nav && <NavBar />}
    <main className={`mx-auto w-full px-4 pb-16 pt-8 sm:px-6 lg:px-8 ${WIDTHS[width]}`}>
      {title && <PageHeader eyebrow={eyebrow} title={title} subtitle={subtitle} actions={actions} />}
      {children}
    </main>
  </div>
);

export default AppShell;
