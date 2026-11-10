import React, { useContext, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Menu, X, ArrowRight, Mail, Code2, MessagesSquare, Grid3x3, ShieldCheck, FileText, Lock, Eye, UserCheck, VideoOff, Plus } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { homeForRole } from '../utils/roles';
import { Button, Reveal, ScrollNarrative, Section, Tabs, TabPanel, Accordion, Spinner, cn } from '../components/ui';
import Logo from '../components/Logo';
import HeroVisual from './landing/HeroVisual';
import { JourneyPreview, UseCasePreview } from './landing/Previews';

const PILOT_EMAIL = import.meta.env.VITE_PILOT_EMAIL || 'pilots@prepwise.example';
const PILOT_HREF = `mailto:${PILOT_EMAIL}?subject=${encodeURIComponent('PrepWise pilot request')}`;

const NAV = [
  { href: '#product', label: 'Product' },
  { href: '#lecturers', label: 'For lecturers' },
  { href: '#students', label: 'For students' },
  { href: '#privacy', label: 'Privacy' },
  { href: '#faq', label: 'FAQ' },
];

const JOURNEY = [
  { id: 'practising', title: 'Practising', text: 'Real problems, a real editor, visible examples to start and hidden tests on submit.' },
  { id: 'stuck', title: 'Stuck', text: 'The same submission keeps coming back as a wrong answer. Check the examples, run your code again, and submit when you are ready.' },
  { id: 'ready', title: 'Ready', text: 'Coding practice, mock interviews and CV analysis add up to evidence you can stand behind.' },
];

const USE_CASES = [
  { id: 'students', label: 'Students', title: 'Practise like it counts, without the pressure.', text: 'One place to code against hidden tests, rehearse interviews, rate your skills and get CV feedback matched to the role you want.' },
  { id: 'lecturers', label: 'Lecturers', title: 'See who needs help, while there is still time.', text: 'Mock interview and CV match averages across your students, a list of who needs attention, and a profile for each student. Filter by group and export to CSV.' },
  { id: 'admins', label: 'University admins', title: 'Manage your university\'s people in one place.', text: 'Invite students and staff by email or CSV import, organise students into groups, and keep registered students within your licence limit.' },
];

const FEATURES = [
  { icon: Code2, title: 'A real code editor, hidden tests', text: 'Monaco editor with sandboxed execution. Visible examples to start, hidden tests on submit, and a clear verdict such as accepted or wrong answer.' },
  { icon: MessagesSquare, title: 'Interview practice', text: 'Behavioural, technical and coding questions answered by voice, text or code, with AI feedback and a report.' },
  { icon: Grid3x3, title: 'Lecturer dashboard', text: 'Interview and CV averages once at least five students have data, who needs attention, and a profile per student. Filter by group, export to CSV.' },
  { icon: ShieldCheck, title: 'Camera coaching, on your device', text: 'Optional feedback on eye contact, face visibility and head movement, measured in the browser, alongside speaking pace and filler words. Only the numbers are kept.' },
  { icon: FileText, title: 'CV match, explained', text: 'Compare a CV with a job description: an AI score plus a keyword check, matched and missing skills, and written advice. Then rate your confidence in the skills found.' },
  { icon: Lock, title: 'Privacy by design', text: 'Fake data in demos, role-based access, and no real student CVs without a data processing agreement.' },
];

const FAQ = [
  { id: 'data', title: 'Where is our data stored?', content: 'Data location is agreed with each institution during the pilot. We will not accept real student data until a data processing agreement is in place; until then the product runs on demo data only.' },
  { id: 'ai', title: 'How is AI used?', content: 'AI generates interview questions and drafts feedback on CVs and answers, using third-party model providers (Groq, with Google Gemini as a backup). CV match scores also include a keyword check, so you can see which skills matched and which are missing. Coding practice answers are checked by running hidden tests, not by AI.' },
  { id: 'proctor', title: 'Is this proctoring software?', content: 'No. PrepWise is for practice: it does not proctor exams or check work for plagiarism. Camera coaching in mock interviews is optional and runs in the browser. Only numbers such as eye contact and speaking pace are kept; no video or images are stored or uploaded. Spoken answers are sent for transcription so they can get feedback.' },
  { id: 'lms', title: 'Does it integrate with our LMS?', content: 'Not yet. LMS integration is planned. Today people are invited by email and sign in with an account created by your university.' },
  { id: 'pricing', title: 'How is it priced?', content: 'Per student per year, with a pilot available so you can try it with one group of students first. Talk to us for details.' },
  { id: 'pilot', title: 'How does a pilot work?', content: 'We set up your institution, invite a small group of lecturers and students, and agree what success looks like. You tell us what is missing and we build around your teaching.' },
];

const Pill = ({ children, className }) => (
  <span className={cn('inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white/70 px-4 py-1.5 text-xs font-semibold text-primary-800 backdrop-blur', className)}>{children}</span>
);

const LandingNav = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="sticky top-3 z-50 px-3 pt-3 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between rounded-full border border-white/70 bg-white/80 py-2 pl-4 pr-2 shadow-pill backdrop-blur-xl">
          <a href="#top" aria-label="PrepWise home"><Logo size={32} /></a>
          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => <a key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-sm font-semibold text-ink-2 transition hover:bg-sand hover:text-ink">{n.label}</a>)}
          </nav>
          <div className="flex items-center gap-2">
            <Button as={Link} to="/login" size="sm" variant="dark">Sign in</Button>
            <button type="button" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="grid h-9 w-9 place-items-center rounded-full bg-sand md:hidden">
              {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
        {open && (
          <nav aria-label="Mobile" className="mt-2 animate-sheet-in rounded-[2rem] border border-line bg-surface/95 p-3 shadow-float backdrop-blur-xl md:hidden">
            {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setOpen(false)} className="block rounded-2xl px-4 py-3 text-sm font-semibold text-ink hover:bg-sand">{n.label}</a>)}
          </nav>
        )}
      </div>
    </div>
  );
};

const Landing = () => {
  const { isLoggedin, role, authLoading } = useContext(AppContext);
  const [journey, setJourney] = useState('practising');
  const [useCase, setUseCase] = useState('students');

  useEffect(() => { document.title = 'PrepWise - Know who is ready'; }, []);

  if (authLoading) return <div className="grid min-h-screen place-items-center text-primary-600"><Spinner label="Loading" size={28} /></div>;
  if (isLoggedin && role) return <Navigate to={homeForRole(role)} replace />;

  const uc = USE_CASES.find((u) => u.id === useCase);

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-paper text-ink">
      <LandingNav />

      <main className="space-y-6 pb-6 sm:space-y-8">
        {/* Hero */}
        <div className="container-page pt-4">
          <section className="mesh-hero grain relative overflow-hidden rounded-[2.5rem] border border-line px-5 pb-12 pt-12 sm:px-12 sm:pt-16 lg:px-16 lg:pb-16">
            <div className="relative z-10 grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
              <div>
                <Reveal><Pill><span className="h-1.5 w-1.5 rounded-full bg-sun-500" />Pilot programme open for universities</Pill></Reveal>
                <Reveal delay={80}>
                  <h1 className="mt-6 font-display text-5xl font-semibold leading-[0.98] tracking-tight text-ink text-balance sm:text-6xl lg:text-7xl">
                    Know who is ready - before the interview does.
                  </h1>
                </Reveal>
                <Reveal delay={160}>
                  <p className="mt-6 max-w-xl text-lg text-ink-2">PrepWise gives computing students a place to practise interviews, coding and CVs, and gives lecturers a clear view of who is ready and who needs help.</p>
                </Reveal>
                <Reveal delay={240} className="mt-8 flex flex-col gap-3 sm:flex-row">
                  <Button as={Link} to="/login" size="lg" iconRight={<ArrowRight size={18} aria-hidden="true" />}>Sign in with your university</Button>
                  <Button as="a" href={PILOT_HREF} size="lg" variant="secondary" icon={<Mail size={18} aria-hidden="true" />}>Request a pilot</Button>
                </Reveal>
                <Reveal delay={320}><p className="mt-8 text-sm text-ink-muted">Built for universities: students, lecturers and admins.</p></Reveal>
              </div>
              <Reveal delay={200}><HeroVisual /></Reveal>
            </div>
          </section>
        </div>

        {/* Story */}
        <div id="product" className="container-page scroll-mt-24">
          <section className="px-2 py-16 sm:px-8 sm:py-28">
            <p className="eyebrow mb-8">The idea</p>
            <ScrollNarrative
              lines={[
                <>Students <mark className="rounded-xl bg-primary-100 px-2 text-primary-800">practise</mark> on real problems.</>,
                <>Lecturers <mark className="rounded-xl bg-sun-200 px-2 text-ink">support</mark> students with evidence, not guesses.</>,
                <>Everyone can finally <mark className="rounded-xl bg-success-100 px-2 text-success-700">understand</mark> who is ready.</>,
              ]}
            />
          </section>
        </div>

        {/* Journey state cards */}
        <div id="students" className="container-page scroll-mt-24">
          <Section variant="sand" eyebrow="For students" title="Every student is somewhere on the road." lead="Pick a state to see what PrepWise shows at that moment.">
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_1.1fr]">
              <div role="group" aria-label="Student journey states" className="grid gap-3">
                {JOURNEY.map((j) => {
                  const on = j.id === journey;
                  return (
                    <button key={j.id} type="button" aria-pressed={on} onClick={() => setJourney(j.id)}
                      className={cn('rounded-3xl border p-5 text-left transition duration-300 sm:p-6', on ? 'border-primary-600 bg-surface shadow-card ring-4 ring-primary-600/10' : 'border-transparent bg-white/50 hover:bg-white/80')}>
                      <span className="flex items-center gap-3">
                        <span className={cn('h-3 w-3 rounded-full transition', on ? 'bg-primary-600' : 'bg-ink-muted/40')} />
                        <span className="font-display text-2xl font-semibold text-ink">{j.title}</span>
                      </span>
                      <span className={cn('grid transition-all duration-300', on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-60')}>
                        <span className="overflow-hidden"><span className="mt-2 block text-ink-2">{j.text}</span></span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <div key={journey} className="animate-pop-in" aria-live="polite"><JourneyPreview state={journey} /></div>
            </div>
          </Section>
        </div>

        {/* Use cases */}
        <div id="lecturers" className="container-page scroll-mt-24">
          <Section variant="card" eyebrow="For lecturers and beyond" title="One platform, three vantage points.">
            <Tabs idBase="uc" ariaLabel="Use cases" tabs={USE_CASES.map(({ id, label }) => ({ id, label }))} value={useCase} onChange={setUseCase} />
            <div className="mt-8 grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
              <div key={useCase} className="animate-pop-in">
                <h3 className="font-display text-3xl font-semibold leading-tight text-ink text-balance sm:text-4xl">{uc.title}</h3>
                <p className="mt-4 text-lg text-ink-2">{uc.text}</p>
              </div>
              {USE_CASES.map((u) => (
                <TabPanel key={u.id} idBase="uc" id={u.id} value={useCase}><UseCasePreview id={u.id} /></TabPanel>
              ))}
            </div>
          </Section>
        </div>

        {/* Features */}
        <div className="container-page">
          <Section variant="plain" eyebrow="What is inside" title="Everything computing students need to get job-ready." className="px-2 py-8 sm:px-6">
            <Reveal stagger={80} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="card card-lift h-full p-6">
                  <span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-primary-50 text-primary-600"><f.icon size={22} aria-hidden="true" /></span>
                  <h3 className="font-display text-xl font-semibold text-ink">{f.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-2">{f.text}</p>
                </div>
              ))}
            </Reveal>
          </Section>
        </div>

        {/* Private by design */}
        <div id="privacy" className="container-page scroll-mt-24">
          <Section variant="ink" eyebrow="Private by design" title="Coaching, not surveillance.">
            <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-primary-600/40 blur-3xl" aria-hidden="true" />
            <Reveal stagger={100} className="relative grid gap-4 md:grid-cols-3">
              {[
                [Eye, 'Camera coaching is optional', 'Students choose whether to turn the camera on. Eye contact, face visibility and head movement are measured in the browser.'],
                [VideoOff, 'Only numbers are kept', 'No video or images are stored or uploaded. The interview report shows figures such as eye contact and speaking pace.'],
                [UserCheck, 'Practice, not proctoring', 'PrepWise does not proctor exams or check work for plagiarism. Group averages appear only when at least five students have data.'],
              ].map(([icon, t, d]) => { const I = icon; return (
                <div key={t} className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur">
                  <span className="mb-4 grid h-11 w-11 place-items-center rounded-2xl bg-sun-400 text-ink-deep"><I size={20} aria-hidden="true" /></span>
                  <h3 className="font-display text-xl font-semibold text-white">{t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/75">{d}</p>
                </div>
              ); })}
            </Reveal>
          </Section>
        </div>

        {/* Pricing teaser */}
        <div className="container-page">
          <section className="grid items-center gap-8 rounded-[2.5rem] border border-line bg-surface p-8 shadow-soft sm:p-12 lg:grid-cols-[1.2fr_1fr] lg:p-14">
            <div>
              <p className="eyebrow mb-3">Pricing</p>
              <h2 className="font-display text-3xl font-semibold leading-tight text-ink text-balance sm:text-5xl">Per student, per year. Start with a pilot.</h2>
              <p className="mt-4 max-w-xl text-lg text-ink-2">Try PrepWise with one group of students first. If it helps, add more students. We will agree the details with you.</p>
            </div>
            <div className="flex flex-col gap-3 lg:items-end">
              <Button as="a" href={PILOT_HREF} size="lg" icon={<Mail size={18} aria-hidden="true" />}>Request a pilot</Button>
              <p className="text-sm text-ink-muted">No commitment to start the conversation.</p>
            </div>
          </section>
        </div>

        {/* FAQ */}
        <div id="faq" className="container-page scroll-mt-24">
          <Section variant="plain" eyebrow="FAQ" title="Honest answers." className="px-2 py-8 sm:px-6">
            <Accordion items={FAQ} defaultOpen="proctor" />
          </Section>
        </div>

        {/* Final CTA */}
        <div className="container-page">
          <section className="mesh-hero grain relative overflow-hidden rounded-[2.5rem] border border-line px-6 py-16 text-center sm:py-24">
            <div className="relative z-10 mx-auto max-w-3xl">
              <h2 className="font-display text-4xl font-semibold leading-[1.02] tracking-tight text-ink text-balance sm:text-6xl">Ready to see who is ready?</h2>
              <p className="mx-auto mt-5 max-w-xl text-lg text-ink-2">Sign in if your university has invited you, or talk to us about a pilot.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button as={Link} to="/login" size="lg" iconRight={<ArrowRight size={18} aria-hidden="true" />}>Sign in</Button>
                <Button as="a" href={PILOT_HREF} size="lg" variant="dark" icon={<Plus size={18} aria-hidden="true" />}>Request a pilot</Button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="container-page py-10">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-8 sm:flex-row sm:items-center">
          <Logo size={28} />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-2">
            {NAV.map((n) => <a key={n.href} href={n.href} className="hover:text-ink">{n.label}</a>)}
            <Link to="/login" className="hover:text-ink">Sign in</Link>
          </nav>
          <p className="text-xs text-ink-muted">Demo environment. Use fake data only.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
