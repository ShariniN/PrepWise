import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Mic, MicOff, Play, Pause, ChevronRight, ChevronDown, Clock, FileText,
  AlertCircle, Volume2, Code, CheckCircle, SkipForward, RefreshCw,
  Download, Type, Headphones, Target, TrendingUp, Zap, MessageCircle, FileCheck } from 'lucide-react';
import AppShell from "../../components/AppShell";
import { Badge, Skeleton } from '../../components/ui';
import ExecutionInfo from '../practice/components/ExecutionInfo';

// Custom hooks
import { useInterview } from './hooks/useInterview';
import { useAudioRecording } from './hooks/useAudioRecording';
import { useFaceCoaching } from './hooks/useFaceCoaching';
import CameraCoachingSetup from './components/CameraCoachingSetup';
import CameraSelfView from './components/CameraSelfView';
import DeliveryCard from './components/DeliveryCard';
import DeliverySummary from './components/DeliverySummary';
import CodingAnswer from './components/CodingAnswer';
import { buildDeliveryMetrics, countFillerWords } from '../../utils/coachingMetrics';

// Utilities
import {
  isValidAnswer,
  isCodingQuestionType,
  processFeedback,
  createFallbackFeedback,
  isFallbackScored,
  formatTime,
} from './utils';

const TOTAL_SLOTS = 5;
const LEVEL_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const LEVEL_TONE = { easy: 'success', medium: 'warning', hard: 'danger' };
const READINESS = [
  { value: 'just_starting', label: 'Just starting', hint: 'Start with easy questions' },
  { value: 'some_practice', label: 'Some practice', hint: 'Start with medium questions' },
  { value: 'ready', label: 'Ready', hint: 'Start with hard questions' },
];

const LevelBadge = ({ level }) => (level ? <Badge tone={LEVEL_TONE[level]}>{LEVEL_LABEL[level]}</Badge> : null);

// Starting code for the coding slot in one language.
const starterFor = (question, language) => question?.starterCode?.[language] ?? '';
const firstLanguage = (question) => {
  const langs = question?.languages || [];
  return langs.includes(question?.language) ? question.language : langs.includes('python') ? 'python' : langs[0] || 'python';
};

const Interview = () => {
  const [currentStep, setCurrentStep] = useState('setup');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [feedback, setFeedback] = useState(null);
  // The server used its generic practice questions because the AI could not tailor them (QA-05).
  const [fallbackNoticeDismissed, setFallbackNoticeDismissed] = useState(false);

  // Start screen
  const [setup, setSetup] = useState(null);
  const [setupError, setSetupError] = useState('');
  const [readiness, setReadiness] = useState(null);
  const [askReadiness, setAskReadiness] = useState(false);
  const [jobDescription, setJobDescription] = useState('');
  const [showJobDescription, setShowJobDescription] = useState(false);
  const [blocked, setBlocked] = useState(null); // { code, message } for CV_REQUIRED / TARGET_ROLE_REQUIRED

  // Answer state
  const [answerMode, setAnswerMode] = useState('audio');
  const [textAnswer, setTextAnswer] = useState('');
  const [codeLanguage, setCodeLanguage] = useState('python');
  const [codes, setCodes] = useState({});

  const interview = useInterview();
  const audio = useAudioRecording();
  // Optional camera delivery coaching (off until the student turns it on; runs in the browser only).
  // The hook releases the camera itself on unmount.
  const coaching = useFaceCoaching();
  const { setSampling, resetSamples, getSamples, stop: stopCoaching, status: coachingStatus } = coaching;
  const { getSetup } = interview;

  const loadSetup = useCallback(async () => {
    setSetupError('');
    try {
      const data = await getSetup();
      setSetup(data);
      setAskReadiness(!!data.firstInterview);
      setBlocked(null);
    } catch (err) {
      setSetupError(err.message);
    }
  }, [getSetup]);

  useEffect(() => { loadSetup(); }, [loadSetup]);

  // Timer management
  useEffect(() => {
    let interval;
    if (currentStep === 'interview') {
      interval = setInterval(() => setTimer(prev => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [currentStep]);

  // Release the microphone only when the page closes. Depending on the whole `audio` object
  // (a new object every render) stopped the microphone on every re-render, so recordings were empty.
  const { cleanup: cleanupAudio } = audio;
  useEffect(() => cleanupAudio, [cleanupAudio]);

  const question = interview.currentQuestion;
  const isCodingQuestion = isCodingQuestionType(question?.type);
  const code = codes[codeLanguage] ?? '';

  // Camera samples are kept only while an answer is being given: while recording a spoken answer,
  // or while the answer screen is open for typed and coding answers. Never while submitting.
  const answeringNow = currentStep === 'interview' && !loading &&
    (isCodingQuestion || answerMode !== 'audio' || audio.isRecording);
  // coachingStatus is a dependency so a camera that becomes ready mid-answer starts sampling straight away.
  useEffect(() => { setSampling(answeringNow); }, [answeringNow, coachingStatus, setSampling]);
  // Fresh samples for each question and answer mode, and for each new recording (re-recording
  // replaces the transcript, so it replaces the camera samples too).
  const currentQuestionId = question?.questionId;
  useEffect(() => { resetSamples(); }, [currentQuestionId, answerMode, resetSamples]);
  useEffect(() => { if (audio.isRecording) resetSamples(); }, [audio.isRecording, resetSamples]);

  // A new question: clear the answer, and for the coding slot load the starting code.
  const { setTranscription } = audio;
  const prepareQuestion = useCallback((next) => {
    setTranscription('');
    setTextAnswer('');
    setError('');
    if (isCodingQuestionType(next?.type)) {
      const lang = firstLanguage(next);
      setCodeLanguage(lang);
      setCodes(Object.fromEntries((next.languages || [lang]).map((l) => [l, starterFor(next, l)])));
    }
  }, [setTranscription]);

  const changeCodeLanguage = useCallback((lang) => {
    setCodeLanguage(lang);
    setCodes((c) => (lang in c ? c : { ...c, [lang]: starterFor(question, lang) }));
  }, [question]);
  const changeCode = useCallback((v) => setCodes((c) => ({ ...c, [codeLanguage]: v })), [codeLanguage]);

  // Interview creation
  const handleCreateInterview = useCallback(async () => {
    setLoading(true);
    setError('');
    setBlocked(null);
    try {
      const { firstQuestion } = await interview.createInterview({ readiness: askReadiness ? readiness : null, jobDescription });
      prepareQuestion(firstQuestion);
      // A camera problem already shown on the setup screen should not follow the student into the interview.
      if (coachingStatus === 'error') stopCoaching();
      setCurrentStep('interview');
    } catch (err) {
      if (err.code === 'READINESS_REQUIRED') {
        setAskReadiness(true);
        setError(err.message);
      } else if (err.code === 'CV_REQUIRED' || err.code === 'TARGET_ROLE_REQUIRED') {
        setBlocked({ code: err.code, message: err.message });
      } else {
        setError(`Failed to create interview: ${err.message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [interview, askReadiness, readiness, jobDescription, prepareQuestion, coachingStatus, stopCoaching]);

  // Complete interview
  const handleCompleteInterview = useCallback(async () => {
    // The interview is over: release the camera now (coaching is opt-in again next time).
    stopCoaching();
    try {
      const overallFeedback = await interview.completeInterview(interview.interview.id);
      setFeedback(overallFeedback || createFallbackFeedback(interview.responses));
    } catch (err) {
      setError(`Failed to complete interview: ${err.message}`);
      setFeedback(createFallbackFeedback(interview.responses));
    }
    setCurrentStep('feedback');
  }, [interview, stopCoaching]);

  // After an answer: the next question came with the response, or the interview is done.
  const afterAnswer = useCallback(async ({ nextQuestion, done }) => {
    if (done || !nextQuestion) {
      await handleCompleteInterview();
      return;
    }
    interview.advance(nextQuestion);
    prepareQuestion(nextQuestion);
  }, [interview, handleCompleteInterview, prepareQuestion]);

  // Answer submission
  const handleSubmitAnswer = useCallback(async () => {
    const responseText = isCodingQuestion
      ? code || 'No code provided'
      : answerMode === 'audio' ? audio.transcription : textAnswer;

    if (!isValidAnswer(responseText, question?.type, isCodingQuestion ? code : null)) {
      setError('Please provide a meaningful response before submitting');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Delivery coaching numbers for this answer (no images, just numbers). Speech numbers only for a
      // real spoken transcript, not for typed answers or a hand-typed transcript after a failed transcription.
      const spoken = !isCodingQuestion && answerMode === 'audio' && !audio.transcriptionError;
      const deliveryMetrics = buildDeliveryMetrics({
        samples: getSamples(),
        spoken,
        transcript: audio.transcription,
        durationSec: audio.recordingDuration,
      });
      const fillerBreakdown = spoken ? countFillerWords(audio.transcription).byWord : null;

      const submitData = {
        questionId: question.questionId,
        responseTime: Math.max(Math.floor(timer / (interview.responses.length + 1)), 30),
        answerMode: isCodingQuestion ? 'code' : answerMode,
        responseText,
        code: isCodingQuestion ? code : null,
        language: isCodingQuestion ? codeLanguage : null,
        deliveryMetrics
      };

      const result = await interview.submitAnswer(interview.interview.id, submitData);
      resetSamples();
      const aiFeedback = result.feedback;
      // Prefer the numbers as the server stored them (after its validation).
      const storedDelivery = aiFeedback && typeof aiFeedback === 'object' && 'deliveryMetrics' in aiFeedback
        ? aiFeedback.deliveryMetrics
        : deliveryMetrics;
      const processedFeedback = processFeedback(aiFeedback, isCodingQuestion);

      interview.setQuestionFeedbacks(prev => ({ ...prev, [question.questionId]: processedFeedback }));
      interview.setResponses(prev => [...prev, {
        questionId: question.questionId,
        question: question.question,
        questionType: question.type,
        level: question.level,
        responseTime: submitData.responseTime,
        answerMode: submitData.answerMode,
        feedback: processedFeedback,
        score: processedFeedback.score || 50,
        deliveryMetrics: storedDelivery,
        fillerBreakdown
      }]);

      await afterAnswer(result);
    } catch (err) {
      setError(['ALREADY_ANSWERED', 'INTERVIEW_COMPLETED'].includes(err.code) ? err.message : `Failed to submit answer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [isCodingQuestion, code, codeLanguage, answerMode, audio, textAnswer, interview, question, timer, getSamples, resetSamples, afterAnswer]);

  // Skip question
  const handleSkipQuestion = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await interview.skipQuestion(interview.interview.id, question);
      interview.setQuestionFeedbacks(prev => ({ ...prev, [question.questionId]: result.feedback }));
      interview.setResponses(prev => [...prev, {
        questionId: question.questionId,
        question: question.question,
        questionType: question.type,
        level: question.level,
        responseTime: 5,
        answerMode: 'skipped',
        feedback: result.feedback,
        skipped: true,
        score: 0
      }]);
      await afterAnswer(result);
    } catch (err) {
      setError(`Failed to skip question: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [interview, question, afterAnswer]);

  // Reset interview
  const resetInterview = useCallback(() => {
    setCurrentStep('setup');
    setTextAnswer('');
    setAnswerMode('audio');
    setCodes({});
    setFeedback(null);
    setFallbackNoticeDismissed(false);
    setTimer(0);
    setReadiness(null);
    stopCoaching();
    resetSamples();
    interview.reset();
    loadSetup();
  }, [interview, stopCoaching, resetSamples, loadSetup]);

  // ---------------------------------------------------------------- start screen
  const renderSetup = () => {
    const ready = setup?.cv?.onFile && setup?.targetRole;
    const canStart = !loading && !!setup && (!askReadiness || !!readiness);
    return (
      <AppShell width="narrow" title="Mock interview"
        subtitle={`${TOTAL_SLOTS} questions, mixed: behavioural, technical and one coding question. Each answer sets how hard the next question is.`}>
        <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 space-y-5">
          {!setup && !setupError && <div role="status" aria-label="Loading"><Skeleton className="h-28 w-full" rounded="rounded-2xl" /></div>}
          {setupError && (
            <div role="alert" className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-100 rounded-xl text-sm text-danger-700">
              <AlertCircle className="w-4 h-4" aria-hidden="true" /> {setupError}
            </div>
          )}

          {setup && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-line bg-sand/60 p-4">
                <p className="text-xs font-medium text-ink-muted">CV on file</p>
                {setup.cv.onFile ? (
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink"><FileCheck className="w-4 h-4 text-success-600" aria-hidden="true" />{setup.cv.fileName || 'Your CV'}</p>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">No CV yet. <Link to="/cv-analyzer" className="font-semibold text-primary-700 hover:text-primary-800">Upload your CV</Link></p>
                )}
              </div>
              <div className="rounded-2xl border border-line bg-sand/60 p-4">
                <p className="text-xs font-medium text-ink-muted">Practising for</p>
                {setup.targetRole ? (
                  <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ink"><Target className="w-4 h-4 text-primary-600" aria-hidden="true" />{setup.targetRole.title}</p>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">No target role yet. <Link to="/profile-settings" className="font-semibold text-primary-700 hover:text-primary-800">Choose one in your profile</Link></p>
                )}
                {setup.targetRole && <Link to="/profile-settings" className="mt-1 inline-block text-xs font-semibold text-primary-700 hover:text-primary-800">Change</Link>}
              </div>
            </div>
          )}

          {setup && !setup.firstInterview && setup.startLevel && !askReadiness && (
            <p className="text-sm text-ink-2">You finished your last interview at <LevelBadge level={setup.startLevel} />, so this one starts there.</p>
          )}

          {askReadiness && (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold text-ink">How ready do you feel?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {READINESS.map((r) => (
                  <button key={r.value} type="button" aria-pressed={readiness === r.value} onClick={() => setReadiness(r.value)}
                    className={`rounded-2xl border-2 p-3 text-left transition ${readiness === r.value ? 'border-primary-500 bg-primary-50' : 'border-line bg-surface hover:border-primary-300'}`}>
                    <span className="block text-sm font-semibold text-ink">{r.label}</span>
                    <span className="block text-xs text-ink-muted">{r.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          <div>
            <button type="button" aria-expanded={showJobDescription} onClick={() => setShowJobDescription((v) => !v)}
              className="flex items-center gap-2 text-sm font-semibold text-primary-700 hover:text-primary-800">
              <ChevronDown className={`w-4 h-4 transition ${showJobDescription ? 'rotate-180' : ''}`} aria-hidden="true" />
              Practising for a specific job? Paste the description
            </button>
            {showJobDescription && (
              <textarea
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                maxLength={5000}
                aria-label="Job description (optional)"
                className="mt-2 w-full px-3 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 h-28 resize-none text-sm"
                placeholder="Optional. Paste the job description and the questions will also use it."
              />
            )}
          </div>

          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-primary-900 mb-2 flex items-center gap-2">
              <Volume2 className="w-4 h-4" aria-hidden="true" />
              Microphone (optional)
            </h4>
            <p className="text-xs text-primary-700 mb-3">Test your microphone if you want to answer by speaking. You can always type instead.</p>
            <button
              type="button"
              onClick={audio.initializeAudio}
              disabled={audio.audioPermission}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                audio.audioPermission ? 'bg-success-100 text-success-700 border border-success-100' : 'bg-primary-600 hover:bg-primary-700 text-white'
              }`}
            >
              {audio.audioPermission ? <><CheckCircle className="w-3 h-3" aria-hidden="true" />Ready</> : <><Mic className="w-3 h-3" aria-hidden="true" />Test Mic</>}
            </button>
            {audio.audioError && (
              <p className="mt-2 p-2 bg-danger-50 border border-danger-100 rounded-xl text-xs text-danger-600 flex items-center gap-2">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />{audio.audioError}
              </p>
            )}
          </div>

          <CameraCoachingSetup coaching={coaching} />

          {blocked && (
            <div role="alert" className="rounded-xl border border-sun-200 bg-sun-100 p-3 text-sm text-ink">
              {blocked.message}{' '}
              {blocked.code === 'CV_REQUIRED'
                ? <Link to="/cv-analyzer" className="font-semibold text-primary-700 hover:text-primary-800">Go to the CV page</Link>
                : <Link to="/profile-settings" className="font-semibold text-primary-700 hover:text-primary-800">Go to your profile</Link>}
            </div>
          )}
          {error && (
            <div role="alert" className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-100 rounded-xl">
              <AlertCircle className="w-4 h-4 text-danger-500" aria-hidden="true" />
              <span className="text-danger-700 text-sm">{error}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleCreateInterview}
            disabled={!canStart}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-line disabled:text-ink-muted text-white font-semibold py-3 px-6 rounded-full transition-all duration-200 flex items-center justify-center gap-3 shadow-pill active:scale-[0.97] disabled:transform-none disabled:shadow-none"
          >
            {loading ? (
              <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>Preparing your questions...</>
            ) : (
              <><Zap className="w-4 h-4" aria-hidden="true" />Start interview<ChevronRight className="w-4 h-4" aria-hidden="true" /></>
            )}
          </button>
          {setup && !ready && <p className="text-xs text-ink-muted">You need a CV on file and a target role to start.</p>}
        </div>
      </AppShell>
    );
  };

  // ---------------------------------------------------------------- interview
  const renderInterview = () => (
    <AppShell width="wide">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-4 shadow-soft sm:px-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mock Interview</h1>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            Question {interview.questionIndex + 1} of {TOTAL_SLOTS} <LevelBadge level={question?.level} />
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-ink-2">
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span className="font-mono text-sm">{formatTime(timer)}</span>
          </div>
          <div className="w-28 sm:w-40">
            <div className="w-full bg-sand rounded-full h-2.5">
              <div className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${((interview.questionIndex + 1) / TOTAL_SLOTS) * 100}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {interview.interview?.usedFallbackQuestions && !fallbackNoticeDismissed && (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-3xl border border-sun-200 bg-sun-100 p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold">These are generic practice questions</p>
            <p className="mt-1 text-ink-2">
              The AI is unavailable right now, so the questions are not tailored to your CV and target role.
              They still adapt to your answers. You can practise with them, or try again later for tailored questions.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={() => setFallbackNoticeDismissed(true)}
              className="rounded-full border border-line bg-surface px-4 py-2 font-semibold text-ink-2 hover:bg-sand">
              Continue with these
            </button>
          </div>
        </div>
      )}

      <div className={`grid gap-6 ${isCodingQuestion ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-4xl mx-auto'}`}>
        <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 self-start">
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
              isCodingQuestion ? 'bg-gradient-to-r from-primary-500 to-danger-500' :
              question?.type === 'technical' ? 'bg-primary-500' : 'bg-success-500'
            }`}>
              {isCodingQuestion ? <Code className="w-6 h-6 text-white" aria-hidden="true" /> : <MessageCircle className="w-6 h-6 text-white" aria-hidden="true" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  question?.type === 'behavioral' ? 'bg-success-100 text-success-700' : 'bg-primary-100 text-primary-800'
                }`}>
                  {question?.type === 'behavioral' ? 'BEHAVIOURAL' : question?.type?.toUpperCase()}
                </span>
                <LevelBadge level={question?.level} />
              </div>
              <h2 className="text-lg font-bold text-ink leading-relaxed">{question?.question}</h2>
            </div>
          </div>

          {!isCodingQuestion && (
            <div className="mb-6">
              <p className="block text-sm font-medium text-ink-2 mb-3">Response Method:</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" aria-pressed={answerMode === 'audio'} onClick={() => setAnswerMode('audio')}
                  className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 ${
                    answerMode === 'audio' ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-lg' : 'bg-sand border-line text-ink-2 hover:bg-sand'
                  }`}>
                  <div className="w-8 h-8 bg-primary-100 rounded-xl flex items-center justify-center"><Headphones className="w-4 h-4 text-primary-600" aria-hidden="true" /></div>
                  <div className="text-left"><div className="text-sm font-medium">Audio</div><div className="text-xs text-ink-muted">Speak answer</div></div>
                </button>
                <button type="button" aria-pressed={answerMode === 'text'} onClick={() => setAnswerMode('text')}
                  className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 ${
                    answerMode === 'text' ? 'bg-success-50 border-success-500 text-success-700 shadow-lg' : 'bg-sand border-line text-ink-2 hover:bg-sand'
                  }`}>
                  <div className="w-8 h-8 bg-success-100 rounded-xl flex items-center justify-center"><Type className="w-4 h-4 text-success-600" aria-hidden="true" /></div>
                  <div className="text-left"><div className="text-sm font-medium">Text</div><div className="text-xs text-ink-muted">Type answer</div></div>
                </button>
              </div>
            </div>
          )}

          {!isCodingQuestion && answerMode === 'audio' && (
            <div className="space-y-4">
              <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100">
                <div className="flex items-center justify-center gap-4 py-6">
                  <button type="button"
                    onClick={audio.isRecording ? audio.stopRecording : audio.startRecording}
                    disabled={loading}
                    aria-label={audio.isRecording ? 'Stop recording' : 'Start recording'}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                      audio.isRecording ? 'bg-danger-500 hover:bg-danger-600 text-white animate-pulse' : 'bg-primary-500 hover:bg-primary-600 text-white'
                    }`}>
                    {audio.isRecording ? <MicOff className="w-8 h-8" aria-hidden="true" /> : <Mic className="w-8 h-8" aria-hidden="true" />}
                  </button>
                  {audio.audioBlob && (
                    <button type="button" onClick={audio.playRecording} aria-label={audio.isPlaying ? 'Pause playback' : 'Play recording'}
                      className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                        audio.isPlaying ? 'bg-sun-500 hover:bg-sun-600' : 'bg-ink-muted hover:bg-ink-2'
                      } text-white`}>
                      {audio.isPlaying ? <Pause className="w-6 h-6" aria-hidden="true" /> : <Play className="w-6 h-6" aria-hidden="true" />}
                    </button>
                  )}
                </div>
                <div className="text-center space-y-2">
                  <p className="text-ink-2 text-sm font-medium">
                    {audio.isRecording ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 bg-danger-500 rounded-full animate-pulse"></span>
                        Recording... {audio.recordingTime}s
                      </span>
                    ) : 'Click microphone to record'}
                  </p>
                  {audio.audioBlob && (
                    <p className="bg-success-100 border border-success-100 rounded-xl p-2 text-success-700 text-sm font-medium flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" aria-hidden="true" />
                      Recorded ({Math.round(audio.audioBlob.size / 1024)}KB)
                    </p>
                  )}
                  {audio.isTranscribing && (
                    <p className="bg-primary-100 border border-primary-200 rounded-xl p-2 text-primary-800 text-sm flex items-center justify-center gap-2">
                      <span className="animate-spin rounded-full h-3 w-3 border-2 border-primary-600 border-t-transparent"></span>
                      Transcribing...
                    </p>
                  )}
                </div>
              </div>

              {audio.transcription && !audio.transcriptionError && (
                <div className="bg-primary-50 border border-primary-200 rounded-2xl p-4">
                  <h4 className="text-sm font-semibold text-primary-900 mb-2 flex items-center gap-2"><Volume2 className="w-4 h-4" aria-hidden="true" />Transcription</h4>
                  <div className="bg-surface rounded-xl p-3 border border-primary-100">
                    <p className="text-ink-2 text-sm leading-relaxed">{audio.transcription}</p>
                  </div>
                </div>
              )}

              {audio.transcriptionError && (
                <div className="bg-sun-50 border border-sun-200 rounded-2xl p-4">
                  <p role="alert" className="text-sun-700 mb-2 text-sm">{audio.transcriptionError}</p>
                  <label htmlFor="iv-manual-transcript" className="block text-xs font-medium text-sun-700 mb-1">Type your answer:</label>
                  <textarea
                    id="iv-manual-transcript"
                    value={audio.transcription}
                    onChange={(e) => audio.setTranscription(e.target.value)}
                    className="w-full h-24 px-3 py-2 border border-sun-300 rounded-xl focus:ring-2 focus:ring-sun-500 resize-none text-sm"
                    placeholder="Type your answer here..."
                  />
                </div>
              )}
            </div>
          )}

          {!isCodingQuestion && answerMode === 'text' && (
            <div className="bg-success-50 rounded-2xl p-4 border border-success-100">
              <label htmlFor="iv-text-answer" className="block text-sm font-medium text-success-700 mb-2">Your Written Response:</label>
              <textarea
                id="iv-text-answer"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                className="w-full h-32 px-3 py-2 border border-success-100 rounded-xl focus:ring-2 focus:ring-success-500 resize-none text-sm"
                placeholder="Type your answer here..."
              />
              <div className="mt-2 flex justify-between text-xs text-success-600">
                <span>Characters: {textAnswer.length}</span>
                <span>Words: {textAnswer.split(' ').filter(w => w.length > 0).length}</span>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-3 mt-6">
            <button type="button" onClick={handleSkipQuestion} disabled={loading}
              className="bg-ink-muted hover:bg-ink-2 disabled:bg-line text-white font-medium py-2 px-4 rounded-full transition-all flex items-center gap-2 text-sm">
              {loading ? <span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span> : <><SkipForward className="w-4 h-4" aria-hidden="true" />Skip</>}
            </button>
            {((isCodingQuestion && code.trim()) ||
              (!isCodingQuestion && ((answerMode === 'audio' && audio.transcription) || (answerMode === 'text' && textAnswer.trim())))) && (
              <button type="button" onClick={handleSubmitAnswer} disabled={loading}
                className="bg-success-600 hover:bg-success-700 disabled:bg-line disabled:text-ink-muted text-white font-semibold py-2 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97] disabled:transform-none text-sm">
                {loading ? (
                  <><span className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></span>Processing...</>
                ) : (
                  <><CheckCircle className="w-4 h-4" aria-hidden="true" />{interview.questionIndex + 1 < TOTAL_SLOTS ? 'Submit & Continue' : 'Submit & Finish'}<ChevronRight className="w-4 h-4" aria-hidden="true" /></>
                )}
              </button>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-100 rounded-2xl mt-4">
              <AlertCircle className="w-4 h-4 text-danger-500" aria-hidden="true" />
              <span className="text-danger-700 text-sm">{error}</span>
            </div>
          )}
        </div>

        {isCodingQuestion && (
          <CodingAnswer question={question} code={code} onCode={changeCode} language={codeLanguage} onLanguage={changeCodeLanguage} />
        )}
      </div>

      <audio ref={audio.audioPlaybackRef} className="hidden" />
      <CameraSelfView coaching={coaching} measuring={answeringNow} />
    </AppShell>
  );

  // ---------------------------------------------------------------- results
  // Levels as the server stored them (falls back to what this page recorded if the report could not be loaded).
  const levelReached = feedback?.levelReached || null;
  const askedQuestions = useMemo(() => (feedback?.questions?.length ? feedback.questions : interview.questions), [feedback, interview.questions]);

  const renderFeedback = () => (
    <AppShell title="Interview complete" subtitle="Your results, question by question">
      {feedback && (
        <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
          {typeof feedback.score === 'number' ? (
            <div className="text-center mb-6">
              <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-white mb-4 ${
                feedback.score >= 80 ? 'bg-success-500' : feedback.score >= 60 ? 'bg-sun-500' : 'bg-danger-500'
              }`}>
                {feedback.score}%
              </div>
              <h2 className="text-2xl font-bold text-ink">{feedback.scoreIsPartial ? 'Overall Score (partial)' : 'Overall Score'}</h2>
              {feedback.excludedFallbackAnswers > 0 && (
                <p className="mx-auto mt-3 max-w-xl rounded-2xl bg-sun-100 px-4 py-2 text-sm text-ink">
                  Based on {feedback.scoredAnswers} AI-scored {feedback.scoredAnswers === 1 ? 'answer' : 'answers'}.{' '}
                  {feedback.excludedFallbackAnswers} {feedback.excludedFallbackAnswers === 1 ? 'answer has' : 'answers have'} only
                  a basic automatic estimate because AI feedback was unavailable, so {feedback.excludedFallbackAnswers === 1 ? 'it is' : 'they are'} not counted.
                </p>
              )}
            </div>
          ) : (
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-ink-2 bg-sand border border-line mb-4" aria-hidden="true">-</div>
              <h2 className="text-2xl font-bold text-ink">No overall score</h2>
              <p className="mx-auto mt-1 max-w-xl text-ink-2">
                {feedback.excludedFallbackAnswers > 0
                  ? 'AI feedback was unavailable for your answers, so they only have a basic automatic estimate and no overall score was calculated. Try another interview later for AI feedback.'
                  : 'No answers were scored in this interview.'}
              </p>
            </div>
          )}
          {levelReached && (
            <p className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold text-ink" data-testid="level-reached">
              Next interview starts at <LevelBadge level={levelReached} />
            </p>
          )}

          {feedback.feedback?.recommendations && feedback.feedback.recommendations.length > 0 && (
            <div className="bg-primary-50 p-4 rounded-xl border border-primary-100">
              <h4 className="font-semibold text-primary-900 mb-3 flex items-center gap-2"><Target className="w-5 h-5" aria-hidden="true" />Recommendations for Improvement</h4>
              <div className="space-y-2">
                {feedback.feedback.recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-surface rounded-xl border border-primary-100">
                    <div className="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <span className="text-primary-600 font-bold text-xs">{index + 1}</span>
                    </div>
                    <p className="text-ink-2 leading-relaxed text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <DeliverySummary metricsList={interview.responses.filter(r => !r.skipped).map(r => r.deliveryMetrics)} />

      {interview.responses.length > 0 && (
        <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
          <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2"><FileText className="w-5 h-5 text-primary-600" aria-hidden="true" />Question by question</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {interview.responses.map((response, index) => {
              const fb = interview.questionFeedbacks[response.questionId];
              if (!fb) return null;
              const asked = askedQuestions.find((q) => q.questionId === response.questionId);
              // Scored by the server's basic estimate because the AI was unavailable: not an AI result.
              const estimate = !response.skipped && isFallbackScored(fb);
              return (
                <div key={response.questionId} className="border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                        estimate || response.skipped ? 'bg-ink-muted' : fb.score >= 80 ? 'bg-success-500' : fb.score >= 60 ? 'bg-sun-500' : 'bg-danger-500'
                      }`}>{index + 1}</div>
                      <div>
                        <h4 className="font-semibold text-ink text-sm">Question {index + 1}</h4>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${response.questionType === 'behavioral' ? 'bg-success-100 text-success-700' : 'bg-primary-100 text-primary-700'}`}>
                            {response.questionType === 'behavioral' ? 'behavioural' : response.questionType}
                          </span>
                          <LevelBadge level={asked?.level || response.level} />
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${
                        estimate || response.skipped ? 'text-ink-muted' : fb.score >= 80 ? 'text-success-600' : fb.score >= 60 ? 'text-sun-600' : 'text-danger-600'
                      }`}>
                        {response.skipped ? 'Skipped' : estimate ? `~${fb.score}%` : `${fb.score}%`}
                      </div>
                      {estimate && <div className="text-[11px] font-medium text-ink-muted">basic estimate</div>}
                    </div>
                  </div>

                  <p className="text-ink-2 text-xs mb-3">{response.question}</p>
                  {estimate && (
                    <p role="note" className="mb-3 rounded-xl bg-sun-100 px-3 py-2 text-xs text-ink">
                      AI feedback was unavailable for this answer; this is a basic automatic estimate. It is not counted in your overall score.
                    </p>
                  )}
                  <ExecutionInfo execution={fb.execution} source={fb.executionSource} />

                  {!estimate && fb.strengths?.length > 0 && (
                    <div className="mb-2">
                      <h5 className="text-xs font-semibold text-success-700 mb-1">Strengths</h5>
                      <ul className="text-xs text-success-600 space-y-0.5">{fb.strengths.map((s, i) => <li key={i}>• {s}</li>)}</ul>
                    </div>
                  )}
                  {!estimate && !response.skipped && fb.improvements?.length > 0 && (
                    <div>
                      <h5 className="text-xs font-semibold text-sun-700 mb-1">Improvements</h5>
                      <ul className="text-xs text-sun-600 space-y-0.5">{fb.improvements.map((i, idx) => <li key={idx}>• {i}</li>)}</ul>
                    </div>
                  )}
                  {!response.skipped && <DeliveryCard metrics={response.deliveryMetrics} fillerBreakdown={response.fillerBreakdown} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {interview.responses.length > 0 && (
        <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
          <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2"><TrendingUp className="w-5 h-5 text-primary-600" aria-hidden="true" />Interview Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="text-center p-3 bg-primary-50 rounded-xl">
              <div className="text-xl font-bold text-primary-600">{interview.responses.length}</div>
              <div className="text-xs text-primary-700">Questions</div>
            </div>
            <div className="text-center p-3 bg-success-50 rounded-xl">
              <div className="text-xl font-bold text-success-600">{formatTime(timer)}</div>
              <div className="text-xs text-success-700">Total Time</div>
            </div>
            <div className="text-center p-3 bg-primary-50 rounded-xl">
              <div className="text-xl font-bold text-primary-600">{askedQuestions[0]?.level ? LEVEL_LABEL[askedQuestions[0].level] : '-'}</div>
              <div className="text-xs text-primary-700">Started at</div>
            </div>
            <div className="text-center p-3 bg-sun-50 rounded-xl">
              <div className="text-xl font-bold text-sun-600">{interview.responses.filter(r => r.skipped).length}</div>
              <div className="text-xs text-sun-700">Skipped</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <button type="button" onClick={resetInterview}
          className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97]">
          <RefreshCw className="w-4 h-4" aria-hidden="true" />
          Start New Interview
        </button>
        <button type="button" onClick={() => window.print()}
          className="bg-ink-2 text-white font-semibold py-3 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97]">
          <Download className="w-4 h-4" aria-hidden="true" />
          Download Report
        </button>
      </div>
    </AppShell>
  );

  return (
    <div className="min-h-screen">
      {currentStep === 'setup' && renderSetup()}
      {currentStep === 'interview' && renderInterview()}
      {currentStep === 'feedback' && renderFeedback()}
    </div>
  );
};

export default Interview;
