import React from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import Logo from './Logo';
import { Gauge, Heatmap } from '../pages/landing/HeroVisual';

/**
 * Split layout for sign-in style pages: form card on the left, brand panel on the right (desktop).
 *   <AuthLayout title="Welcome back" subtitle="..." footer={<p/>}> <form/> </AuthLayout>
 */
const AuthLayout = ({ title, subtitle, footer, children }) => (
  <div className="grid min-h-screen bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
    <div className="flex flex-col px-5 py-6 sm:px-10">
      <div className="flex items-center justify-between">
        <Link to="/" aria-label="PrepWise home"><Logo size={34} /></Link>
        <Link to="/" className="rounded-full px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-sand hover:text-ink">Back to home</Link>
      </div>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
        <div className="animate-pop-in rounded-[2rem] border border-line bg-surface p-7 shadow-card sm:p-9">
          <h1 className="font-display text-3xl font-semibold leading-tight text-ink">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-center text-sm text-ink-2">{footer}</div>}
      </div>
    </div>

    <aside className="relative m-3 hidden overflow-hidden rounded-[2.5rem] bg-ink-deep p-10 text-white lg:flex lg:flex-col lg:justify-between lg:max-h-[calc(100vh-1.5rem)] lg:sticky lg:top-3" aria-hidden="true">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-primary-600/50 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-sun-400/25 blur-3xl" />
      <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sun-300">PrepWise</p>
        <h2 className="mt-4 max-w-md font-display text-5xl font-semibold leading-[1.02] tracking-tight">Know who is ready - before the interview does.</h2>
      </div>
      <div className="relative mx-auto my-10 w-full max-w-sm space-y-4">
        <div className="glass !bg-white/90 animate-float-slow rounded-3xl p-5 text-ink">
          <div className="flex items-center gap-5">
            <Gauge value={82} size={96} />
            <ul className="m-0 list-none space-y-2 p-0 text-xs text-ink-2">
              {['Hidden tests passing', 'Mock interview done', 'CV reviewed'].map((t) => (
                <li key={t} className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-success-500 text-white"><Check size={10} strokeWidth={3} /></span>{t}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="glass !bg-white/90 ml-10 animate-float rounded-3xl p-4 text-ink [animation-delay:-2s]">
          <p className="mb-2 text-xs font-semibold">Practice this week</p>
          <Heatmap />
        </div>
      </div>
      <p className="relative text-sm text-white/60">Mock interviews, CV feedback and coding practice, with lecturers in the loop.</p>
    </aside>
  </div>
);

export default AuthLayout;
