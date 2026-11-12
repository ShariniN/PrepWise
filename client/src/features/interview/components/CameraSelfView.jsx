import React, { useState } from 'react';
import { Eye, EyeOff, CameraOff, Camera } from 'lucide-react';
import { cn } from '../../../components/ui';
import CameraVideo from './CameraVideo';

const HINTS = {
  'look-at-camera': 'Try to look at the camera',
  'no-face': "We can't see your face. Check your framing and light.",
};

const iconButton = 'grid h-8 w-8 place-items-center rounded-full text-ink-2 hover:bg-sand hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500';

/**
 * Small self-view in the corner during the interview, with a gentle live hint and an off switch.
 * `measuring` is true while the current answer is being given (the only time samples are kept).
 */
export default function CameraSelfView({ coaching, measuring }) {
  const { status, stream, hint, stop, error } = coaching;
  const [hidden, setHidden] = useState(false);
  if (status === 'error' && error) {
    // e.g. the camera was unplugged mid-interview: say so instead of silently disappearing.
    return (
      <>
      <div aria-hidden="true" className="h-28 lg:hidden" />
      <aside
        aria-label="Camera coaching"
        role="status"
        className="fixed bottom-4 right-4 z-40 flex w-60 items-start gap-2 rounded-3xl border border-sun-200 bg-sun-50 p-3 text-xs text-sun-700 shadow-float print:hidden"
      >
        <CameraOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="flex-1">{error}</span>
        <button type="button" onClick={stop} className="rounded-full px-1 font-semibold hover:underline" aria-label="Dismiss">
          OK
        </button>
      </aside>
      </>
    );
  }
  if (status !== 'ready' && status !== 'starting') return null;
  const hintText = measuring && hint ? HINTS[hint] : null;

  return (
    <>
    {/* Room at the bottom of the page so the fixed self-view never covers the Skip / Submit buttons
        on narrow screens (on wide screens the corner is clear of the centred content). */}
    <div aria-hidden="true" className={cn('lg:hidden', hidden ? 'h-28' : 'h-72')} />
    <aside
      aria-label="Camera coaching"
      data-testid="camera-self-view"
      className="fixed bottom-4 right-4 z-40 w-44 rounded-3xl border border-line bg-surface p-2 shadow-float sm:w-52 print:hidden"
    >
      <div className="flex items-center justify-between gap-1 px-1 pb-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink-2">
          <span
            aria-hidden="true"
            className={cn('h-2 w-2 shrink-0 rounded-full', measuring ? 'bg-success-500' : 'bg-ink-muted')}
          />
          <span className="truncate">{measuring ? 'Coaching on' : 'Coaching paused'}</span>
        </span>
        <span className="flex items-center">
          <button
            type="button"
            className={iconButton}
            onClick={() => setHidden((h) => !h)}
            aria-label={hidden ? 'Show my camera preview' : 'Hide my camera preview'}
            title={hidden ? 'Show preview' : 'Hide preview (coaching continues)'}
          >
            {hidden ? <Eye className="h-4 w-4" aria-hidden="true" /> : <EyeOff className="h-4 w-4" aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={iconButton}
            onClick={stop}
            aria-label="Turn camera coaching off"
            title="Turn camera off"
          >
            <CameraOff className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </div>

      {!hidden && (
        <div className="relative overflow-hidden rounded-2xl">
          <CameraVideo stream={stream} className="aspect-[4/3] w-full" label="Your camera self-view" />
          {status === 'starting' && (
            <div className="absolute inset-0 grid place-items-center bg-ink-deep/60">
              <Camera className="h-5 w-5 text-white motion-safe:animate-pulse" aria-hidden="true" />
            </div>
          )}
        </div>
      )}

      <p aria-live="polite" className="min-h-0 px-1 text-xs">
        {hintText && (
          <span className="mt-1.5 block rounded-xl bg-sun-50 px-2.5 py-1.5 font-medium text-sun-700 motion-safe:animate-fade-in">
            {hintText}
          </span>
        )}
      </p>
      <p className="px-1 pt-1 text-[11px] leading-tight text-ink-muted">On this device only. Not recorded.</p>
    </aside>
    </>
  );
}
