import React from 'react';
import { Camera, CheckCircle, AlertCircle, ShieldCheck } from 'lucide-react';
import { Button, Spinner, cn } from '../ui';
import CameraVideo from './CameraVideo';

/** Accessible on/off switch in the design system's colours. */
export function Switch({ checked, onChange, label, disabled, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
        'motion-safe:transition-colors disabled:opacity-50',
        checked ? 'bg-primary-600' : 'bg-line',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'inline-block h-6 w-6 rounded-full bg-surface shadow-soft motion-safe:transition-transform',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  );
}

/**
 * Setup screen block: opt-in toggle (off by default), what it does, a framing preview and
 * gentle handling of a blocked or missing camera. `coaching` is the useFaceCoaching() result.
 */
export default function CameraCoachingSetup({ coaching }) {
  const { status, error, stream, faceSeen, start, stop } = coaching;
  const on = status === 'starting' || status === 'ready';

  return (
    <div className="rounded-2xl border border-line bg-sand p-4" data-testid="camera-coaching-setup">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 id="camera-coaching-label" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Camera className="h-4 w-4 text-primary-600" aria-hidden="true" />
            Camera coaching (optional)
          </h4>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-2">
            Get tips on how you come across: eye contact, looking away, head movement and whether your face is
            in view. Your camera is analysed on this device only. No video or images are recorded or uploaded;
            just a few numbers per answer are saved so you can see them in your report. It is coaching only and
            never changes your score. You can turn it off at any time. Speaking pace and filler words are worked
            out from your spoken answers either way.
          </p>
        </div>
        <Switch
          id="camera-coaching-switch"
          checked={on}
          onChange={(next) => (next ? start() : stop())}
          label="Camera coaching"
        />
      </div>

      {on && (
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-[16rem] overflow-hidden rounded-2xl border border-line">
            <CameraVideo stream={stream} className="aspect-[4/3] w-full" label="Camera preview to check your framing" />
            {status === 'starting' && (
              <div className="absolute inset-0 grid place-items-center bg-ink-deep/60 text-white">
                <Spinner size={20} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm" aria-live="polite">
            {status === 'starting' && <p className="text-ink-2">Starting your camera and loading the face model...</p>}
            {status === 'ready' && faceSeen === true && (
              <p className="flex items-center gap-2 font-medium text-success-700">
                <CheckCircle className="h-4 w-4" aria-hidden="true" /> Face detected. You are well framed.
              </p>
            )}
            {status === 'ready' && faceSeen !== true && (
              <p className="flex items-start gap-2 text-sun-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  No face detected yet. Sit so your face is in the middle of the picture, with light in front of you
                  rather than behind.
                </span>
              </p>
            )}
            <p className="flex items-center gap-2 text-xs text-ink-muted">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> Measured on your device. Nothing is recorded.
            </p>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-sun-200 bg-sun-50 p-3 sm:flex-row sm:items-center sm:justify-between" role="status">
          <p className="flex items-start gap-2 text-xs text-sun-700">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
          <Button size="sm" variant="secondary" onClick={start}>Try again</Button>
        </div>
      )}
    </div>
  );
}
