# PrepWise design system

Direction: confident, warm, academic-tech. Calm paper background, big rounded surfaces, pill buttons, indigo primary, amber accent, generous whitespace. Gallery of every component: run `npm run dev` and open `/ui-kit` (dev only).

## Tokens

Defined in `tailwind.config.js` and `src/index.css` (CSS variables, so a dark theme can be added by remapping them under `:root[data-theme="dark"]`).

| Use | Tailwind classes |
| --- | --- |
| Text | `text-ink`, `text-ink-2` (secondary), `text-ink-muted` (hints) |
| Page / surfaces | `bg-paper` (page), `bg-surface` (cards), `bg-sand` (quiet fills), `border-line` |
| Dark band | `bg-ink-deep text-white` (or `<Section variant="ink">`) |
| Brand | `primary-50..900` (600 is the main), `sun-*` (amber accent) |
| Status | `success-*`, `danger-*`, `sun-*` for warnings |
| Fonts | `font-display` (Bricolage Grotesque, headings; h1-h3 use it automatically), `font-sans` (Inter, body) |
| Radii | cards `rounded-3xl`, big sections `rounded-[2.5rem]`, buttons/badges `rounded-full`, inputs `rounded-2xl` |
| Shadows | `shadow-soft`, `shadow-card`, `shadow-float`, `shadow-pill` |
| Motion | `animate-pop-in`, `animate-fade-in`, `animate-float`, `animate-marquee` |

Utilities: `.container-page`, `.container-narrow`, `.section-card`, `.section-sand`, `.section-ink`, `.card`, `.card-lift`, `.eyebrow`, `.glass`, `.mesh-hero`, `.grain`, `.skeleton`.

Old pages still work: default Tailwind palettes are kept, only the body font and colours changed.

## Components (`import { ... } from '../components/ui'`)

```jsx
<AppShell title="Practice" subtitle="Pick a problem" actions={<Button>New</Button>}>
  <Card>...</Card>
</AppShell>
```

- `AppShell` (components/AppShell.jsx): paper background, floating NavBar, container and optional PageHeader. Use it as the outer element of every authenticated page (`nav={false}` if the page already renders NavBar; `width="narrow|default|wide"`).
- `PageHeader title subtitle eyebrow actions`
- `Button variant="primary|secondary|ghost|danger|dark|sun" size="sm|md|lg" loading icon iconRight block as={Link} to=".."`
- `Card tone="surface|sand|primary|ink" lift padded`, `CardTitle action`
- `Section variant="card|sand|ink|plain" eyebrow title lead align` (large rounded blocks)
- `Badge tone dot`, `Chip selected onClick onRemove`, `StatusPill status="passed"`
- `Field label hint error required` with render-prop: `<Field label="Name" error={e}>{(p) => <Input {...p} value=.. onChange=.. />}</Field>`; also `Select`, `Textarea`; `Input icon={<Mail/>}`
- `Tabs tabs value onChange idBase` + `TabPanel id value idBase`
- `Accordion items=[{id,title,content}] defaultOpen multiple`
- `Modal open onClose title description footer size`, `ConfirmDialog open onClose onConfirm danger`
- `Table zebra maxHeight` with `THead TBody Tr Th Td` (sticky header when maxHeight is set)
- `EmptyState`, `Skeleton`, `Spinner`, `ProgressBar value tone label showValue`, `Stat label value trend hint icon`
- `Reveal stagger delay` (blur+fade+scale on scroll), `ScrollNarrative lines`, `Marquee items`
- `Toaster` replaces ToastContainer (already wired in App.jsx); toasts are skinned in index.css. Keep using `toast.success/error`.
- `Logo`, `AuthLayout` (split form + brand panel) for sign-in style pages.

## Rules for restyling pages

1. Start every page with `AppShell` + `PageHeader` (via the `title` prop). Group content in `Card` / `Section`.
2. Use `Button`, `Field`/`Input`/`Select`/`Textarea`, `Table`, `Badge/StatusPill`, `Modal/ConfirmDialog`, `EmptyState`, `Skeleton` instead of hand-rolled markup. Loading states use `Skeleton` or `Spinner`, not the word "Loading..." alone.
3. No raw `gray-*`, `slate-*`, `blue-*`, `purple-*` colours in restyled pages. Use `ink*`, `paper`, `surface`, `sand`, `line`, `primary-*`, `sun-*`, `success-*`, `danger-*`.
4. Do not change handlers, API calls, routes or data flow; change markup and classes only.
5. Use `Reveal` sparingly (page headers of marketing-like views, summary grids). Never wrap tables, forms, editors or anything that re-renders often. `prefers-reduced-motion` is honoured automatically.
6. Keep contrast: body text `text-ink`/`text-ink-2`; `text-ink-muted` only for non-essential hints on `paper`/`surface`.
7. Icons: `lucide-react`, 16-20px, `aria-hidden` when decorative.
8. Charts keep using the `.viz-root` tokens in index.css.
9. Dark mode is not implemented; build only with semantic tokens so it can be added by remapping variables.

## Landing page

`pages/Landing.jsx` (+ `pages/landing/`) is the logged-out `/` route. Signed-in users are redirected to their role home. Set `VITE_PILOT_EMAIL` to change the pilot request address.
