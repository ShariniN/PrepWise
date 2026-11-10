import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { ArrowLeft } from 'lucide-react';
import AppShell from '../components/AppShell';
import { Button, Card, Skeleton } from '../components/ui';
import QuestionFields from '../components/authoring/QuestionFields';
import ChoiceFields from '../components/authoring/ChoiceFields';
import SolutionEditors from '../components/authoring/SolutionEditors';
import TestCaseTable from '../components/authoring/TestCaseTable';
import PublishGate from '../components/authoring/PublishGate';
import ValidationResults from '../components/authoring/ValidationResults';
import RubricEditor from '../components/authoring/RubricEditor';
import UnavailableNotice from '../components/UnavailableNotice';
import {
  getBankQuestion, createBankQuestion, updateBankQuestion, deleteBankQuestion,
  duplicateQuestion, validateQuestion, setStatus,
} from '../api/questions';
import { errorMessage, errorCode } from '../api/client';
import { blankForm, toForm, toPayload } from '../utils/questionForm';
import { isCodeType } from '../utils/practice';

const Panel = ({ children }) => <Card as="section" className="space-y-4">{children}</Card>;

const QuestionEditor = () => {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const [question, setQuestion] = useState(null);
  const [form, setForm] = useState(blankForm);
  const [base, setBase] = useState(() => JSON.stringify(blankForm()));
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');
  const [validation, setValidation] = useState(null);
  const [unavailable, setUnavailable] = useState(null);

  const apply = useCallback((q) => {
    setQuestion(q);
    const f = toForm(q);
    setForm(f);
    setBase(JSON.stringify(f));
  }, []);

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const data = await getBankQuestion(id);
        if (!cancelled) apply(data.question);
      } catch (e) {
        if (!cancelled) setLoadError(errorMessage(e, 'Could not load this question'));
      }
    })();
    return () => { cancelled = true; };
  }, [id, isNew, apply]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const dirty = useMemo(() => JSON.stringify(form) !== base, [form, base]);
  const disabled = !isNew && !question?.editable;

  // Reload only the server-side facts (validation, status, tests) after a side-effecting call.
  const refresh = useCallback(async () => {
    try { setQuestion((await getBankQuestion(id)).question); } catch { /* keep what we have */ }
  }, [id]);

  const save = async () => {
    if (!form.title.trim()) { toast.error('Enter a title'); return null; }
    setBusy('save');
    try {
      if (isNew) {
        const data = await createBankQuestion(toPayload(form, { isNew: true }));
        toast.success('Draft created');
        navigate(`/questions/${data.question.id}`, { replace: true });
        return data.question;
      }
      const data = await updateBankQuestion(id, toPayload(form, { isNew: false, hadWrong: !!question.wrongSolution }));
      apply({ ...data.question, tests: data.question.tests || question.tests });
      toast.success('Saved');
      return data.question;
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'));
      return null;
    } finally { setBusy(''); }
  };

  const validate = async () => {
    if (dirty && !(await save())) return;
    setBusy('validate'); setUnavailable(null); setValidation(null);
    try {
      const data = await validateQuestion(id);
      setValidation(data);
      await refresh();
    } catch (e) {
      if (e?.response?.status === 503) setUnavailable({ message: e.response.data?.message });
      else toast.error(errorMessage(e, 'Validation failed to run'));
    } finally { setBusy(''); }
  };

  const changeStatus = async (status) => {
    setBusy('status');
    try {
      const data = await setStatus(id, status);
      setQuestion((q) => ({ ...q, ...data.question, tests: data.question.tests || q.tests }));
      toast.success(`Status: ${status.replace('_', ' ')}`);
    } catch (e) {
      toast.error(errorCode(e) === 'PUBLISH_BLOCKED' ? `Cannot publish: ${errorMessage(e)}` : errorMessage(e, 'Could not change status'));
    } finally { setBusy(''); }
  };

  const remove = async () => {
    if (!window.confirm('Delete this question and its tests? This cannot be undone.')) return;
    try { await deleteBankQuestion(id); toast.success('Deleted'); navigate('/questions'); }
    catch (e) { toast.error(errorMessage(e, 'Could not delete (retire it instead if students have attempted it)')); }
  };

  const duplicate = async () => {
    try { const d = await duplicateQuestion(id); navigate(`/questions/${d.question.id}`); }
    catch (e) { toast.error(errorMessage(e, 'Could not duplicate')); }
  };

  const shell = (children, title) => (
    <AppShell title={title}>
      <div className="mx-auto max-w-4xl space-y-5">
        <Link to="/questions" className="-mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline">
          <ArrowLeft size={16} aria-hidden="true" /> Question bank
        </Link>
        {children}
      </div>
    </AppShell>
  );

  if (loadError) return shell(<div role="alert" className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-danger-700">{loadError}</div>, 'Question');
  if (!isNew && !question) {
    return shell(
      <div role="status" className="space-y-3">
        <Skeleton className="h-28 w-full" rounded="rounded-3xl" />
        <Skeleton className="h-64 w-full" rounded="rounded-3xl" />
        <span className="sr-only">Loading question...</span>
      </div>,
      'Edit question',
    );
  }

  const code = isCodeType(form.type);
  const rubricType = form.type === 'short' || form.type === 'behavioural';

  return shell(
    <>
      {disabled && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-sun-200 bg-sun-50 p-4 text-sm text-ink">
          <span className="min-w-0 flex-1">{question.isSeed ? 'Seed questions are read only.' : 'You can only edit questions you authored.'} Duplicate it to make your own editable copy.</span>
          <Button size="sm" onClick={duplicate}>Duplicate to edit</Button>
        </div>
      )}

      {!isNew && <PublishGate question={question} dirty={dirty} busy={busy} onStatus={changeStatus} onValidate={validate} canValidate={!disabled} />}
      {unavailable && <UnavailableNotice title="Validation could not run" message={unavailable.message || 'The code runner is unavailable, so validation was not recorded. Try again in a few minutes.'} />}
      {validation && <Panel><ValidationResults result={validation} /></Panel>}

      <Panel>
        <QuestionFields form={form} set={set} isNew={isNew} disabled={disabled} />
      </Panel>

      {(form.type === 'mcq' || form.type === 'trace') && <Panel><ChoiceFields form={form} set={set} disabled={disabled} /></Panel>}
      {code && <Panel><SolutionEditors form={form} set={set} disabled={disabled} aiDrafted={question?.source === 'ai_drafted'} /></Panel>}

      {!disabled && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-full border border-line bg-surface/95 px-4 py-2.5 shadow-float backdrop-blur">
          <Button loading={busy === 'save'} disabled={!!busy || (!isNew && !dirty)} onClick={save}>
            {busy === 'save' ? 'Saving...' : isNew ? 'Create draft' : 'Save changes'}
          </Button>
          {dirty && !isNew && <span className="text-xs font-medium text-sun-700">Unsaved changes</span>}
          {!isNew && <Button variant="secondary" className="ml-auto !border-danger-200 !text-danger-700" onClick={remove}>Delete</Button>}
        </div>
      )}

      {code && !isNew && (
        <Panel><TestCaseTable key={question.id} questionId={question.id} tests={question.tests} disabled={disabled} onChanged={refresh} /></Panel>
      )}
      {code && isNew && <p className="text-sm text-ink-2">Create the draft first, then add test cases.</p>}
      {rubricType && !isNew && <Panel><RubricEditor questionId={question.id} disabled={disabled} /></Panel>}
      {rubricType && isNew && <p className="text-sm text-ink-2">Create the draft first, then add a rubric.</p>}
    </>,
    isNew ? 'New question' : form.title || 'Edit question',
  );
};

export default QuestionEditor;
