import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { Sparkles, Users, Search, Plus, Trash2 } from 'lucide-react';
import {
  Button, Card, CardTitle, Section, Badge, Chip, StatusPill, Field, Input, Select, Textarea, Tabs, TabPanel,
  Accordion, Modal, ConfirmDialog, Table, THead, TBody, Tr, Th, Td, EmptyState, Skeleton, Spinner, ProgressBar,
  Stat, PageHeader, Reveal, ScrollNarrative, Marquee,
} from '../components/ui';

const Block = ({ title, children }) => (
  <Section variant="card" className="!p-6 sm:!p-8">
    <h2 className="mb-5 font-display text-xl font-semibold text-ink">{title}</h2>
    {children}
  </Section>
);

const swatches = [
  ['ink-deep', 'bg-ink-deep'], ['ink', 'bg-ink'], ['paper', 'bg-paper border border-line'], ['surface', 'bg-surface border border-line'], ['sand', 'bg-sand'], ['line', 'bg-line'],
  ['primary-600', 'bg-primary-600'], ['primary-100', 'bg-primary-100'], ['sun-400', 'bg-sun-400'], ['success', 'bg-success-500'], ['danger', 'bg-danger-500'],
];

/** Dev-only component gallery (route /ui-kit, rendered only when import.meta.env.DEV). */
const UiKit = () => {
  const [tab, setTab] = useState('a');
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [chip, setChip] = useState(true);

  return (
    <div className="min-h-screen bg-paper py-10">
      <div className="container-page space-y-6">
        <PageHeader eyebrow="Dev only" title="PrepWise UI kit" subtitle="Every component in src/components/ui. Import from '../components/ui'." actions={<Button variant="secondary" onClick={() => toast.success('Toast styling check')}>Fire toast</Button>} />

        <Block title="Colour tokens">
          <div className="flex flex-wrap gap-3">
            {swatches.map(([n, c]) => (
              <div key={n} className="w-28 text-xs text-ink-2"><div className={`mb-1.5 h-14 rounded-2xl ${c}`} />{n}</div>
            ))}
          </div>
          <p className="mt-6 font-display text-4xl font-semibold">Display headline - Bricolage Grotesque</p>
          <p className="mt-2 text-ink-2">Body copy in Inter. The quick brown fox jumps over the lazy dog.</p>
        </Block>

        <Block title="Button">
          <div className="flex flex-wrap items-center gap-3">
            {['primary', 'secondary', 'ghost', 'danger', 'dark', 'sun'].map((v) => <Button key={v} variant={v}>{v}</Button>)}
            <Button size="sm">Small</Button>
            <Button size="lg" iconRight={<Sparkles size={18} />}>Large</Button>
            <Button icon={<Plus size={16} />}>With icon</Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Block>

        <Block title="Badge, Chip, StatusPill, Spinner">
          <div className="flex flex-wrap items-center gap-3">
            {['neutral', 'primary', 'success', 'warning', 'danger', 'dark'].map((t) => <Badge key={t} tone={t} dot>{t}</Badge>)}
            <Chip selected={chip} onClick={() => setChip(!chip)}>Toggle chip</Chip>
            <Chip onRemove={() => toast.info('removed')}>Removable</Chip>
            <StatusPill status="passed" /><StatusPill status="pending" /><StatusPill status="failed" />
            <Spinner label="Loading" className="text-primary-600" />
          </div>
        </Block>

        <Block title="Form controls">
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Email" hint="We never share it." required>{(p) => <Input {...p} type="email" placeholder="you@uni.edu" icon={<Search size={16} />} />}</Field>
            <Field label="With error" error="This field is required">{(p) => <Input {...p} defaultValue="oops" />}</Field>
            <Field label="Group">{(p) => <Select {...p}><option>Group 1</option><option>Group 2</option></Select>}</Field>
            <Field label="Disabled">{(p) => <Input {...p} disabled defaultValue="Read only" />}</Field>
            <Field label="Notes" className="md:col-span-2">{(p) => <Textarea {...p} placeholder="Write something..." />}</Field>
          </div>
        </Block>

        <Block title="Tabs">
          <Tabs ariaLabel="Demo" tabs={[{ id: 'a', label: 'Students', icon: <Users size={16} /> }, { id: 'b', label: 'Lecturers' }, { id: 'c', label: 'University admins' }]} value={tab} onChange={setTab} />
          <div className="mt-5">
            <TabPanel id="a" value={tab}><Card tone="primary">Students panel. Arrow keys move between tabs.</Card></TabPanel>
            <TabPanel id="b" value={tab}><Card tone="sand">Lecturers panel.</Card></TabPanel>
            <TabPanel id="c" value={tab}><Card>University admins panel.</Card></TabPanel>
          </div>
        </Block>

        <Block title="Accordion">
          <Accordion defaultOpen="1" items={[{ id: '1', title: 'How does it work?', content: 'Animated, keyboard accessible, single-open by default.' }, { id: '2', title: 'Second item', content: 'More content here.' }, { id: '3', title: 'Third item', content: 'And more.' }]} />
        </Block>

        <Block title="Cards, Stat, ProgressBar">
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Ready students" value="68%" trend={{ value: '+4%', tone: 'success' }} hint="vs last term" icon={<Sparkles size={18} />} />
            <Card lift><CardTitle action={<Badge tone="primary">New</Badge>}>Lift card</CardTitle><p className="text-sm text-ink-2">Hover me.</p></Card>
            <Card tone="ink"><CardTitle>Ink card</CardTitle><ProgressBar value={64} tone="warning" label="Progress" showValue /></Card>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <ProgressBar value={30} /><ProgressBar value={70} tone="success" size="lg" /><ProgressBar value={90} tone="danger" size="sm" />
          </div>
        </Block>

        <Block title="Table">
          <Table zebra maxHeight="14rem">
            <THead><Tr><Th>Student</Th><Th>Group</Th><Th>Score</Th><Th>Status</Th></Tr></THead>
            <TBody>
              {['Ada', 'Grace', 'Alan', 'Linus', 'Margaret', 'Dennis'].map((n, i) => (
                <Tr key={n}><Td className="font-medium">{n}</Td><Td>Group {(i % 2) + 1}</Td><Td>{60 + i * 6}%</Td><Td><StatusPill status={i % 2 ? 'pending' : 'passed'} /></Td></Tr>
              ))}
            </TBody>
          </Table>
        </Block>

        <Block title="EmptyState, Skeleton">
          <div className="grid gap-5 md:grid-cols-2">
            <EmptyState title="Nothing here yet" description="Create your first practice question to see it listed." action={<Button size="sm" icon={<Plus size={14} />}>Create</Button>} />
            <div className="space-y-3"><Skeleton className="h-6 w-1/2" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-24 w-full" rounded="rounded-3xl" /></div>
          </div>
        </Block>

        <Block title="Modal, ConfirmDialog">
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setModal(true)}>Open modal</Button>
            <Button variant="danger" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>Confirm dialog</Button>
          </div>
          <Modal open={modal} onClose={() => setModal(false)} title="Edit profile" description="Focus is trapped; Escape closes." footer={<Button onClick={() => setModal(false)}>Save</Button>}>
            <Field label="Name">{(p) => <Input {...p} />}</Field>
          </Modal>
          <ConfirmDialog open={confirm} danger onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title="Delete this item?" description="This cannot be undone." confirmLabel="Delete" />
        </Block>

        <Block title="Reveal (scroll down to see it) and Marquee">
          <Reveal stagger={120} className="grid gap-4 md:grid-cols-3">
            <Card>One</Card><Card>Two</Card><Card>Three</Card>
          </Reveal>
          <Marquee className="mt-6" items={['Hidden tests', 'Lecturer dashboard', 'Camera coaching', 'CV feedback', 'Interview practice', 'Privacy by design']} />
        </Block>

        <Section variant="ink" eyebrow="Ink band" title="Dark contrast band" lead="Use for one statement section per page." />

        <Block title="ScrollNarrative">
          <ScrollNarrative lines={['Practice builds confidence.', 'Feedback builds evidence.', 'Insight builds readiness.']} />
        </Block>
      </div>
    </div>
  );
};

export default UiKit;
