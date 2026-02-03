import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Mic, MicOff, Play, Pause, ChevronRight, Clock, User, FileText, Brain, 
  AlertCircle, Volume2, Code, Terminal, CheckCircle, SkipForward, RefreshCw, 
  Trophy, Download, Type, Headphones, Upload, FileCheck, Target, TrendingUp,
  Zap, MessageCircle } from 'lucide-react';
import NavBar from "../components/NavBar";

// Custom hooks
import { useInterview } from '../hooks/useInterview';
import { useAudioRecording } from '../hooks/useAudioRecording';
import { useCodeEditor } from '../hooks/useCodeEditor';
import { useCV } from '../hooks/useCV';

// Utilities
import { 
  isValidAnswer, 
  isCodingQuestionType, 
  isSetupValid, 
  processFeedback,
  createFallbackFeedback,
  formatTime,
  SUPPORTED_LANGUAGES
} from '../utils/interviewUtils';

const MockInterviewSystem = () => {
  // Core state
  const [currentStep, setCurrentStep] = useState('setup');
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [feedback, setFeedback] = useState(null);
  
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

  // Cleanup
  useEffect(() => {
    return () => {
      audio.cleanup();
    };
  }, [audio]);

  // Question type helper
  const isCodingQuestion = useMemo(() => {
    return isCodingQuestionType(interview.currentQuestion?.type);
  }, [interview.currentQuestion?.type]);

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
      setCurrentStep('interview');
      
    } catch (err) {
      setError(`Failed to create interview: ${err.message}`);
      addDebugLog(`Interview creation failed: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [user, interviewData, cv.cvMode, cv.profileCV, interview, codeEditor, addDebugLog]);

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
      const submitData = {
        questionId: interview.currentQuestion.questionId,
        responseTime: Math.max(Math.floor(timer / (interview.responses.length + 1)), 30),
        answerMode: isCodingQuestion ? 'code' : answerMode,
        responseText,
        code: isCodingQuestion ? codeEditor.code : null,
        language: isCodingQuestion ? codeEditor.language : null,
        questionType: interview.currentQuestion.type,
        difficulty: interview.currentQuestion.difficulty || 'intermediate'
      };

      const aiFeedback = await interview.submitAnswer(interview.interview.id, submitData);
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
        score: processedFeedback.score || 50
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
  }, [isCodingQuestion, codeEditor, answerMode, audio, textAnswer, interview, timer, addDebugLog]);

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
  }, [interview, addDebugLog]);

  // Reset interview
  const resetInterview = useCallback(() => {
    setCurrentStep('setup');
    setInterviewData(prev => ({ ...prev, jobDescription: '' }));
    setTextAnswer('');
    setAnswerMode('audio');
    setShowCodeEditor(false);
    setFeedback(null);
    setTimer(0);
    
    interview.reset();
    codeEditor.setCode('');
    codeEditor.setCodeOutput('');
    codeEditor.setCodeInput('');
    
    if (cv.profileCV) {
      cv.changeCvMode('profile', setInterviewData);
    } else {
      cv.changeCvMode('upload', setInterviewData);
    }
  }, [interview, codeEditor, cv]);

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
      <label className="block text-sm font-medium text-gray-700 mb-2">Resume/CV *</label>
      
      <div className="flex gap-2 mb-3 flex-wrap">
        <button
          onClick={() => cv.changeCvMode('profile', setInterviewData)}
          disabled={!cv.profileCV}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            cv.cvMode === 'profile' 
              ? 'bg-blue-100 border-blue-500 text-blue-700' 
              : cv.profileCV
                ? 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
                : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          <User className="w-4 h-4" />
          Profile CV
          {cv.profileCV && <CheckCircle className="w-4 h-4 text-green-500" />}
        </button>
        
        <button
          onClick={() => cv.changeCvMode('upload', setInterviewData)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            cv.cvMode === 'upload' 
              ? 'bg-purple-100 border-purple-500 text-purple-700' 
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>

        <button
          onClick={() => cv.changeCvMode('manual', setInterviewData)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
            cv.cvMode === 'manual' 
              ? 'bg-green-100 border-green-500 text-green-700' 
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Type className="w-4 h-4" />
          Type Manually
        </button>
      </div>

      {cv.cvMode === 'profile' && cv.profileCV && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-blue-600" />
              <h4 className="text-sm font-medium text-blue-900">Profile CV Loaded</h4>
            </div>
            <span className="text-xs text-blue-600">{cv.profileCV.age || 'Current'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="font-medium text-blue-700">File:</span>
              <span className="ml-1 text-blue-600">{cv.profileCV.fileName}</span>
            </div>
            <div>
              <span className="font-medium text-blue-700">Size:</span>
              <span className="ml-1 text-blue-600">{cv.profileCV.fileSize ? `${Math.round(cv.profileCV.fileSize / 1024)}KB` : 'N/A'}</span>
            </div>
            <div>
              <span className="font-medium text-blue-700">Length:</span>
              <span className="ml-1 text-blue-600">{cv.profileCV.text.length} chars</span>
            </div>
          </div>
        </div>
      )}

      {cv.cvMode === 'upload' && (
        <div className="space-y-3">
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
            <input
              ref={cv.fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx,.doc"
              onChange={handleFileUpload}
              className="hidden"
              disabled={cv.cvLoading}
            />
            <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
            <div className="text-sm text-gray-600 mb-1">
              <button
                onClick={() => cv.fileInputRef.current?.click()}
                disabled={cv.cvLoading}
                className="text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
              >
                {cv.cvLoading ? 'Processing...' : 'Click to upload'}
              </button>
            </div>
            <div className="text-xs text-gray-500">PDF, TXT, DOC, or DOCX (Max 5MB)</div>
          </div>

          {cv.cvLoading && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                <span className="text-sm font-medium text-blue-800">Processing CV file...</span>
              </div>
            </div>
          )}

          {cv.uploadedFile && !cv.cvLoading && interviewData.resumeText && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <FileCheck className="w-4 h-4 text-green-600" />
                <span className="text-sm font-medium text-green-800">
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
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32 resize-none text-sm"
            placeholder="Enter your professional experience, skills, education, and qualifications..."
          />
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>Characters: {interviewData.resumeText.length}</span>
            <span>Words: {interviewData.resumeText.split(' ').filter(word => word.length > 0).length}</span>
          </div>
        </div>
      )}

      {cv.cvError && (
        <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span className="text-red-700 text-xs">{cv.cvError}</span>
        </div>
      )}
    </div>
  ), [cv, interviewData.resumeText, handleFileUpload, handleManualCvChange]);

  // Setup Phase Component
  const SetupPhase = useMemo(() => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <NavBar />
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mb-4">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">AI Mock Interview System</h1>
            <p className="text-lg text-gray-600">
              Welcome {user?.name || 'User'}! Prepare for your software engineering internship
            </p>
          </div>

          <div className="bg-white rounded-xl shadow-lg p-6 space-y-4">
            {user && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-4 border border-blue-100">
                <h3 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <User className="w-4 h-4 text-blue-600" />
                  Interview Candidate
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <label className="block text-xs font-medium text-blue-700 mb-1">Name</label>
                    <p className="text-gray-900 font-medium text-sm">{user.name}</p>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-blue-100">
                    <label className="block text-xs font-medium text-blue-700 mb-1">Email</label>
                    <p className="text-gray-900 font-medium text-sm">{user.email}</p>
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-500" />
                Job Description *
              </label>
              <textarea
                value={interviewData.jobDescription}
                onChange={handleJobDescriptionChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24 resize-none text-sm"
                placeholder="Paste the software engineering internship job description here..."
              />
            </div>

            {CVSection}

            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Audio Setup
              </h4>
              <p className="text-xs text-blue-700 mb-3">Test your microphone before starting:</p>
              <button
                onClick={audio.initializeAudio}
                disabled={audio.audioPermission}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  audio.audioPermission 
                    ? 'bg-green-100 text-green-800 border border-green-300' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
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
                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-xs text-red-600 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3" />
                    {audio.audioError}
                  </p>
                </div>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            )}

            <button
              onClick={handleCreateInterview}
              disabled={loading || !isSetupValid(interviewData.jobDescription, interviewData.resumeText) || !user}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-3 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none disabled:shadow-none"
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
        </div>
      </div>
    </div>
  ), [user, interviewData, audio, error, loading, CVSection, handleJobDescriptionChange, handleCreateInterview]);

  // Interview Phase Component
  const InterviewPhase = useMemo(() => (
    <div className="min-h-screen bg-gray-50">
      <NavBar />
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">Mock Interview</h1>
                <p className="text-xs text-gray-600">Question {interview.questionIndex + 1} of {interview.questions.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-gray-600">
                <Clock className="w-4 h-4" />
                <span className="font-mono text-sm">{formatTime(timer)}</span>
              </div>
              <div className="w-24">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${((interview.questionIndex + 1) / interview.questions.length) * 100}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className={`grid gap-6 ${showCodeEditor && isCodingQuestion ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 max-w-4xl mx-auto'}`}>
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-start gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                isCodingQuestion ? 'bg-gradient-to-r from-purple-500 to-pink-500' :
                interview.currentQuestion?.type === 'technical' ? 'bg-gradient-to-r from-indigo-500 to-blue-500' :
                'bg-gradient-to-r from-green-500 to-teal-500'
              }`}>
                {isCodingQuestion ? <Code className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    isCodingQuestion ? 'bg-purple-100 text-purple-800' :
                    interview.currentQuestion?.type === 'technical' ? 'bg-indigo-100 text-indigo-800' :
                    'bg-green-100 text-green-800'
                  }`}>
                    {interview.currentQuestion?.type?.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-gray-900 leading-relaxed">
                  {interview.currentQuestion?.question}
                </h2>
              </div>
            </div>

            {!isCodingQuestion && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">Response Method:</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setAnswerMode('audio')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                      answerMode === 'audio' 
                        ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-lg' 
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Headphones className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Audio</div>
                      <div className="text-xs text-gray-500">Speak answer</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setAnswerMode('text')}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all duration-200 ${
                      answerMode === 'text' 
                        ? 'bg-green-50 border-green-500 text-green-700 shadow-lg' 
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <Type className="w-4 h-4 text-green-600" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium">Text</div>
                      <div className="text-xs text-gray-500">Type answer</div>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {!isCodingQuestion && answerMode === 'audio' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                  <div className="flex items-center justify-center gap-4 py-6">
                    <button
                      onClick={audio.isRecording ? audio.stopRecording : audio.startRecording}
                      disabled={loading}
                      className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                        audio.isRecording 
                          ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                    >
                      {audio.isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                    </button>
                    
                    {audio.audioBlob && (
                      <button
                        onClick={audio.playRecording}
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all shadow-lg ${
                          audio.isPlaying ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-500 hover:bg-gray-600'
                        } text-white`}
                      >
                        {audio.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                      </button>
                    )}
                  </div>

                  <div className="text-center space-y-2">
                    <p className="text-gray-700 text-sm font-medium">
                      {audio.isRecording ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                          Recording... {audio.recordingTime}s
                        </span>
                      ) : (
                        'Click microphone to record'
                      )}
                    </p>
                    
                    {audio.audioBlob && (
                      <div className="bg-green-100 border border-green-200 rounded-lg p-2">
                        <p className="text-green-800 text-sm font-medium flex items-center justify-center gap-2">
                          <CheckCircle className="w-4 h-4" />
                          Recorded ({Math.round(audio.audioBlob.size / 1024)}KB)
                        </p>
                      </div>
                    )}
                    
                    {audio.isTranscribing && (
                      <div className="bg-blue-100 border border-blue-200 rounded-lg p-2">
                        <p className="text-blue-800 text-sm flex items-center justify-center gap-2">
                          <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
                          Transcribing...
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {audio.transcription && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                      <Volume2 className="w-4 h-4" />
                      Transcription
                    </h4>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <p className="text-gray-700 text-sm leading-relaxed">{audio.transcription}</p>
                    </div>
                  </div>
                )}

                {audio.transcriptionError && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <h4 className="text-sm font-semibold text-yellow-800 mb-2">Manual Transcription</h4>
                    <p className="text-yellow-700 mb-2 text-xs">Type what you said:</p>
                    <textarea
                      value={audio.transcription}
                      onChange={(e) => audio.setTranscription(e.target.value)}
                      className="w-full h-24 px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 resize-none text-sm"
                      placeholder="Type your audio response here..."
                    />
                  </div>
                )}
              </div>
            )}

            {!isCodingQuestion && answerMode === 'text' && (
              <div className="space-y-3">
                <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                  <label className="block text-sm font-medium text-green-800 mb-2">Your Written Response:</label>
                  <textarea
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                    className="w-full h-32 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 resize-none text-sm"
                    placeholder="Type your comprehensive answer here..."
                  />
                  <div className="mt-2 flex justify-between text-xs text-green-600">
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
                className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-all flex items-center gap-2 text-sm"
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
                  className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-semibold py-2 px-6 rounded-lg transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none text-sm"
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
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mt-4">
                <AlertCircle className="w-4 h-4 text-red-500" />
                <span className="text-red-700 text-sm">{error}</span>
              </div>
            )}
          </div>

          {showCodeEditor && isCodingQuestion && (
            <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Code className="w-5 h-5 text-purple-600" />
                  Code Editor
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-normal">
                    JDoodle Powered
                  </span>
                </h3>
                <div className="flex items-center gap-3">
                  <select
                    value={codeEditor.language}
                    onChange={(e) => codeEditor.changeLanguage(e.target.value, interview.currentQuestion)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
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
                    className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Your Code:</label>
                  <textarea
                    value={codeEditor.code}
                    onChange={(e) => codeEditor.setCode(e.target.value)}
                    className="w-full h-64 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm bg-white focus:border-purple-500 focus:outline-none resize-none"
                    placeholder={`Write your ${SUPPORTED_LANGUAGES.find(l => l.value === codeEditor.language)?.label || codeEditor.language} code here...`}
                    style={{ fontFamily: 'monospace' }}
                    spellCheck="false"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Program Input (if needed):
                    <span className="text-xs text-gray-500 ml-2">Leave empty if not required</span>
                  </label>
                  <textarea
                    value={codeEditor.codeInput}
                    onChange={(e) => codeEditor.setCodeInput(e.target.value)}
                    className="w-full h-16 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:border-purple-500 focus:outline-none resize-none"
                    placeholder="Enter input values (one per line)..."
                    style={{ fontFamily: 'monospace' }}
                  />
                </div>

                {codeEditor.codeOutput && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                      <Terminal className="w-4 h-4" />
                      Execution Results:
                    </label>
                    <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto border-2 border-gray-700">
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
    </div>
  ), [interview, timer, isCodingQuestion, answerMode, audio, textAnswer, codeEditor, showCodeEditor, loading, error, handleSubmitAnswer, handleSkipQuestion]);

  // Feedback Phase Component
  const FeedbackPhase = useMemo(() => (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50">
      <NavBar />
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mb-4 shadow-lg">
              <Trophy className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">Interview Complete!</h1>
            <p className="text-lg text-gray-600">Here's your comprehensive performance analysis</p>
          </div>

          {feedback && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
              <div className="text-center mb-6">
                <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full text-3xl font-bold text-white mb-4 ${
                  feedback.score >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                  feedback.score >= 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                  'bg-gradient-to-r from-red-500 to-pink-500'
                }`}>
                  {feedback.score}%
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Overall Score</h2>
                <p className="text-gray-600">
                  {feedback.score >= 80 ? 'Excellent Performance!' :
                   feedback.score >= 60 ? 'Good Performance!' :
                   'Room for Improvement'}
                </p>
              </div>

              {feedback.feedback?.recommendations && feedback.feedback.recommendations.length > 0 && (
                <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                  <h4 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
                    <Target className="w-5 h-5" />
                    Recommendations for Improvement
                  </h4>
                  <div className="space-y-2">
                    {feedback.feedback.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-white rounded-lg border border-indigo-100">
                        <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-600 font-bold text-xs">{index + 1}</span>
                        </div>
                        <p className="text-gray-700 leading-relaxed text-sm">{rec}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {Object.keys(interview.questionFeedbacks).length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-purple-600" />
                Detailed Question Analysis
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {interview.responses.map((response, index) => {
                  const fb = interview.questionFeedbacks[response.questionId];
                  if (!fb) return null;
                  
                  return (
                    <div key={index} className="border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                            fb.score >= 80 ? 'bg-green-500' :
                            fb.score >= 60 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}>
                            {index + 1}
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900 text-sm">Question {index + 1}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              isCodingQuestionType(interview.questions[index]?.type) ? 'bg-purple-100 text-purple-700' :
                              interview.questions[index]?.type === 'behavioral' ? 'bg-green-100 text-green-700' :
                              'bg-blue-100 text-blue-700'
                            }`}>
                              {interview.questions[index]?.type}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-lg font-bold ${
                            fb.score >= 80 ? 'text-green-600' :
                            fb.score >= 60 ? 'text-yellow-600' :
                            'text-red-600'
                          }`}>
                            {response.skipped ? 'SKIP' : `${fb.score}%`}
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-gray-600 text-xs mb-3">{interview.questions[index]?.question}</p>
                      
                      {fb.strengths?.length > 0 && (
                        <div className="mb-2">
                          <h5 className="text-xs font-semibold text-green-700 mb-1">Strengths</h5>
                          <ul className="text-xs text-green-600 space-y-0.5">
                            {fb.strengths.map((s, i) => (
                              <li key={i}>• {s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {fb.improvements?.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-orange-700 mb-1">Improvements</h5>
                          <ul className="text-xs text-orange-600 space-y-0.5">
                            {fb.improvements.map((i, idx) => (
                              <li key={idx}>• {i}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {interview.responses.length > 0 && (
            <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-600" />
                Interview Summary
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-xl font-bold text-blue-600">{interview.responses.length}</div>
                  <div className="text-xs text-blue-700">Questions</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-xl font-bold text-green-600">{formatTime(timer)}</div>
                  <div className="text-xs text-green-700">Total Time</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-xl font-bold text-purple-600">
                    {interview.responses.filter(r => r.code).length}
                  </div>
                  <div className="text-xs text-purple-700">Coding</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-xl font-bold text-orange-600">
                    {interview.responses.filter(r => r.skipped).length}
                  </div>
                  <div className="text-xs text-orange-700">Skipped</div>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-center gap-4">
            <button
              onClick={resetInterview}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <RefreshCw className="w-4 h-4" />
              Start New Interview
            </button>
            <button
              onClick={() => window.print()}
              className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-3 px-6 rounded-xl transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
          </div>
        </div>
      </div>
    </div>
  ), [feedback, interview, timer, resetInterview]);

  // Loading state
  if (user === null && !error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Loading Interview System</h2>
          <p className="text-gray-600 text-sm">Preparing your personalized mock interview...</p>
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
        <div className="fixed bottom-4 right-4 bg-gray-900 rounded-xl shadow-2xl p-4 max-w-md">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-semibold text-green-400">Debug Console</h3>
            <button 
              onClick={() => setDebugLogs([])}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded"
            >
              Clear
            </button>
          </div>
          <div className="max-h-48 overflow-y-auto text-xs font-mono space-y-1">
            {debugLogs.slice(-10).map((log, index) => (
              <div key={index} className={
                log.type === 'error' ? 'text-red-400' : 
                log.type === 'warn' ? 'text-yellow-400' : 
                'text-green-400'
              }>
                <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MockInterviewSystem;