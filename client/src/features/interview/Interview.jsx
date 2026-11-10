import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mic, MicOff, Play, Pause, ChevronRight, Clock, User, FileText, Brain, 
  AlertCircle, Volume2, Code, Terminal, CheckCircle, SkipForward, RefreshCw, 
  Trophy, Download, Type, Headphones, Upload, FileCheck, Target, TrendingUp,
  Zap, MessageCircle } from 'lucide-react';
import AppShell from "../../components/AppShell";
import CodeEditor from '../../components/CodeEditor';
import VerdictBadge from '../../components/VerdictBadge';
import UnavailableNotice from '../../components/UnavailableNotice';
import ExecutionInfo from '../../components/ExecutionInfo';

// Custom hooks
import { useInterview } from './hooks/useInterview';
import { useAudioRecording } from './hooks/useAudioRecording';
import { useCodeEditor } from '../../hooks/useCodeEditor';
import { useCV } from './hooks/useCV';
import { useFaceCoaching } from './hooks/useFaceCoaching';
import CameraCoachingSetup from './components/CameraCoachingSetup';
import CameraSelfView from './components/CameraSelfView';
import DeliveryCard from './components/DeliveryCard';
import DeliverySummary from './components/DeliverySummary';
import { buildDeliveryMetrics, countFillerWords } from '../../utils/coachingMetrics';

// Utilities
import { 
  isValidAnswer, 
  isCodingQuestionType, 
  isSetupValid, 
  processFeedback,
  createFallbackFeedback,
  isFallbackScored,
  formatTime,
  SUPPORTED_LANGUAGES
} from './utils';

const MockInterviewSystem = () => {
  // Core state
  const [currentStep, setCurrentStep] = useState('setup');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [feedback, setFeedback] = useState(null);
  // The server used its generic practice questions because the AI could not tailor them (QA-05).
  const [fallbackNoticeDismissed, setFallbackNoticeDismissed] = useState(false);

  // Interview data
  const [interviewData, setInterviewData] = useState({
    jobDescription: '',
    resumeText: ''
  });

  // Answer mode
  const [answerMode, setAnswerMode] = useState('audio');
  const [textAnswer, setTextAnswer] = useState('');
  const [showCodeEditor, setShowCodeEditor] = useState(false);

  // Debug
  const [debugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);

  const addDebugLog = useCallback((message, type = 'info') => {
    const log = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setDebugLogs(prev => [...prev.slice(-50), log]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  // Custom hooks
  const interview = useInterview(addDebugLog);
  const audio = useAudioRecording(addDebugLog);
  const codeEditor = useCodeEditor(SUPPORTED_LANGUAGES, addDebugLog);
  const cv = useCV(addDebugLog);
  // Optional camera delivery coaching (off until the student turns it on; runs in the browser only).
  // The hook releases the camera itself on unmount.
  const coaching = useFaceCoaching();
  const { setSampling, resetSamples, getSamples, stop: stopCoaching, status: coachingStatus } = coaching;

  // Authentication
  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      addDebugLog('Checking authentication...');
      
      const response = await fetch('/api/auth/is-auth', {
        method: 'GET',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        throw new Error('Server returned HTML instead of JSON');
      }

      const result = await response.json();
      
      if (result.success && result.user) {
        setUser(result.user);
        setError('');
        addDebugLog(`User authenticated: ${result.user.name}`);
        cv.loadProfileCV();
      } else {
        setError('Please log in to access the mock interview system');
      }
    } catch (err) {
      setError(`Authentication failed: ${err.message}`);
      addDebugLog(`Authentication failed: ${err.message}`, 'error');
    }
  };

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

  // Question type helper
  const isCodingQuestion = useMemo(() => {
    return isCodingQuestionType(interview.currentQuestion?.type);
  }, [interview.currentQuestion?.type]);

  // Camera samples are kept only while an answer is being given: while recording a spoken answer,
  // or while the answer screen is open for typed and coding answers. Never while submitting.
  const answeringNow = currentStep === 'interview' && !loading &&
    (isCodingQuestion || answerMode !== 'audio' || audio.isRecording);
  // coachingStatus is a dependency so a camera that becomes ready mid-answer starts sampling straight away.
  useEffect(() => { setSampling(answeringNow); }, [answeringNow, coachingStatus, setSampling]);
  // Fresh samples for each question and answer mode, and for each new recording (re-recording
  // replaces the transcript, so it replaces the camera samples too).
  const currentQuestionId = interview.currentQuestion?.questionId;
  useEffect(() => { resetSamples(); }, [currentQuestionId, answerMode, resetSamples]);
  useEffect(() => { if (audio.isRecording) resetSamples(); }, [audio.isRecording, resetSamples]);

  // Interview creation
  const handleCreateInterview = useCallback(async () => {
    if (!user || !isSetupValid(interviewData.jobDescription, interviewData.resumeText)) {
      setError('Please provide both job description and CV content');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const createdInterview = await interview.createInterview(
        interviewData, 
        cv.cvMode, 
        cv.profileCV, 
        user
      );
      
      const firstQuestion = await interview.startInterview(
        createdInterview.id, 
        codeEditor.language, 
        SUPPORTED_LANGUAGES
      );
      
      codeEditor.resetCodeEditor(firstQuestion, codeEditor.language);
      setShowCodeEditor(isCodingQuestionType(firstQuestion.type));
      // A camera problem already shown on the setup screen should not follow the student into the interview.
      if (coachingStatus === 'error') stopCoaching();
      setCurrentStep('interview');

    } catch (err) {
      setError(`Failed to create interview: ${err.message}`);
      addDebugLog(`Interview creation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, interviewData, cv.cvMode, cv.profileCV, interview, codeEditor, addDebugLog, coachingStatus, stopCoaching]);

  // Answer submission
  const handleSubmitAnswer = useCallback(async () => {
    const responseText = isCodingQuestion 
      ? codeEditor.code || 'No code provided'
      : answerMode === 'audio' ? audio.transcription : textAnswer;
    
    if (!isValidAnswer(responseText, interview.currentQuestion?.type, isCodingQuestion ? codeEditor.code : null)) {
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
        questionId: interview.currentQuestion.questionId,
        responseTime: Math.max(Math.floor(timer / (interview.responses.length + 1)), 30),
        answerMode: isCodingQuestion ? 'code' : answerMode,
        responseText,
        code: isCodingQuestion ? codeEditor.code : null,
        language: isCodingQuestion ? codeEditor.language : null,
        questionType: interview.currentQuestion.type,
        difficulty: interview.currentQuestion.difficulty || 'intermediate',
        deliveryMetrics
      };

      const aiFeedback = await interview.submitAnswer(interview.interview.id, submitData);
      resetSamples();
      // Prefer the numbers as the server stored them (after its validation).
      const storedDelivery = aiFeedback && typeof aiFeedback === 'object' && 'deliveryMetrics' in aiFeedback
        ? aiFeedback.deliveryMetrics
        : deliveryMetrics;
      const processedFeedback = processFeedback(aiFeedback, isCodingQuestion);

      interview.setQuestionFeedbacks(prev => ({
        ...prev,
        [interview.currentQuestion.questionId]: processedFeedback
      }));

      const response = {
        questionId: interview.currentQuestion.questionId,
        question: interview.currentQuestion.question,
        questionType: interview.currentQuestion.type,
        transcription: answerMode === 'audio' && !isCodingQuestion ? audio.transcription : null,
        textResponse: answerMode === 'text' && !isCodingQuestion ? textAnswer : null,
        responseTime: submitData.responseTime,
        code: isCodingQuestion ? codeEditor.code : null,
        language: isCodingQuestion ? codeEditor.language : null,
        answerMode: isCodingQuestion ? 'code' : answerMode,
        timestamp: new Date().toISOString(),
        feedback: processedFeedback,
        score: processedFeedback.score || 50,
        deliveryMetrics: storedDelivery,
        fillerBreakdown
      };

      interview.setResponses(prev => [...prev, response]);

      if (interview.questionIndex < interview.questions.length - 1) {
        await moveToNextQuestion();
      } else {
        await handleCompleteInterview();
      }

    } catch (err) {
      setError(`Failed to submit answer: ${err.message}`);
      addDebugLog(`Submit answer failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [isCodingQuestion, codeEditor, answerMode, audio, textAnswer, interview, timer, addDebugLog, getSamples, resetSamples]);

  // Skip question
  const handleSkipQuestion = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const skipFeedback = await interview.skipQuestion(
        interview.interview.id,
        interview.currentQuestion,
        codeEditor.language
      );

      interview.setQuestionFeedbacks(prev => ({
        ...prev,
        [interview.currentQuestion.questionId]: skipFeedback
      }));

      const response = {
        questionId: interview.currentQuestion.questionId,
        question: interview.currentQuestion.question,
        questionType: interview.currentQuestion.type,
        responseTime: 5,
        answerMode: 'skipped',
        timestamp: new Date().toISOString(),
        feedback: skipFeedback,
        skipped: true,
        score: 0
      };

      interview.setResponses(prev => [...prev, response]);

      if (interview.questionIndex < interview.questions.length - 1) {
        await moveToNextQuestion();
      } else {
        await handleCompleteInterview();
      }
          
    } catch (err) {
      setError(`Failed to skip question: ${err.message}`);
      addDebugLog(`Skip question failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [interview, codeEditor.language, addDebugLog]);

  // Move to next question
  const moveToNextQuestion = useCallback(async () => {
    try {
      const nextQuestion = await interview.getNextQuestion(interview.interview.id);
      
      if (nextQuestion) {
        resetQuestionState(nextQuestion);
      } else {
        await handleCompleteInterview();
      }
    } catch (err) {
      addDebugLog(`Next question failed: ${err.message}`, 'error');
      await handleCompleteInterview();
    }
  }, [interview, addDebugLog]);

  // Reset state for next question
  const resetQuestionState = useCallback((nextQuestion) => {
    audio.setTranscription('');
    setTextAnswer('');
    setError('');
    
    const isNextCoding = isCodingQuestionType(nextQuestion.type);
    setShowCodeEditor(isNextCoding);
    
    if (isNextCoding) {
      codeEditor.resetCodeEditor(nextQuestion, codeEditor.language);
    }
  }, [audio, codeEditor]);

  // Complete interview
  const handleCompleteInterview = useCallback(async () => {
    // The interview is over: release the camera now (coaching is opt-in again next time).
    stopCoaching();
    try {
      const overallFeedback = await interview.completeInterview(interview.interview.id);
      
      setFeedback(overallFeedback || createFallbackFeedback(interview.responses));
      setCurrentStep('feedback');
      
    } catch (err) {
      setError(`Failed to complete interview: ${err.message}`);
      setFeedback(createFallbackFeedback(interview.responses));
      setCurrentStep('feedback');
      addDebugLog(`Complete interview failed: ${err.message}`, 'error');
    }
  }, [interview, addDebugLog, stopCoaching]);

  // Reset interview
  const resetInterview = useCallback(() => {
    setCurrentStep('setup');
    setInterviewData(prev => ({ ...prev, jobDescription: '' }));
    setTextAnswer('');
    setAnswerMode('audio');
    setShowCodeEditor(false);
    setFeedback(null);
    setFallbackNoticeDismissed(false);
    setTimer(0);
    stopCoaching();
    resetSamples();

    interview.reset();
    codeEditor.setCode('');
    codeEditor.setCodeOutput('');
    codeEditor.setCodeInput('');
    
    if (cv.profileCV) {
      cv.changeCvMode('profile', setInterviewData);
    } else {
      cv.changeCvMode('upload', setInterviewData);
    }
  }, [interview, codeEditor, cv, stopCoaching, resetSamples]);

  // Back to the setup screen to try for tailored questions again. Unlike resetInterview, the job description,
  // the CV text and the CV source are kept, so the student only has to press Start again.
  const retryTailoredQuestions = useCallback(() => {
    setCurrentStep('setup');
    setTextAnswer('');
    setShowCodeEditor(false);
    setFeedback(null);
    setFallbackNoticeDismissed(false);
    setTimer(0);
    setError('');
    stopCoaching();
    resetSamples();
    interview.reset();
    codeEditor.setCode('');
    codeEditor.setCodeOutput('');
    codeEditor.setCodeInput('');
  }, [interview, codeEditor, stopCoaching, resetSamples]);

  // Event handlers
  const handleJobDescriptionChange = useCallback((e) => {
    setInterviewData(prev => ({ ...prev, jobDescription: e.target.value }));
  }, []);

  const handleManualCvChange = useCallback((e) => {
    const text = e.target.value;
    setInterviewData(prev => ({ ...prev, resumeText: text }));
    
    if (cv.uploadedFile && text !== '') {
      cv.setUploadedFile(null);
    }
    
    if (text.length > 0 && text.length < 50) {
      cv.setCvError('Please provide more detailed CV information (at least 50 characters)');
    } else {
      cv.setCvError('');
    }
  }, [cv]);

  const handleFileUpload = useCallback(async (event) => {
    const extractedText = await cv.handleFileUpload(event);
    if (extractedText) {
      setInterviewData(prev => ({ ...prev, resumeText: extractedText }));
    }
  }, [cv]);

  // CV Section Component
  const CVSection = useMemo(() => (
    <div className="mb-4">
      <label className="block text-sm font-medium text-ink-2 mb-2">Resume/CV *</label>
      
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => cv.changeCvMode('profile', setInterviewData)}
          disabled={!cv.profileCV}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
            cv.cvMode === 'profile' 
              ? 'bg-primary-100 border-primary-500 text-primary-700' 
              : cv.profileCV
                ? 'bg-sand border-line text-ink-2 hover:bg-sand'
                : 'bg-sand border-line text-ink-muted cursor-not-allowed'
          }`}
        >
          <User className="w-4 h-4" />
          Profile CV
          {cv.profileCV && <CheckCircle className="w-4 h-4 text-success-500" />}
        </button>
        
        <button
          onClick={() => cv.changeCvMode('upload', setInterviewData)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
            cv.cvMode === 'upload' 
              ? 'bg-primary-100 border-primary-500 text-primary-700' 
              : 'bg-sand border-line text-ink-2 hover:bg-sand'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>

        <button
          onClick={() => cv.changeCvMode('manual', setInterviewData)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm transition-colors ${
            cv.cvMode === 'manual' 
              ? 'bg-success-100 border-success-500 text-success-700' 
              : 'bg-sand border-line text-ink-2 hover:bg-sand'
          }`}
        >
          <Type className="w-4 h-4" />
          Type Manually
        </button>
      </div>

      {cv.cvMode === 'profile' && cv.profileCV && (
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-3 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-primary-600" />
              <h4 className="text-sm font-medium text-primary-900">Profile CV Loaded</h4>
            </div>
            <span className="text-xs text-primary-600">{cv.profileCV.age || 'Current'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="font-medium text-primary-700">File:</span>
              <span className="ml-1 text-primary-600">{cv.profileCV.fileName}</span>
            </div>
            <div>
              <span className="font-medium text-primary-700">Size:</span>
              <span className="ml-1 text-primary-600">{cv.profileCV.fileSize ? `${Math.round(cv.profileCV.fileSize / 1024)}KB` : 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium text-primary-700">Length:</span>
              <span className="ml-1 text-primary-600">{cv.profileCV.text.length} chars</span>
            </div>
          </div>
        </div>
      )}

      {cv.cvMode === 'upload' && (
        <div className="space-y-3">
          <div className="border-2 border-dashed border-line rounded-xl p-4 text-center hover:border-line transition-colors">
            <input
              ref={cv.fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx,.doc"
              onChange={handleFileUpload}
              className="hidden"
              disabled={cv.cvLoading}
            />
            <Upload className="w-6 h-6 text-ink-muted mx-auto mb-2" />
            <div className="text-sm text-ink-2 mb-1">
              <button
                onClick={() => cv.fileInputRef.current?.click()}
                disabled={cv.cvLoading}
                className="text-primary-600 hover:text-primary-700 font-medium disabled:text-ink-muted"
              >
                {cv.cvLoading ? 'Processing...' : 'Click to upload'}
              </button>
            </div>
            <div className="text-xs text-ink-muted">PDF, TXT, DOC, or DOCX (Max 5MB)</div>
          </div>

          {cv.cvLoading && (
            <div className="bg-primary-50 border border-primary-200 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-600 border-t-transparent"></div>
                <span className="text-sm font-medium text-primary-800">Processing CV file...</span>
              </div>
            </div>
          )}

          {cv.uploadedFile && !cv.cvLoading && interviewData.resumeText && (
            <div className="bg-success-50 border border-success-100 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileCheck className="w-4 h-4 text-success-600" />
                <span className="text-sm font-medium text-success-700">
                  {cv.uploadedFile.name} ({Math.round(cv.uploadedFile.size / 1024)}KB)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {cv.cvMode === 'manual' && (
        <div className="mt-3">
          <textarea
            value={interviewData.resumeText}
            onChange={handleManualCvChange}
            className="w-full px-3 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 h-32 resize-none text-sm"
            placeholder="Enter your professional experience, skills, education, and qualifications..."
          />
          <div className="mt-1 flex justify-between text-xs text-ink-muted">
            <span>Characters: {interviewData.resumeText.length}</span>
            <span>Words: {interviewData.resumeText.split(' ').filter(word => word.length > 0).length}</span>
          </div>
        </div>
      )}

      {cv.cvError && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-danger-50 border border-danger-100 rounded-xl">
          <AlertCircle className="w-4 h-4 text-danger-500" />
          <span className="text-danger-700 text-xs">{cv.cvError}</span>
        </div>
      )}
    </div>
  ), [cv, interviewData.resumeText, handleFileUpload, handleManualCvChange]);

  // Setup Phase Component
  const SetupPhase = useMemo(() => (
    <AppShell
      width="narrow"
      title="AI Mock Interview System"
      subtitle={`Welcome ${user?.name || 'User'}! Prepare for your software engineering internship`}
    >
          <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 space-y-4">
            {user && (
              <div className="bg-primary-50 rounded-xl p-4 mb-4 border border-primary-100">
                <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-primary-600" />
                  Interview Candidate
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-surface rounded-xl p-3 border border-primary-100">
                    <label className="block text-xs font-medium text-primary-700 mb-1">Name</label>
                    <p className="text-ink font-medium text-sm">{user.name}</p>
                  </div>
                  <div className="bg-surface rounded-xl p-3 border border-primary-100">
                    <label className="block text-xs font-medium text-primary-700 mb-1">Email</label>
                    <p className="text-ink font-medium text-sm">{user.email}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-ink-2 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-ink-muted" />
                Job Description *
              </label>
              <textarea
                value={interviewData.jobDescription}
                onChange={handleJobDescriptionChange}
                className="w-full px-3 py-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 h-24 resize-none text-sm"
                placeholder="Paste the software engineering internship job description here..."
              />
            </div>

            {CVSection}

            <div className="bg-primary-50 border border-primary-200 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-primary-900 mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Audio Setup
              </h4>
              <p className="text-xs text-primary-700 mb-3">Test your microphone before starting:</p>
              <button
                onClick={audio.initializeAudio}
                disabled={audio.audioPermission}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
                  audio.audioPermission 
                    ? 'bg-success-100 text-success-700 border border-success-100' 
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
              >
                {audio.audioPermission ? (
                  <>
                    <CheckCircle className="w-3 h-3" />
                    Ready
                  </>
                ) : (
                  <>
                    <Mic className="w-3 h-3" />
                    Test Mic
                  </>
                )}
              </button>
              {audio.audioError && (
                <div className="mt-2 p-2 bg-danger-50 border border-danger-100 rounded-xl">
                  <p className="text-xs text-danger-600 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {audio.audioError}
                  </p>
                </div>
              )}
            </div>

            <CameraCoachingSetup coaching={coaching} />

            {error && (
              <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-100 rounded-xl">
                <AlertCircle className="w-4 h-4 text-danger-500" />
                <span className="text-danger-700 text-sm">{error}</span>
              </div>
            )}

            <button
              onClick={handleCreateInterview}
              disabled={loading || !isSetupValid(interviewData.jobDescription, interviewData.resumeText) || !user}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-line disabled:text-ink-muted text-white font-semibold py-3 px-6 rounded-full transition-all duration-200 flex items-center justify-center gap-3 shadow-pill active:scale-[0.97] disabled:transform-none disabled:shadow-none"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                  Creating Interview...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Start Mock Interview
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
    </AppShell>
  ), [user, interviewData, audio, error, loading, CVSection, handleJobDescriptionChange, handleCreateInterview, coaching]);

  // Interview Phase Component
  const InterviewPhase = useMemo(() => (
    <AppShell width="wide">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-4 shadow-soft sm:px-6">
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Mock Interview</h1>
          <p className="text-sm text-ink-2">Question {interview.questionIndex + 1} of {interview.questions.length}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-ink-2">
            <Clock className="w-4 h-4" aria-hidden="true" />
            <span className="font-mono text-sm">{formatTime(timer)}</span>
          </div>
          <div className="w-28 sm:w-40">
            <div className="w-full bg-sand rounded-full h-2.5">
              <div
                className="bg-primary-600 h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${((interview.questionIndex + 1) / interview.questions.length) * 100}%` }}
              ></div>
            </div>
          </div>
        </div>
      </div>

      {interview.interview?.usedFallbackQuestions && !fallbackNoticeDismissed && (
        <div role="status" className="mb-6 flex flex-col gap-3 rounded-3xl border border-sun-200 bg-sun-100 p-4 text-sm text-ink sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="font-semibold">These are generic practice questions</p>
            <p className="mt-1 text-ink-2">
              The AI is unavailable right now, so the questions are not tailored to your CV and this job description.
              You can practise with them, or go back and try again later for tailored questions.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <button type="button" onClick={retryTailoredQuestions}
              className="rounded-full bg-primary-600 px-4 py-2 font-semibold text-white hover:bg-primary-700">
              Go back and try again
            </button>
            <button type="button" onClick={() => setFallbackNoticeDismissed(true)}
              className="rounded-full border border-line bg-surface px-4 py-2 font-semibold text-ink-2 hover:bg-sand">
              Continue with these
            </button>
          </div>
        </div>
      )}

      <div>
        <div className={`grid gap-6 ${showCodeEditor && isCodingQuestion ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-4xl mx-auto'}`}>
          <div className="bg-surface rounded-3xl shadow-soft border border-line p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                isCodingQuestion ? 'bg-gradient-to-r from-primary-500 to-danger-500' :
                interview.currentQuestion?.type === 'technical' ? 'bg-primary-500' :
                'bg-success-500'
              }`}>
                {isCodingQuestion ? <Code className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isCodingQuestion ? 'bg-primary-100 text-primary-800' :
                    interview.currentQuestion?.type === 'technical' ? 'bg-primary-100 text-primary-800' :
                    'bg-success-100 text-success-700'
                  }`}>
                    {interview.currentQuestion?.type?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-ink leading-relaxed">
                  {interview.currentQuestion?.question}
                </h2>
              </div>
            </div>

            {!isCodingQuestion && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-ink-2 mb-3">Response Method:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setAnswerMode('audio')}
                    className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 ${
                      answerMode === 'audio' 
                        ? 'bg-primary-50 border-primary-500 text-primary-700 shadow-lg' 
                        : 'bg-sand border-line text-ink-2 hover:bg-sand'
                    }`}
                  >
                    <div className="w-8 h-8 bg-primary-100 rounded-xl flex items-center justify-center">
                      <Headphones className="w-4 h-4 text-primary-600" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Audio</div>
                      <div className="text-xs text-ink-muted">Speak answer</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setAnswerMode('text')}
                    className={`flex items-center gap-2 p-3 rounded-2xl border-2 transition-all duration-200 ${
                      answerMode === 'text' 
                        ? 'bg-success-50 border-success-500 text-success-700 shadow-lg' 
                        : 'bg-sand border-line text-ink-2 hover:bg-sand'
                    }`}
                  >
                    <div className="w-8 h-8 bg-success-100 rounded-xl flex items-center justify-center">
                      <Type className="w-4 h-4 text-success-600" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Text</div>
                      <div className="text-xs text-ink-muted">Type answer</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {!isCodingQuestion && answerMode === 'audio' && (
              <div className="space-y-4">
                <div className="bg-primary-50 rounded-2xl p-4 border border-primary-100">
                  <div className="flex items-center justify-center gap-4 py-6">
                    <button
                      onClick={audio.isRecording ? audio.stopRecording : audio.startRecording}
                      disabled={loading}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                        audio.isRecording 
                          ? 'bg-danger-500 hover:bg-danger-600 text-white animate-pulse' 
                          : 'bg-primary-500 hover:bg-primary-600 text-white'
                      }`}
                    >
                      {audio.isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                    </button>
                    
                    {audio.audioBlob && (
                      <button
                        onClick={audio.playRecording}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                          audio.isPlaying ? 'bg-sun-500 hover:bg-sun-600' : 'bg-ink-muted hover:bg-ink-2'
                        } text-white`}
                      >
                        {audio.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </button>
                    )}
                  </div>

                  <div className="text-center space-y-2">
                    <p className="text-ink-2 text-sm font-medium">
                      {audio.isRecording ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-2 h-2 bg-danger-500 rounded-full animate-pulse"></div>
                          Recording... {audio.recordingTime}s
                        </span>
                      ) : (
                        'Click microphone to record'
                      )}
                    </p>
                    
                    {audio.audioBlob && (
                      <div className="bg-success-100 border border-success-100 rounded-xl p-2">
                        <p className="text-success-700 text-sm font-medium flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Recorded ({Math.round(audio.audioBlob.size / 1024)}KB)
                        </p>
                      </div>
                    )}
                    
                    {audio.isTranscribing && (
                      <div className="bg-primary-100 border border-primary-200 rounded-xl p-2">
                        <p className="text-primary-800 text-sm flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-primary-600 border-t-transparent"></div>
                          Transcribing...
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {audio.transcription && (
                  <div className="bg-primary-50 border border-primary-200 rounded-2xl p-4">
                    <h4 className="text-sm font-semibold text-primary-900 mb-2 flex items-center gap-2">
                      <Volume2 className="w-4 h-4" />
                      Transcription
                    </h4>
                    <div className="bg-surface rounded-xl p-3 border border-primary-100">
                      <p className="text-ink-2 text-sm leading-relaxed">{audio.transcription}</p>
                    </div>
                  </div>
                )}

                {audio.transcriptionError && (
                  <div className="bg-sun-50 border border-sun-200 rounded-2xl p-4">
                    <h4 className="text-sm font-semibold text-sun-700 mb-2">Manual Transcription</h4>
                    <p className="text-sun-700 mb-2 text-xs">Type what you said:</p>
                    <textarea
                      value={audio.transcription}
                      onChange={(e) => audio.setTranscription(e.target.value)}
                      className="w-full h-24 px-3 py-2 border border-sun-300 rounded-xl focus:ring-2 focus:ring-sun-500 resize-none text-sm"
                      placeholder="Type your audio response here..."
                    />
                  </div>
                )}
              </div>
            )}

            {!isCodingQuestion && answerMode === 'text' && (
              <div className="space-y-3">
                <div className="bg-success-50 rounded-2xl p-4 border border-success-100">
                  <label className="block text-sm font-medium text-success-700 mb-2">Your Written Response:</label>
                  <textarea
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    className="w-full h-32 px-3 py-2 border border-success-100 rounded-xl focus:ring-2 focus:ring-success-500 resize-none text-sm"
                    placeholder="Type your comprehensive answer here..."
                  />
                  <div className="mt-2 flex justify-between text-xs text-success-600">
                    <span>Characters: {textAnswer.length}</span>
                    <span>Words: {textAnswer.split(' ').filter(w => w.length > 0).length}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={handleSkipQuestion}
                disabled={loading}
                className="bg-ink-muted hover:bg-ink-2 disabled:bg-line text-white font-medium py-2 px-4 rounded-full transition-all flex items-center gap-2 text-sm"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                ) : (
                  <>
                    <SkipForward className="w-4 h-4" />
                    Skip
                  </>
                )}
              </button>
              
              {((isCodingQuestion && codeEditor.code.trim()) || 
                (!isCodingQuestion && ((answerMode === 'audio' && audio.transcription) || 
                (answerMode === 'text' && textAnswer.trim())))) && (
                <button
                  onClick={handleSubmitAnswer}
                  disabled={loading}
                  className="bg-success-600 hover:bg-success-700 disabled:bg-line disabled:text-ink-muted text-white font-semibold py-2 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97] disabled:transform-none text-sm"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      Submit & Continue
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-danger-50 border border-danger-100 rounded-2xl mt-4">
                <AlertCircle className="w-4 h-4 text-danger-500" />
                <span className="text-danger-700 text-sm">{error}</span>
              </div>
            )}
          </div>

          {showCodeEditor && isCodingQuestion && (
            <div className="bg-surface rounded-3xl shadow-soft border border-line p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
                  <Code className="w-5 h-5 text-primary-600" />
                  Code Editor
                  <span className="text-xs bg-success-100 text-success-700 px-2 py-1 rounded-full font-normal">
                    Sandboxed execution
                  </span>
                </h3>
                <div className="flex items-center gap-3">
                  <select
                    value={codeEditor.language}
                    onChange={(e) => codeEditor.changeLanguage(e.target.value, interview.currentQuestion)}
                    className="px-3 py-2 border border-line rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {SUPPORTED_LANGUAGES.map(lang => (
                      <option key={lang.value} value={lang.value}>
                        {lang.label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={codeEditor.executeCode}
                    disabled={codeEditor.isRunningCode || !codeEditor.code.trim()}
                    className="bg-success-600 hover:bg-success-700 disabled:bg-success-500 text-white px-4 py-2 rounded-full text-sm transition-colors flex items-center gap-2"
                  >
                    {codeEditor.isRunningCode ? (
                      <>
                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                        Executing...
                      </>
                    ) : (
                      <>
                        <Terminal className="w-4 h-4" />
                        Run Code
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-2">Your Code:</label>
                  <CodeEditor
                    value={codeEditor.code}
                    onChange={codeEditor.setCode}
                    language={codeEditor.monacoLanguage}
                    height="288px"
                    ariaLabel="Your code"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-ink-2 mb-2">
                    Program Input (if needed):
                    <span className="text-xs text-ink-muted ml-2">Leave empty if not required</span>
                  </label>
                  <textarea
                    value={codeEditor.codeInput}
                    onChange={(e) => codeEditor.setCodeInput(e.target.value)}
                    className="w-full h-16 px-3 py-2 border border-line rounded-xl text-sm bg-sand focus:border-primary-500 focus:outline-none resize-none"
                    placeholder="Enter input values (one per line)..."
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                {codeEditor.unavailable && <UnavailableNotice message={codeEditor.unavailable} />}
                {codeEditor.verdict && !codeEditor.unavailable && <VerdictBadge verdict={codeEditor.verdict} />}

                {codeEditor.codeOutput && (
                  <div>
                    <label className="block text-sm font-medium text-ink-2 mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      Execution Results:
                    </label>
                    <div className="bg-ink-deep text-success-500 p-4 rounded-xl font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto border-2 border-line">
                      {codeEditor.codeOutput}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <audio ref={audio.audioPlaybackRef} className="hidden" />
      <CameraSelfView coaching={coaching} measuring={answeringNow} />
    </AppShell>
  ), [interview, timer, isCodingQuestion, answerMode, audio, textAnswer, codeEditor, showCodeEditor, loading, error, handleSubmitAnswer, handleSkipQuestion, coaching, answeringNow, fallbackNoticeDismissed, retryTailoredQuestions]);

  // Feedback Phase Component
  const FeedbackPhase = useMemo(() => (
    <AppShell title="Interview Complete!" subtitle="Here's your comprehensive performance analysis">
      <div>
        <div>
          {feedback && (
            <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
              {typeof feedback.score === 'number' ? (
                <div className="text-center mb-6">
                  <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-white mb-4 ${
                    feedback.score >= 80 ? 'bg-success-500' :
                    feedback.score >= 60 ? 'bg-sun-500' :
                    'bg-danger-500'
                  }`}>
                    {feedback.score}%
                  </div>
                  <h2 className="text-2xl font-bold text-ink">{feedback.scoreIsPartial ? 'Overall Score (partial)' : 'Overall Score'}</h2>
                  <p className="text-ink-2">
                    {feedback.score >= 80 ? 'Excellent Performance!' :
                     feedback.score >= 60 ? 'Good Performance!' :
                     'Room for Improvement'}
                  </p>
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
                  <div className="inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-ink-2 bg-sand border border-line mb-4" aria-hidden="true">
                    -
                  </div>
                  <h2 className="text-2xl font-bold text-ink">No overall score</h2>
                  <p className="mx-auto mt-1 max-w-xl text-ink-2">
                    {feedback.excludedFallbackAnswers > 0
                      ? 'AI feedback was unavailable for your answers, so they only have a basic automatic estimate and no overall score was calculated. Try another interview later for AI feedback.'
                      : 'No answers were scored in this interview.'}
                  </p>
                </div>
              )}

              {feedback.feedback?.recommendations && feedback.feedback.recommendations.length > 0 && (
                <div className="bg-primary-50 p-4 rounded-xl border border-primary-100">
                  <h4 className="font-semibold text-primary-900 mb-3 flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Recommendations for Improvement
                  </h4>
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

          {Object.keys(interview.questionFeedbacks).length > 0 && (
            <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
              <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary-600" />
                Detailed Question Analysis
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {interview.responses.map((response, index) => {
                  const fb = interview.questionFeedbacks[response.questionId];
                  if (!fb) return null;
                  // Scored by the server's basic estimate because the AI was unavailable: not an AI result.
                  const estimate = !response.skipped && isFallbackScored(fb);
                  
                  return (
                    <div key={index} className="border border-line rounded-2xl p-4 hover:shadow-lg transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                            estimate ? 'bg-ink-muted' :
                            fb.score >= 80 ? 'bg-success-500' :
                            fb.score >= 60 ? 'bg-sun-500' :
                            'bg-danger-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-semibold text-ink text-sm">Question {index + 1}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isCodingQuestionType(interview.questions[index]?.type) ? 'bg-primary-100 text-primary-700' :
                              interview.questions[index]?.type === 'behavioral' ? 'bg-success-100 text-success-700' :
                              'bg-primary-100 text-primary-700'
                            }`}>
                              {interview.questions[index]?.type}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            estimate ? 'text-ink-muted' :
                            fb.score >= 80 ? 'text-success-600' :
                            fb.score >= 60 ? 'text-sun-600' :
                            'text-danger-600'
                          }`}>
                            {response.skipped ? 'SKIP' : estimate ? `~${fb.score}%` : `${fb.score}%`}
                          </div>
                          {estimate && <div className="text-[11px] font-medium text-ink-muted">basic estimate</div>}
                        </div>
                      </div>
                      
                      <p className="text-ink-2 text-xs mb-3">{interview.questions[index]?.question}</p>
                      {estimate && (
                        <p role="note" className="mb-3 rounded-xl bg-sun-100 px-3 py-2 text-xs text-ink">
                          AI feedback was unavailable for this answer; this is a basic automatic estimate. It is not counted in your overall score.
                        </p>
                      )}
                      <ExecutionInfo execution={fb.execution} source={fb.executionSource} />
                      
                      {!estimate && fb.strengths?.length > 0 && (
                        <div className="mb-2">
                          <h5 className="text-xs font-semibold text-success-700 mb-1">Strengths</h5>
                          <ul className="text-xs text-success-600 space-y-0.5">
                            {fb.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {!estimate && fb.improvements?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-sun-700 mb-1">Improvements</h5>
                          <ul className="text-xs text-sun-600 space-y-0.5">
                            {fb.improvements.map((i, idx) => (
                              <li key={idx}>• {i}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {!response.skipped && (
                        <DeliveryCard metrics={response.deliveryMetrics} fillerBreakdown={response.fillerBreakdown} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {interview.responses.length > 0 && (
            <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 mb-8">
              <h2 className="text-xl font-bold text-ink mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-primary-600" />
                Interview Summary
              </h2>
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
                  <div className="text-xl font-bold text-primary-600">
                    {interview.responses.filter(r => r.code).length}
                  </div>
                  <div className="text-xs text-primary-700">Coding</div>
                </div>
                <div className="text-center p-3 bg-sun-50 rounded-xl">
                  <div className="text-xl font-bold text-sun-600">
                    {interview.responses.filter(r => r.skipped).length}
                  </div>
                  <div className="text-xs text-sun-700">Skipped</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button
              onClick={resetInterview}
              className="bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97]"
            >
              <RefreshCw className="w-4 h-4" />
              Start New Interview
            </button>
            <button
              onClick={() => window.print()}
              className="bg-ink-2 hover:from-ink-2 hover:to-ink-deep text-white font-semibold py-3 px-6 rounded-full transition-all flex items-center gap-2 shadow-pill active:scale-[0.97]"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  ), [feedback, interview, timer, resetInterview]);

  // Loading state
  if (user === null && !error) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">Loading Interview System</h2>
          <p className="text-ink-2 text-sm">Preparing your personalized mock interview...</p>
        </div>
      </div>
    );
  }

  // Render based on current step
  return (
    <div className="min-h-screen">
      {currentStep === 'setup' && SetupPhase}
      {currentStep === 'interview' && InterviewPhase}
      {currentStep === 'feedback' && FeedbackPhase}
      
      {debugMode && (
        <div className="fixed bottom-4 right-4 bg-ink-deep rounded-2xl shadow-2xl p-4 max-w-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-success-500">Debug Console</h3>
            <button 
              onClick={() => setDebugLogs([])}
              className="text-xs bg-danger-600 hover:bg-danger-700 text-white px-2 py-1 rounded"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-1">
            {debugLogs.slice(-10).map((log, index) => (
              <div key={index} className={
                log.type === 'error' ? 'text-danger-500' : 
                log.type === 'warn' ? 'text-sun-400' : 
                'text-success-500'
              }>
                <span className="text-ink-muted">[{log.timestamp}]</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MockInterviewSystem;