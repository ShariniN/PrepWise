import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import NavBar from '../components/NavBar';
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

const Card = ({ children }) => <section className="bg-white rounded-2xl shadow p-6 space-y-4">{children}</section>;

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

  const shell = (children) => (
    <div className="min-h-screen bg-gray-100">
      <NavBar />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        <Link to="/questions" className="text-sm text-indigo-700 hover:underline">&larr; Question bank</Link>
        {children}
      </main>
    </div>
  );

  if (loadError) return shell(<div role="alert" className="bg-white rounded-2xl shadow p-6 text-red-700">{loadError}</div>);
  if (!isNew && !question) return shell(<p className="text-gray-500" role="status">Loading question...</p>);

  const code = isCodeType(form.type);
  const rubricType = form.type === 'short' || form.type === 'behavioural';
  const btn = 'px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50';

  return shell(
    <>
      <h1 className="text-2xl font-bold text-gray-800">{isNew ? 'New question' : form.title || 'Edit question'}</h1>
      {disabled && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex flex-wrap items-center gap-3">
          <span>{question.isSeed ? 'Seed questions are read only.' : 'You can only edit questions you authored.'} Duplicate it to make your own editable copy.</span>
          <button type="button" onClick={duplicate} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Duplicate to edit</button>
        </div>
      )}

      {!isNew && <PublishGate question={question} dirty={dirty} busy={busy} onStatus={changeStatus} onValidate={validate} canValidate={!disabled} />}
      {unavailable && <UnavailableNotice message={unavailable.message || 'The sandbox could not run your code, so validation was not recorded.'} />}
      {validation && <Card><ValidationResults result={validation} /></Card>}

      <Card>
        <QuestionFields form={form} set={set} isNew={isNew} disabled={disabled} />
      </Card>

      {(form.type === 'mcq' || form.type === 'trace') && <Card><ChoiceFields form={form} set={set} disabled={disabled} /></Card>}
      {code && <Card><SolutionEditors form={form} set={set} disabled={disabled} aiDrafted={question?.source === 'ai_drafted'} /></Card>}

      {!disabled && (
        <div className="flex gap-2 sticky bottom-0 bg-gray-100/90 py-2">
          <button type="button" className={`${btn} bg-indigo-600 text-white`} disabled={!!busy || (!isNew && !dirty)} onClick={save}>
            {busy === 'save' ? 'Saving...' : isNew ? 'Create draft' : 'Save changes'}
          </button>
          {dirty && !isNew && <span className="text-xs text-amber-700 self-center">Unsaved changes</span>}
          {!isNew && <button type="button" className={`${btn} bg-white border border-red-300 text-red-700 ml-auto`} onClick={remove}>Delete</button>}
        </div>
      )}

      {code && !isNew && (
        <Card><TestCaseTable key={question.id} questionId={question.id} tests={question.tests} disabled={disabled} onChanged={refresh} /></Card>
      )}
      {code && isNew && <p className="text-sm text-gray-500">Create the draft first, then add test cases.</p>}
      {rubricType && !isNew && <Card><RubricEditor questionId={question.id} disabled={disabled} /></Card>}
      {rubricType && isNew && <p className="text-sm text-gray-500">Create the draft first, then add a rubric.</p>}
    </>
  );
};

export default QuestionEditor;
