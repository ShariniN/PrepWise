import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Mic, MicOff, Play, Pause, ChevronRight, Clock, User, FileText, BarChart3, CheckCircle, AlertCircle, Volume2, Code, Terminal, Send, Type, Headphones, Upload, Download, FileCheck, RefreshCw, Zap, Target, Trophy, Star, TrendingUp, Brain, MessageCircle, SkipForward } from 'lucide-react';
import NavBar from "../components/NavBar";

const MockInterviewSystem = () => {
  const [currentStep, setCurrentStep] = useState('setup'); 
  const [interviewData, setInterviewData] = useState({
    jobDescription: '',
    resumeText: ''
  });
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timer, setTimer] = useState(0);
  const [responses, setResponses] = useState([]);
  const [feedback, setFeedback] = useState(null);
  const [user, setUser] = useState(null);
  
  const [audioStream, setAudioStream] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioPermission, setAudioPermission] = useState(false);
  const [audioError, setAudioError] = useState('');
  
  const [answerMode, setAnswerMode] = useState('audio');
  const [textAnswer, setTextAnswer] = useState('');
  const [transcription, setTranscription] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  
  const [code, setCode] = useState('');
  const [language, setLanguage] = useState('javascript');
  const [codeOutput, setCodeOutput] = useState('');
  const [showCodeEditor, setShowCodeEditor] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeInput, setCodeInput] = useState(''); // For user input during code execution

  const [cvMode, setCvMode] = useState('profile');
  const [profileCV, setProfileCV] = useState(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);

  const [debugMode, setDebugMode] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [questionFeedbacks, setQuestionFeedbacks] = useState({});

  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const timerRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  // UPDATED: JDoodle supported languages with their correct language codes
  const supportedLanguages = [
    { 
      value: 'nodejs', 
      label: 'JavaScript (Node.js)', 
      template: 'console.log("Hello World");\n\n// Your code here\nfunction solution() {\n    // Implement your solution\n    return "result";\n}\n\nconsole.log(solution());',
      jdoodleLanguage: 'nodejs',
      version: '4'
    },
    { 
      value: 'python3', 
      label: 'Python 3', 
      template: 'print("Hello World")\n\n# Your code here\ndef solution():\n    # Implement your solution\n    return "result"\n\nprint(solution())',
      jdoodleLanguage: 'python3',
      version: '4'
    },
    { 
      value: 'java', 
      label: 'Java', 
      template: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n        \n        // Your code here\n        System.out.println(solution());\n    }\n    \n    public static String solution() {\n        // Implement your solution\n        return "result";\n    }\n}',
      jdoodleLanguage: 'java',
      version: '4'
    },
    { 
      value: 'c', 
      label: 'C', 
      template: '#include <stdio.h>\n#include <stdlib.h>\n#include <string.h>\n\nint main() {\n    printf("Hello World\\n");\n    \n    // Your code here\n    printf("%s\\n", solution());\n    \n    return 0;\n}\n\nchar* solution() {\n    // Implement your solution\n    return "result";\n}',
      jdoodleLanguage: 'c',
      version: '5'
    },
    { 
      value: 'cpp', 
      label: 'C++', 
      template: '#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\nusing namespace std;\n\nstring solution() {\n    // Implement your solution\n    return "result";\n}\n\nint main() {\n    cout << "Hello World" << endl;\n    \n    // Your code here\n    cout << solution() << endl;\n    \n    return 0;\n}',
      jdoodleLanguage: 'cpp',
      version: '5'
    },
    { 
      value: 'csharp', 
      label: 'C#', 
      template: 'using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello World");\n        \n        // Your code here\n        Console.WriteLine(Solution());\n    }\n    \n    static string Solution() {\n        // Implement your solution\n        return "result";\n    }\n}',
      jdoodleLanguage: 'csharp',
      version: '4'
    },
    { 
      value: 'php', 
      label: 'PHP', 
      template: '<?php\necho "Hello World\\n";\n\n// Your code here\nfunction solution() {\n    // Implement your solution\n    return "result";\n}\n\necho solution() . "\\n";\n?>',
      jdoodleLanguage: 'php',
      version: '4'
    },
    { 
      value: 'go', 
      label: 'Go', 
      template: 'package main\n\nimport "fmt"\n\nfunc solution() string {\n    // Implement your solution\n    return "result"\n}\n\nfunc main() {\n    fmt.Println("Hello World")\n    \n    // Your code here\n    fmt.Println(solution())\n}',
      jdoodleLanguage: 'go',
      version: '4'
    }
  ];

  const addDebugLog = useCallback((message, type = 'info') => {
    const log = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setDebugLogs(prev => [...prev.slice(-50), log]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  }, []);

  const isValidAnswer = useCallback((responseText, questionType, codeText = null) => {
    if (questionType === 'coding' || questionType === 'technical_coding' || questionType === 'problem-solving') {
      if (!codeText || codeText.trim().length === 0) return false;
      
      const normalizedCode = codeText.replace(/\s+/g, ' ').trim();
      const starterTemplate = currentQuestion?.starterCode?.[language] || 
                             supportedLanguages.find(l => l.value === language)?.template || '';
      const normalizedTemplate = starterTemplate.replace(/\s+/g, ' ').trim();
      
      if (normalizedCode === normalizedTemplate) return false;
      
      const codeWithoutComments = codeText.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/#.*$/gm, '').trim();
      if (codeWithoutComments.length < 20) return false;
      
      const meaningfulCodePattern = /[{};()=+\-*/><%]/;
      if (!meaningfulCodePattern.test(codeWithoutComments)) return false;
      
      return true;
    } else {
      if (!responseText || responseText.trim().length === 0) return false;
      
      responseText = responseText.trim().toLowerCase();
      
      if (responseText.length < 20) return false;
      
      const words = responseText.split(/\s+/).filter(word => word.length > 0);
      if (words.length < 5) return false;
      
      const meaninglessResponses = [
        'i don\'t know', 'no idea', 'not sure', 'pass', 'skip',
        'i have no idea', 'don\'t know', 'no clue', 'nothing'
      ];
      
      if (meaninglessResponses.includes(responseText)) return false;
      
      const repeatedWordThreshold = 0.5;
      const wordCounts = {};
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
      
      const mostCommonCount = Math.max(...Object.values(wordCounts));
      if (mostCommonCount / words.length > repeatedWordThreshold) return false;
      
      return true;
    }
  }, [currentQuestion, language, supportedLanguages]);

  const handleJobDescriptionChange = useCallback((e) => {
    setInterviewData(prev => ({ ...prev, jobDescription: e.target.value }));
  }, []);

  const handleTextAnswerChange = useCallback((e) => {
    setTextAnswer(e.target.value);
  }, []);

  const handleCodeChange = useCallback((e) => {
    const newValue = e.target.value;
    setCode(newValue);
  }, []);

  const handleCodeInputChange = useCallback((e) => {
    setCodeInput(e.target.value);
  }, []);

  useEffect(() => {
    if (debugMode && code) {
      const timeoutId = setTimeout(() => {
        addDebugLog(`Code updated: "${code.substring(0, 50)}..."`);
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [code, debugMode, addDebugLog]);

  const handleTranscriptionChange = useCallback((e) => {
    setTranscription(e.target.value);
  }, []);

  const handleLanguageChange = useCallback((e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);
    
    const currentTemplate = supportedLanguages.find(l => l.value === language)?.template || '';
    const normalizedCode = code.replace(/\s+/g, '').toLowerCase();
    const normalizedTemplate = currentTemplate.replace(/\s+/g, '').toLowerCase();
    
    if (!code.trim() || normalizedCode === normalizedTemplate) {
      const langTemplate = supportedLanguages.find(l => l.value === newLanguage)?.template || '';
      setCode(currentQuestion?.starterCode?.[newLanguage] || langTemplate);
    }
    
    setCodeOutput('');
    setCodeInput(''); // Clear input when changing language
  }, [currentQuestion, supportedLanguages, code, language]);

  // NEW: JDoodle API integration for code execution
  const executeCodeWithJDoodle = useCallback(async () => {
    if (!code.trim()) {
      setCodeOutput('Please write some code before running.');
      return;
    }

    try {
      setIsRunningCode(true);
      setCodeOutput('Executing code on JDoodle servers...\n');
      addDebugLog(`Executing ${language} code on JDoodle...`);

      const selectedLang = supportedLanguages.find(l => l.value === language);
      if (!selectedLang) {
        throw new Error('Unsupported language selected');
      }

      // Prepare the request payload for JDoodle API
      const requestData = {
        script: code,
        language: selectedLang.jdoodleLanguage,
        versionIndex: selectedLang.version,
        stdin: codeInput || '', // User input for the program
      };

      addDebugLog(`JDoodle request: ${JSON.stringify({
        language: requestData.language,
        versionIndex: requestData.versionIndex,
        hasStdin: !!requestData.stdin,
        scriptLength: requestData.script.length
      })}`);

      // Send request to backend which will handle JDoodle API
      const response = await fetch('/api/code/execute', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include',
        body: JSON.stringify(requestData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      addDebugLog(`JDoodle response: ${JSON.stringify({
        success: result.success,
        hasOutput: !!result.output,
        hasError: !!result.error,
        executionTime: result.executionTime,
        memory: result.memory
      })}`);

      if (!result.success) {
        throw new Error(result.error || 'Code execution failed');
      }

      // Format the output
      let output = '';
      
      // Add execution info
      if (result.executionTime || result.memory) {
        output += '=== Execution Info ===\n';
        if (result.executionTime) output += `Time: ${result.executionTime}\n`;
        if (result.memory) output += `Memory: ${result.memory}\n`;
        output += '\n=== Output ===\n';
      }

      // Add program output
      if (result.output) {
        output += result.output;
      } else {
        output += 'Program executed successfully (no output)';
      }

      // Add any errors
      if (result.error && result.error.trim()) {
        output += '\n\n=== Errors/Warnings ===\n';
        output += result.error;
      }

      setCodeOutput(output);
      addDebugLog(`Code execution completed successfully`);
      
    } catch (error) {
      const errorMsg = `Execution Error: ${error.message}\n\nPlease check your code and try again.`;
      setCodeOutput(errorMsg);
      addDebugLog(`Code execution error: ${error.message}`, 'error');
    } finally {
      setIsRunningCode(false);
    }
  }, [code, language, codeInput, supportedLanguages, addDebugLog]);

  const createFallbackFeedback = useCallback(() => {
    const validResponses = responses.filter(r => !r.skipped);
    const averageScore = validResponses.length > 0 
      ? Math.round(validResponses.reduce((sum, r) => sum + (r.score || 50), 0) / validResponses.length)
      : 50;

    return {
      score: averageScore,
      feedback: {
        technicalSkills: {
          score: Math.max(averageScore - 10, 0),
          feedback: 'Technical analysis completed. Review coding responses for improvement opportunities.'
        },
        communicationSkills: {
          score: Math.min(averageScore + 5, 100),
          feedback: 'Communication assessment completed. Consider practicing clear explanations.'
        },
        problemSolving: {
          score: averageScore,
          feedback: 'Problem-solving approach analyzed. Continue practicing systematic thinking.'
        },
        recommendations: [
          'Practice more coding problems similar to those encountered',
          'Work on explaining technical concepts clearly',
          'Focus on systematic problem-solving approaches',
          'Review computer science fundamentals'
        ]
      }
    };
  }, [responses]);

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    try {
      addDebugLog('Checking authentication...');
      
      const response = await fetch('/api/auth/is-auth', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      addDebugLog(`Response status: ${response.status}`);

      const contentType = response.headers.get('content-type');
      addDebugLog(`Content-Type: ${contentType}`);

      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await response.text();
        addDebugLog(`Non-JSON response: ${textResponse.substring(0, 500)}`, 'error');
        throw new Error('Server returned HTML instead of JSON. Check if the API endpoint exists and is working properly.');
      }

      const result = await response.json();
      addDebugLog(`Auth response: ${JSON.stringify(result)}`);
      
      if (result.success && result.user) {
        setUser(result.user);
        setError(''); 
        addDebugLog(`User authenticated: ${result.user.name}`);
        loadProfileCV();
      } else {
        setError(result.message || 'Please log in to access the mock interview system.');
        addDebugLog('Authentication failed - no user found', 'error');
      }
    } catch (err) {
      console.error('Authentication check failed:', err);
      addDebugLog(`Authentication failed: ${err.message}`, 'error');
      setError(`Authentication failed: ${err.message}`);
    }
  };

  const isCodingQuestion = useMemo(() => {
    return currentQuestion?.type === 'coding' || 
           currentQuestion?.type === 'technical_coding' || 
           currentQuestion?.type === 'problem-solving'; 
  }, [currentQuestion?.type]);

  const loadProfileCV = async () => {
    try {
      setCvLoading(true);
      setCvError('');
      addDebugLog('Loading profile CV...');
      
      const response = await fetch('/api/user/cv', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      const result = await response.json();
      addDebugLog(`CV response: ${JSON.stringify(result)}`);
      
      if (result.success && result.data) {
        if (result.data.hasText && result.data.textLength > 0) {
          await loadCVText(result.data);
        } else {
          addDebugLog('CV found but no text content, switching to upload mode');
          setCvMode('upload');
          setProfileCV(null);
        }
      } else {
        addDebugLog('No CV found in profile, switching to upload mode');
        setCvMode('upload');
        setProfileCV(null);
      }
      
    } catch (err) {
      console.error('Failed to load profile CV:', err);
      addDebugLog(`Failed to load profile CV: ${err.message}`, 'error');
      setCvError(err.message);
      setCvMode('upload');
    } finally {
      setCvLoading(false);
    }
  };

  const loadCVText = async (cvMetadata) => {
    try {
      addDebugLog('Loading CV text content...');
      
      const textResponse = await fetch('/api/user/cv/text', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      const contentType = textResponse.headers.get('content-type');
      
      if (textResponse.ok && contentType && contentType.includes('application/json')) {
        try {
          const textResult = await textResponse.json();
          if (textResult.success && textResult.text) {
            const cvData = {
              text: textResult.text,
              fileName: cvMetadata.fileName,
              fileSize: cvMetadata.fileSize,
              uploadedAt: cvMetadata.uploadedAt,
              age: cvMetadata.uploadedAt ? Math.floor((Date.now() - new Date(cvMetadata.uploadedAt)) / (1000 * 60 * 60 * 24)) + ' days' : null
            };
            setProfileCV(cvData);
            setInterviewData(prev => ({ ...prev, resumeText: cvData.text }));
            setCvMode('profile');
            addDebugLog(`Profile CV loaded: ${cvData.text.length} characters`);
            return;
          }
        } catch (jsonError) {
          addDebugLog(`JSON parse error: ${jsonError.message}`, 'error');
        }
      } else {
        addDebugLog(`CV text endpoint not available (status: ${textResponse.status})`, 'warn');
      }

      const cvData = {
        text: `RESUME/CV
        
Name: ${cvMetadata.fileName ? cvMetadata.fileName.replace(/\.(pdf|docx?|txt)$/i, '').replace(/[_-]/g, ' ') : 'Candidate'}
Document: ${cvMetadata.fileName}
File Size: ${cvMetadata.fileSize ? Math.round(cvMetadata.fileSize / 1024) + 'KB' : 'N/A'}
Upload Date: ${cvMetadata.uploadedAt ? new Date(cvMetadata.uploadedAt).toLocaleDateString() : 'N/A'}

[Your CV content would be extracted here from the uploaded ${cvMetadata.fileName}]

This CV contains your professional experience, skills, education, and qualifications that will be used to customize the interview questions and provide relevant feedback.

Note: The actual CV text extraction would require server-side processing of the uploaded PDF/DOCX file.`,
        fileName: cvMetadata.fileName,
        fileSize: cvMetadata.fileSize,
        uploadedAt: cvMetadata.uploadedAt,
        age: cvMetadata.uploadedAt ? Math.floor((Date.now() - new Date(cvMetadata.uploadedAt)) / (1000 * 60 * 60 * 24)) + ' days' : null
      };
      
      setProfileCV(cvData);
      setInterviewData(prev => ({ ...prev, resumeText: cvData.text }));
      setCvMode('profile');
      addDebugLog(`Profile CV loaded (placeholder): ${cvData.fileName}`);
      
    } catch (err) {
      addDebugLog(`Failed to load CV text: ${err.message}`, 'error');
      setCvError('Could not load CV text content. Please try uploading a new file.');
      setCvMode('upload');
    }
  };

  const handleCvModeChange = useCallback((mode) => {
  setCvMode(mode);
  setCvError('');
  
  if (mode === 'profile' && profileCV) {
    setInterviewData(prev => ({ ...prev, resumeText: profileCV.text }));
    setUploadedFile(null);
  } else if (mode === 'upload') {
    if (!uploadedFile) {
      setInterviewData(prev => ({ ...prev, resumeText: '' }));
    }
  } else if (mode === 'manual') {
    setInterviewData(prev => ({ ...prev, resumeText: '' }));
    setUploadedFile(null);
  }
}, [profileCV, uploadedFile]);

  const handleFileUpload = useCallback(async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const validTypes = [
    'application/pdf', 
    'text/plain', 
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];
  
  if (!validTypes.includes(file.type)) {
    setCvError('Please upload a PDF, TXT, DOC, or DOCX file');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    setCvError('File size must be less than 5MB');
    return;
  }

  setUploadedFile(file);
  setCvLoading(true);
  setCvError('');
  addDebugLog(`Processing file: ${file.name} (${file.size} bytes)`);

  try {
    const formData = new FormData();
    formData.append('cv', file);

    const response = await fetch('/api/interviews/process-cv', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: formData
    });

    const result = await response.json();
    addDebugLog(`CV processing response: ${JSON.stringify(result)}`);

    if (!result.success) {
      throw new Error(result.error || 'Failed to process CV file');
    }

    if (!result.data || !result.data.text) {
      throw new Error('No text content extracted from CV');
    }

    setInterviewData(prev => ({ 
      ...prev, 
      resumeText: result.data.text 
    }));

    addDebugLog(`CV processed successfully: ${result.data.characterCount} characters, ${result.data.wordCount} words`);
    
    setCvError('');
    
  } catch (err) {
    console.error('CV processing error:', err);
    addDebugLog(`CV processing failed: ${err.message}`, 'error');
    setCvError(`Failed to process CV: ${err.message}`);
    setUploadedFile(null);
    setInterviewData(prev => ({ ...prev, resumeText: '' }));
  } finally {
    setCvLoading(false);
  }
}, [addDebugLog]);

  const initializeAudio = async () => {
    try {
      addDebugLog('Initializing audio...');
      
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media recording not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      addDebugLog('Audio stream acquired successfully');
      setAudioStream(stream);
      audioStreamRef.current = stream;
      setAudioPermission(true);
      setAudioError('');

      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      addDebugLog('Audio context created successfully');
      return stream;
    } catch (err) {
      addDebugLog(`Audio initialization failed: ${err.message}`, 'error');
      setAudioError(`Microphone access failed: ${err.message}`);
      setAudioPermission(false);
      throw new Error(`Microphone access failed: ${err.message}`);
    }
  };

  const startRecording = async () => {
    try {
      addDebugLog('Starting recording...');
      setAudioError('');
      setTranscriptionError('');
      let stream = audioStream;
      
      if (!stream) {
        stream = await initializeAudio();
      }

      setAudioBlob(null);
      audioChunksRef.current = [];
      setRecordingTime(0);
      setTranscription('');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          addDebugLog(`Audio chunk received: ${event.data.size} bytes`);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        addDebugLog(`Recording stopped, blob size: ${blob.size} bytes`);
        transcribeAudio(blob);
      };

      mediaRecorder.onerror = (event) => {
        addDebugLog(`MediaRecorder error: ${event.error.message}`, 'error');
        setAudioError(`Recording error: ${event.error.message}`);
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      addDebugLog('Recording started successfully');

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => {
          const newTime = prev + 1;
          if (newTime % 5 === 0) {
            addDebugLog(`Recording time: ${newTime}s`);
          }
          return newTime;
        });
      }, 1000);

    } catch (err) {
      addDebugLog(`Start recording failed: ${err.message}`, 'error');
      setAudioError(err.message);
    }
  };

  const stopRecording = () => {
    try {
      addDebugLog('Stopping recording...');
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
        addDebugLog('Recording stopped successfully');
      }
    } catch (err) {
      addDebugLog(`Stop recording failed: ${err.message}`, 'error');
      setAudioError('Failed to stop recording');
    }
  };

  const transcribeAudio = async (audioBlob) => {
    try {
      setIsTranscribing(true);
      setTranscriptionError('');
      addDebugLog('Starting transcription...');
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch('/api/interviews/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: formData
      });

      const result = await response.json();
      addDebugLog(`Transcription response: ${JSON.stringify(result)}`);

      if (result.success && result.text) {
        setTranscription(result.text);
        addDebugLog(`Transcription successful: ${result.text.substring(0, 100)}...`);
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
      
    } catch (err) {
      addDebugLog(`Transcription failed: ${err.message}`, 'error');
      setTranscriptionError(`Transcription failed: ${err.message}. Please use text input instead.`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const playRecording = async () => {
    if (!audioBlob) return;

    try {
      addDebugLog('Playing recording...');
      
      if (isPlaying) {
        audioPlaybackRef.current.pause();
        setIsPlaying(false);
        addDebugLog('Playback paused');
        return;
      }

      const url = URL.createObjectURL(audioBlob);
      audioPlaybackRef.current.src = url;
      
      audioPlaybackRef.current.onplay = () => {
        setIsPlaying(true);
        addDebugLog('Playback started');
      };
      audioPlaybackRef.current.onpause = () => {
        setIsPlaying(false);
        addDebugLog('Playback paused');
      };
      audioPlaybackRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
        addDebugLog('Playback ended');
      };
      
      await audioPlaybackRef.current.play();
    } catch (err) {
      addDebugLog(`Playback failed: ${err.message}`, 'error');
      setAudioError('Failed to play recording');
    }
  };

  const isSetupValid = useCallback(() => {
  const hasJobDescription = interviewData.jobDescription && interviewData.jobDescription.trim().length > 0;
  const hasResumeText = interviewData.resumeText && interviewData.resumeText.trim().length >= 50;
  
  return hasJobDescription && hasResumeText;
}, [interviewData]);

  const createInterview = useCallback(async () => {
  if (!user) {
    setError('Please log in to start an interview');
    return;
  }

  if (!isSetupValid()) {
    setError('Please provide both job description and CV content');
    return;
  }

  setLoading(true);
  setError('');
  addDebugLog('Creating interview...');

  try {
    const endpoint = cvMode === 'profile' && profileCV 
      ? '/api/interviews/create-with-profile-cv'
      : '/api/interviews/create';

    const requestBody = {
      jobTitle: 'Software Engineering Internship',
      jobDescription: interviewData.jobDescription.trim(),
      difficulty: 'intermediate',
      questionCount: 5,
      ...(cvMode === 'profile' && profileCV 
        ? { useProfileCV: true }
        : { resumeText: interviewData.resumeText.trim() }
      )
    };

    addDebugLog(`Creating interview with endpoint: ${endpoint}`);
    addDebugLog(`Request body: ${JSON.stringify({
      ...requestBody, 
      resumeText: requestBody.resumeText ? `${requestBody.resumeText.substring(0, 100)}...` : undefined
    })}`);

    const interviewResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include',
      body: JSON.stringify(requestBody)
    });

    if (!interviewResponse.ok) {
      const errorText = await interviewResponse.text();
      addDebugLog(`HTTP Error: ${interviewResponse.status} - ${errorText}`, 'error');
      throw new Error(`HTTP ${interviewResponse.status}: ${interviewResponse.statusText}`);
    }

    const interviewResult = await interviewResponse.json();
    addDebugLog(`Interview creation response: ${JSON.stringify({
      success: interviewResult.success,
      interviewId: interviewResult.interview?.id,
      questionsCount: interviewResult.interview?.questions?.length,
      error: interviewResult.error
    })}`);
    
    if (!interviewResult.success) {
      throw new Error(interviewResult.error || 'Failed to create interview');
    }

    if (!interviewResult.interview || !interviewResult.interview.questions || interviewResult.interview.questions.length === 0) {
      throw new Error('Interview created but no questions were generated');
    }

    setInterview(interviewResult.interview);
    setQuestions(interviewResult.interview.questions);
    addDebugLog(`Interview created successfully with ${interviewResult.interview.questions.length} questions`);
    
    await startInterview(interviewResult.interview.id);
    
  } catch (err) {
    addDebugLog(`Interview creation failed: ${err.message}`, 'error');
    setError(`Failed to create interview: ${err.message}`);
  } finally {
    setLoading(false);
  }
}, [user, interviewData, cvMode, profileCV, addDebugLog, isSetupValid]);

  const moveToNextQuestion = async () => {
    addDebugLog(`Getting next question (${questionIndex + 2}/${questions.length})...`);
    
    try {
      const nextResponse = await fetch(`/api/interviews/${interview.id}/next-question`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include'
      });

      if (!nextResponse.ok) {
        throw new Error(`HTTP ${nextResponse.status}: ${nextResponse.statusText}`);
      }

      const nextResult = await nextResponse.json();
      addDebugLog(`Next question response: ${JSON.stringify(nextResult)}`);
      
      if (nextResult.success && !nextResult.completed) {
        const nextQuestion = nextResult.question || questions[questionIndex + 1];
        setCurrentQuestion(nextQuestion);
        setQuestionIndex(prev => prev + 1);
        
        resetQuestionState(nextQuestion);
        
        addDebugLog(`Moved to question ${questionIndex + 2}: ${nextQuestion.question.substring(0, 50)}...`);
      } else {
        addDebugLog('All questions completed, finishing interview...');
        await completeInterview();
      }
    } catch (err) {
      addDebugLog(`Next question failed: ${err.message}`, 'error');
      await completeInterview();
    }
  };

  const resetQuestionState = (nextQuestion) => {
    setAudioBlob(null);
    setRecordingTime(0);
    setTextAnswer('');
    setTranscription('');
    setTranscriptionError('');
    setError('');
    setCodeInput(''); // Clear code input for next question
    
    const isNextCoding = nextQuestion.type === 'coding' || 
                        nextQuestion.type === 'technical_coding' ||
                        nextQuestion.type === 'problem-solving';
    setShowCodeEditor(isNextCoding);
    if (isNextCoding) {
      const template = nextQuestion.starterCode?.[language] || 
                      supportedLanguages.find(l => l.value === language)?.template || '';
      setCode(template);
    } else {
      setCode('');
    }
    
    setCodeOutput('');
  };

  const startInterview = async (interviewId) => {
    try {
      addDebugLog(`Starting interview with ID: ${interviewId}...`);
      const response = await fetch(`/api/interviews/${interviewId}/start`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include'
      });

      const result = await response.json();
      addDebugLog(`Start interview response: ${JSON.stringify(result)}`);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to start interview');
      }

      const firstQuestion = result.firstQuestion || result.questions?.[0] || questions[0];
      
      if (!firstQuestion) {
        throw new Error('No questions available to start the interview');
      }

      setCurrentQuestion(firstQuestion);
      setQuestionIndex(0);
      setCode(firstQuestion.starterCode?.[language] || supportedLanguages.find(l => l.value === language)?.template || '');
      setShowCodeEditor(firstQuestion.type === 'coding' || firstQuestion.type === 'technical_coding');
      setCurrentStep('interview');
      startTimer();
      
      addDebugLog(`Interview started successfully with first question: ${firstQuestion.question.substring(0, 50)}...`);
      
    } catch (err) {
      addDebugLog(`Start interview failed: ${err.message}`, 'error');
      setError(`Failed to start interview: ${err.message}`);
    }
  };

  const skipQuestion = async () => {
    setLoading(true);
    setError('');
    addDebugLog(`Skipping question ${questionIndex + 1}...`);

    try {
      const actualResponseTime = 5;
      const isCodingQuestion = currentQuestion?.type === 'coding' || 
                              currentQuestion?.type === 'technical_coding' || 
                              currentQuestion?.type === 'problem-solving';

      const submitData = {
        questionId: currentQuestion.questionId,
        responseTime: actualResponseTime,
        answerMode: 'skipped',
        responseText: 'Question skipped by candidate',
        skipped: true,
        questionType: currentQuestion.type,
        difficulty: currentQuestion.difficulty || 'intermediate',
        ...(isCodingQuestion && {
          code: null,
          language: language
        })
      };

      addDebugLog(`Submitting skip to backend: ${JSON.stringify(submitData)}`);

      const submitResponse = await fetch(`/api/interviews/${interview.id}/submit-answer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include',
        body: JSON.stringify(submitData)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        addDebugLog(`Skip submission failed: ${submitResponse.status} - ${errorText}`, 'error');
        throw new Error(`HTTP ${submitResponse.status}: ${submitResponse.statusText}`);
      }

      const submitResult = await submitResponse.json();
      addDebugLog(`Skip response: ${JSON.stringify(submitResult)}`);
      
      if (!submitResult.success) {
        throw new Error(submitResult.error || 'Failed to skip question');
      }

      const skipFeedback = submitResult.feedback || {
        score: 0,
        strengths: [],
        improvements: ['Question was skipped - consider attempting similar questions in practice'],
        detailedAnalysis: 'Question was skipped by the candidate.',
        communicationClarity: 0,
        technicalAccuracy: 0,
        questionRelevance: 0,
        responseType: 'skipped'
      };

      setQuestionFeedbacks(prev => ({
        ...prev,
        [currentQuestion.questionId]: skipFeedback
      }));

      const response = {
        questionId: currentQuestion.questionId,
        question: currentQuestion.question,
        questionType: currentQuestion.type,
        transcription: null,
        textResponse: null,
        responseTime: actualResponseTime,
        code: null,
        language: isCodingQuestion ? language : null,
        answerMode: 'skipped',
        timestamp: new Date().toISOString(),
        feedback: skipFeedback,
        skipped: true,
        score: 0
      };

      setResponses(prev => [...prev, response]);
      addDebugLog(`Question ${questionIndex + 1} skipped successfully`);

      if (questionIndex < questions.length - 1) {
        await moveToNextQuestion();
      } else {
        await completeInterview();
      }
          
    } catch (err) {
      addDebugLog(`Skip question failed: ${err.message}`, 'error');
      setError(`Failed to skip question: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

   const submitAnswer = async () => {
    const isCodingQuestion = currentQuestion?.type === 'coding' || 
                            currentQuestion?.type === 'technical_coding' || 
                            currentQuestion?.type === 'problem-solving';
    
    let responseText = '';
    
    if (isCodingQuestion) {
      responseText = code || 'No code provided';
    } else {
      responseText = answerMode === 'audio' ? transcription : textAnswer;
    }
    
    if (!isValidAnswer(responseText, currentQuestion?.type, isCodingQuestion ? code : null)) {
      setError('Please provide a meaningful response before submitting');
      return;
    }

    setLoading(true);
    setError('');
    addDebugLog(`Submitting answer for question ${questionIndex + 1}...`);

    try {
      const questionStartTime = Date.now() - ((responses.length + 1) * 120000);
      const actualResponseTime = Math.max(Math.floor((Date.now() - questionStartTime) / 1000), 30);

      const submitData = {
        questionId: currentQuestion.questionId,
        responseTime: actualResponseTime,
        answerMode: isCodingQuestion ? 'code' : answerMode,
        responseText: responseText,
        code: isCodingQuestion ? code : null,
        language: isCodingQuestion ? language : null,
        questionType: currentQuestion.type,
        difficulty: currentQuestion.difficulty || 'intermediate',
        expectedComplexity: currentQuestion.expectedComplexity || 'medium'
      };

      addDebugLog(`Submitting to backend: ${JSON.stringify({...submitData, responseText: submitData.responseText.substring(0, 50) + '...'})}`);

      const submitResponse = await fetch(`/api/interviews/${interview.id}/submit-answer`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include',
        body: JSON.stringify(submitData)
      });

      if (!submitResponse.ok) {
        const errorText = await submitResponse.text();
        addDebugLog(`Submit answer failed: ${submitResponse.status} - ${errorText}`, 'error');
        throw new Error(`HTTP ${submitResponse.status}: ${submitResponse.statusText}`);
      }

      const submitResult = await submitResponse.json();
      addDebugLog(`Submit response: ${JSON.stringify(submitResult)}`);
      
      if (!submitResult.success) {
        throw new Error(submitResult.error || 'Failed to submit answer');
      }

      const aiFeedback = submitResult.feedback ? 
        processCodingFeedback(submitResult.feedback, isCodingQuestion) : 
        createFallbackFeedback(isCodingQuestion);

      setQuestionFeedbacks(prev => ({
        ...prev,
        [currentQuestion.questionId]: aiFeedback
      }));

      const response = {
        questionId: currentQuestion.questionId,
        question: currentQuestion.question,
        questionType: currentQuestion.type,
        transcription: answerMode === 'audio' && !isCodingQuestion ? transcription : null,
        textResponse: answerMode === 'text' && !isCodingQuestion ? textAnswer : null,
        responseTime: actualResponseTime,
        code: isCodingQuestion ? code : null,
        language: isCodingQuestion ? language : null,
        answerMode: isCodingQuestion ? 'code' : answerMode,
        timestamp: new Date().toISOString(),
        feedback: aiFeedback,
        score: aiFeedback.score || 50,
        codeMetrics: isCodingQuestion ? aiFeedback.codeMetrics : null,
        algorithmicThinking: isCodingQuestion ? aiFeedback.algorithmicThinking : null,
        codeQuality: isCodingQuestion ? aiFeedback.codeQuality : null
      };

      setResponses(prev => [...prev, response]);
      addDebugLog(`Answer submitted successfully for question ${questionIndex + 1}`);

      if (questionIndex < questions.length - 1) {
        await moveToNextQuestion();
      } else {
        await completeInterview();
      }
          
    } catch (err) {
      addDebugLog(`Submit answer failed: ${err.message}`, 'error');
      setError(`Failed to submit answer: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

    const processCodingFeedback = (rawFeedback, isCodingQuestion) => {
    let feedback;
    if (typeof rawFeedback === 'string') {
      try {
        const jsonMatch = rawFeedback.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          feedback = JSON.parse(jsonMatch[0]);
        } else {
          feedback = {
            score: 50,
            strengths: [],
            improvements: [rawFeedback.substring(0, 100) + '...'],
            detailedAnalysis: rawFeedback
          };
        }
      } catch (parseError) {
        addDebugLog(`Failed to parse AI feedback JSON: ${parseError.message}`, 'error');
        feedback = {
          score: 50,
          strengths: [],
          improvements: ['AI feedback parsing failed - using fallback'],
          detailedAnalysis: rawFeedback
        };
      }
    } else {
      feedback = rawFeedback;
    }

    if (!isCodingQuestion) {
      return {
        score: feedback.score || 50,
        strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
        improvements: Array.isArray(feedback.improvements) ? feedback.improvements : [],
        detailedAnalysis: feedback.detailedAnalysis || 'Response analyzed',
        communicationClarity: feedback.communicationClarity || 5,
        technicalAccuracy: feedback.technicalAccuracy || 5,
        questionRelevance: feedback.questionRelevance || 5,
        responseType: feedback.responseType || 'submitted'
      };
    }

    return {
      score: feedback.score || 50,
      strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
      improvements: Array.isArray(feedback.improvements) ? feedback.improvements : [],
      detailedAnalysis: feedback.detailedAnalysis || 'Code solution analyzed',
      
      communicationClarity: feedback.communicationClarity || 5,
      technicalAccuracy: feedback.technicalAccuracy || 5,
      questionRelevance: feedback.questionRelevance || 5,
      responseType: feedback.responseType || 'code-submitted',
      
      codeMetrics: {
        syntaxCorrectness: feedback.codeMetrics?.syntaxCorrectness || feedback.syntaxCorrectness || 5,
        logicalFlow: feedback.codeMetrics?.logicalFlow || feedback.logicalFlow || 5,
        efficiency: feedback.codeMetrics?.efficiency || feedback.efficiency || 5,
        readability: feedback.codeMetrics?.readability || feedback.readability || 5,
        bestPractices: feedback.codeMetrics?.bestPractices || feedback.bestPractices || 5
      },
      
      algorithmicThinking: {
        problemDecomposition: feedback.algorithmicThinking?.problemDecomposition || feedback.problemDecomposition || 5,
        algorithmChoice: feedback.algorithmicThinking?.algorithmChoice || feedback.algorithmChoice || 5,
        edgeCaseHandling: feedback.algorithmicThinking?.edgeCaseHandling || feedback.edgeCaseHandling || 5,
        timeComplexity: feedback.algorithmicThinking?.timeComplexity || feedback.timeComplexity || 5,
        spaceComplexity: feedback.algorithmicThinking?.spaceComplexity || feedback.spaceComplexity || 5
      },
      
      codeQuality: {
        structure: feedback.codeQuality?.structure || feedback.structure || 5,
        naming: feedback.codeQuality?.naming || feedback.naming || 5,
        comments: feedback.codeQuality?.comments || feedback.comments || 5,
        modularity: feedback.codeQuality?.modularity || feedback.modularity || 5,
        errorHandling: feedback.codeQuality?.errorHandling || feedback.errorHandling || 5
      },
      
      strengths_detailed: {
        technical: feedback.strengths_detailed?.technical || [],
        algorithmic: feedback.strengths_detailed?.algorithmic || [],
        implementation: feedback.strengths_detailed?.implementation || []
      },
      
      improvements_detailed: {
        technical: feedback.improvements_detailed?.technical || [],
        algorithmic: feedback.improvements_detailed?.algorithmic || [],
        implementation: feedback.improvements_detailed?.implementation || []
      }
    };
  };

  const completeInterview = async () => {
    try {
      addDebugLog('Completing interview...');
      
      const completeResponse = await fetch(`/api/interviews/${interview.id}/complete`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include'
      });

      if (!completeResponse.ok) {
        throw new Error(`HTTP ${completeResponse.status}: ${completeResponse.statusText}`);
      }

      const completeResult = await completeResponse.json();
      addDebugLog(`Complete interview response: ${JSON.stringify(completeResult)}`);
      
      if (!completeResult.success) {
        throw new Error(completeResult.error || 'Failed to complete interview');
      }

      const feedbackResponse = await fetch(`/api/interviews/${interview.id}/feedback`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        credentials: 'include'
      });

      if (feedbackResponse.ok) {
        const feedbackResult = await feedbackResponse.json();
        addDebugLog(`Feedback response: ${JSON.stringify(feedbackResult)}`);

        if (feedbackResult.success && feedbackResult.feedback) {
          setFeedback(feedbackResult.feedback);
          addDebugLog('Using AI-generated overall feedback from backend');
        } else {
          addDebugLog('Backend feedback not available, using fallback');
          setFeedback(createFallbackFeedback());
        }
      } else {
        addDebugLog('Feedback endpoint failed, using fallback');
        setFeedback(createFallbackFeedback());
      }

      setCurrentStep('feedback');
      stopTimer();
      addDebugLog(`Interview completed successfully`);
      
    } catch (err) {
      addDebugLog(`Complete interview failed: ${err.message}`, 'error');
      setError(`Failed to complete interview: ${err.message}`);
      
      setFeedback(createFallbackFeedback());
      setCurrentStep('feedback');
      stopTimer();
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const resetInterview = useCallback(() => {
    setCurrentStep('setup');
    setInterview(null);
    setQuestions([]);
    setCurrentQuestion(null);
    setQuestionIndex(0);
    setResponses([]);
    setFeedback(null);
    setQuestionFeedbacks({});
    setInterviewData(prev => ({ ...prev, jobDescription: '' }));
    setCode('');
    setCodeOutput('');
    setCodeInput('');
    setShowCodeEditor(false);
    setAudioBlob(null);
    setRecordingTime(0);
    setTimer(0);
    setTextAnswer('');
    setTranscription('');
    setTranscriptionError('');
    setAnswerMode('audio');
    setUploadedFile(null);
    if (profileCV) {
      setCvMode('profile');
      setInterviewData(prev => ({ ...prev, resumeText: profileCV.text }));
    } else {
      setCvMode('upload');
      setInterviewData(prev => ({ ...prev, resumeText: '' }));
    }
  }, [profileCV]);

  useEffect(() => {
    if (currentQuestion) {
      const isCoding = currentQuestion.type === 'coding' || currentQuestion.type === 'technical_coding';
      setShowCodeEditor(isCoding);
      
      if (isCoding && (!code || code.trim().length < 20)) {
        const template = currentQuestion.starterCode?.[language] || 
                        supportedLanguages.find(l => l.value === language)?.template || '';
        setCode(template);
      }
    }
  }, [currentQuestion?.questionId, language]);

  useEffect(() => {
    return () => {
      stopTimer();
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  const handleManualCvChange = useCallback((e) => {
  const text = e.target.value;
  setInterviewData(prev => ({ ...prev, resumeText: text }));
  
  if (uploadedFile && text !== '') {
    setUploadedFile(null);
  }
  
  if (text.length > 0 && text.length < 50) {
    setCvError('Please provide more detailed CV information (at least 50 characters)');
  } else if (text.length > 0 && text.split(/\s+/).filter(w => w.length > 0).length < 10) {
    setCvError('Please provide more comprehensive CV content (at least 10 words)');
  } else {
    setCvError('');
  }
}, [uploadedFile]);



// Enhanced CV section component
const CVSection = useMemo(() => (
  <div className="mb-4">
    <label className="block text-sm font-medium text-gray-700 mb-2">Resume/CV *</label>
    
    <div className="flex gap-2 mb-3 flex-wrap">
      <button
        onClick={() => handleCvModeChange('profile')}
        disabled={!profileCV}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          cvMode === 'profile' 
            ? 'bg-blue-100 border-blue-500 text-blue-700' 
            : profileCV
              ? 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
              : 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        <User className="w-4 h-4" />
        Profile CV
        {profileCV && <CheckCircle className="w-4 h-4 text-green-500" />}
      </button>
      
      <button
        onClick={() => handleCvModeChange('upload')}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          cvMode === 'upload' 
            ? 'bg-purple-100 border-purple-500 text-purple-700' 
            : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Upload className="w-4 h-4" />
        Upload File
      </button>

      <button
        onClick={() => handleCvModeChange('manual')}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
          cvMode === 'manual' 
            ? 'bg-green-100 border-green-500 text-green-700' 
            : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
        }`}
      >
        <Type className="w-4 h-4" />
        Type Manually
      </button>

      {profileCV && (
        <button
          onClick={loadProfileCV}
          disabled={cvLoading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 border border-gray-300 text-gray-600 hover:bg-gray-200 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${cvLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      )}
    </div>

    {cvMode === 'profile' && profileCV && (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-medium text-blue-900">Profile CV Loaded</h4>
          </div>
          <span className="text-xs text-blue-600">
            {profileCV.age ? `${profileCV.age} old` : 'Current'}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div>
            <span className="font-medium text-blue-700">File:</span>
            <span className="ml-1 text-blue-600">{profileCV.fileName}</span>
          </div>
          <div>
            <span className="font-medium text-blue-700">Size:</span>
            <span className="ml-1 text-blue-600">{profileCV.fileSize ? `${Math.round(profileCV.fileSize / 1024)}KB` : 'N/A'}</span>
          </div>
          <div>
            <span className="font-medium text-blue-700">Length:</span>
            <span className="ml-1 text-blue-600">{profileCV.text.length} chars</span>
          </div>
        </div>
        
        <div className="mt-2 p-2 bg-white rounded border border-blue-200">
          <div className="text-xs text-blue-700 mb-1">Preview:</div>
          <div className="text-xs text-gray-700 max-h-20 overflow-y-auto">
            {profileCV.text.substring(0, 200)}
            {profileCV.text.length > 200 && '...'}
          </div>
        </div>
      </div>
    )}

    {cvMode === 'upload' && (
      <div className="space-y-3">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.docx,.doc"
            onChange={handleFileUpload}
            className="hidden"
            disabled={cvLoading}
          />
          <Upload className="w-6 h-6 text-gray-400 mx-auto mb-2" />
          <div className="text-sm text-gray-600 mb-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={cvLoading}
              className="text-blue-600 hover:text-blue-700 font-medium disabled:text-gray-400"
            >
              {cvLoading ? 'Processing...' : 'Click to upload'}
            </button>
          </div>
          <div className="text-xs text-gray-500">
            PDF, TXT, DOC, or DOCX (Max 5MB)
          </div>
        </div>

        {cvLoading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
              <span className="text-sm font-medium text-blue-800">Processing CV file...</span>
            </div>
            <div className="text-xs text-blue-600 mt-1">Extracting text content from your document...</div>
          </div>
        )}

        {uploadedFile && !cvLoading && interviewData.resumeText && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <FileCheck className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-green-800">
                {uploadedFile.name} ({Math.round(uploadedFile.size / 1024)}KB)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-green-700">
              <div>Characters: {interviewData.resumeText.length}</div>
              <div>Words: {interviewData.resumeText.split(/\s+/).filter(w => w.length > 0).length}</div>
            </div>
            <div className="mt-2 p-2 bg-white rounded border border-green-200">
              <div className="text-xs text-green-700 mb-1">Extracted Content Preview:</div>
              <div className="text-xs text-gray-700 max-h-16 overflow-y-auto">
                {interviewData.resumeText.substring(0, 150)}
                {interviewData.resumeText.length > 150 && '...'}
              </div>
            </div>
          </div>
        )}
      </div>
    )}

    {cvMode === 'manual' && (
      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Enter your CV/Resume text:
        </label>
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

    {cvMode === 'upload' && interviewData.resumeText && uploadedFile && !cvLoading && (
      <div className="mt-3">
        <label className="block text-xs font-medium text-gray-700 mb-2">
          Extracted CV Content:
        </label>
        <textarea
          value={interviewData.resumeText}
          onChange={(e) => setInterviewData(prev => ({ ...prev, resumeText: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-32 resize-none text-sm"
          placeholder="Extracted CV content will appear here..."
        />
        <div className="mt-1 flex justify-between text-xs text-gray-500">
          <span>You can edit the extracted content if needed</span>
          <span>Characters: {interviewData.resumeText.length}</span>
        </div>
      </div>
    )}

    {cvError && (
      <div className="mt-2 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-red-700 text-xs">{cvError}</span>
      </div>
    )}
  </div>
), [cvMode, profileCV, interviewData.resumeText, cvLoading, cvError, uploadedFile, handleCvModeChange, loadProfileCV, handleFileUpload, handleManualCvChange]);

  const SetupPhase = useMemo(() => (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="min-h-screen bg-gray-50">
              <NavBar />
      <div className="container mx-auto px-6 py-8">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full mb-4">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              AI Mock Interview System
            </h1>
            <p className="text-lg text-gray-600">
              Welcome {user?.name || 'User'}! Prepare for your software engineering internship
            </p>
          </div>

            <div className="space-y-4">
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
                <div className="relative">
                  <textarea
                    value={interviewData.jobDescription}
                    onChange={handleJobDescriptionChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 h-24 resize-none transition-colors text-sm"
                    placeholder="Paste the software engineering internship job description here..."
                  />
                  <div className="absolute bottom-2 right-2 text-xs text-gray-400">
                    {interviewData.jobDescription.length}/2000
                  </div>
                </div>
              </div>

              {CVSection}

              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  Audio Setup
                </h4>
                <p className="text-xs text-blue-700 mb-3">Test your microphone before starting:</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={initializeAudio}
                    disabled={audioPermission}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      audioPermission 
                        ? 'bg-green-100 text-green-800 border border-green-300' 
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    {audioPermission ? (
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
                </div>
                {audioError && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-600 flex items-center gap-2">
                      <AlertCircle className="w-3 h-3" />
                      {audioError}
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

              <div className="pt-2">
                <button
                  onClick={createInterview}
                  disabled={loading || !isSetupValid() || !user}
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
      </div>
    </div>
  ), [user, interviewData, debugMode, debugLogs, audioPermission, audioError, error, loading, isSetupValid, createInterview, handleJobDescriptionChange, CVSection]);

  const InterviewPhase = useMemo(() => {
    
    const isCodingQuestion = currentQuestion?.type === 'coding' || currentQuestion?.type === 'technical_coding';
    
    return (
      <div className="min-h-screen bg-gray-50">
                      <NavBar/>
    <div className="space-y-6 md:space-y-8"></div>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Mock Interview</h1>
                  <p className="text-xs text-gray-600">Question {questionIndex + 1} of {questions.length}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono text-sm">
                    {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                  </span>
                </div>
                <div className="w-24">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-blue-600 to-indigo-600 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${((questionIndex + 1) / questions.length) * 100}%` }}
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
                  currentQuestion?.type === 'technical' || currentQuestion?.type === 'technical_conceptual' ? 'bg-gradient-to-r from-indigo-500 to-blue-500' :
                  currentQuestion?.type === 'behavioral' ? 'bg-gradient-to-r from-green-500 to-teal-500' :
                  'bg-gradient-to-r from-blue-500 to-cyan-500'
                }`}>
                  {isCodingQuestion ? <Code className="w-6 h-6 text-white" /> : <MessageCircle className="w-6 h-6 text-white" />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      isCodingQuestion ? 'bg-purple-100 text-purple-800' :
                      currentQuestion?.type === 'technical' || currentQuestion?.type === 'technical_conceptual' ? 'bg-indigo-100 text-indigo-800' :
                      currentQuestion?.type === 'behavioral' ? 'bg-green-100 text-green-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {currentQuestion?.type?.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 leading-relaxed">
                    {currentQuestion?.question}
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

              {isCodingQuestion && !showCodeEditor && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowCodeEditor(true)}
                    className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-2 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 text-sm"
                  >
                    <Terminal className="w-4 h-4" />
                    Open Code Editor
                  </button>
                </div>
              )}

              {!isCodingQuestion && answerMode === 'audio' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center justify-center gap-4 py-6">
                      <button
                        onClick={isRecording ? stopRecording : startRecording}
                        disabled={loading}
                        className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
                          isRecording 
                            ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-red-200' 
                            : 'bg-blue-500 hover:bg-blue-600 text-white hover:shadow-blue-200'
                        }`}
                      >
                        {isRecording ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
                      </button>
                      
                      {audioBlob && (
                        <button
                          onClick={playRecording}
                          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg ${
                            isPlaying ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-500 hover:bg-gray-600'
                          } text-white`}
                        >
                          {isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                        </button>
                      )}
                    </div>

                    <div className="text-center space-y-2">
                      <p className="text-gray-700 text-sm font-medium">
                        {isRecording ? (
                          <span className="flex items-center justify-center gap-2">
                            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                            Recording... {recordingTime}s
                          </span>
                        ) : (
                          'Click microphone to record'
                        )}
                      </p>
                      
                      {audioBlob && (
                        <div className="bg-green-100 border border-green-200 rounded-lg p-2">
                          <p className="text-green-800 text-sm font-medium flex items-center justify-center gap-2">
                            <CheckCircle className="w-4 h-4" />
                            Recorded ({Math.round(audioBlob.size / 1024)}KB)
                          </p>
                        </div>
                      )}
                      
                      {isTranscribing && (
                        <div className="bg-blue-100 border border-blue-200 rounded-lg p-2">
                          <p className="text-blue-800 text-sm flex items-center justify-center gap-2">
                            <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-600 border-t-transparent"></div>
                            Transcribing...
                          </p>
                        </div>
                      )}
                      
                      {audioError && (
                        <div className="bg-red-100 border border-red-200 rounded-lg p-2">
                          <p className="text-red-800 text-xs">⚠️ {audioError}</p>
                        </div>
                      )}
                      
                      {transcriptionError && (
                        <div className="bg-yellow-100 border border-yellow-200 rounded-lg p-3">
                          <p className="text-yellow-800 text-xs mb-2">⚠️ {transcriptionError}</p>
                          <button 
                            onClick={() => setAnswerMode('text')} 
                            className="bg-yellow-600 hover:bg-yellow-700 text-white px-3 py-1 rounded-lg text-xs transition-colors"
                          >
                            Switch to Text
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {transcription && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                        <Volume2 className="w-4 h-4" />
                        Transcription
                      </h4>
                      <div className="bg-white rounded-lg p-3 border border-blue-100">
                        <p className="text-gray-700 text-sm leading-relaxed">{transcription}</p>
                      </div>
                    </div>
                  )}

                  {transcriptionError && audioBlob && answerMode === 'audio' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                      <h4 className="text-sm font-semibold text-yellow-800 mb-2">Manual Transcription</h4>
                      <p className="text-yellow-700 mb-2 text-xs">Type what you said:</p>
                      <textarea
                        value={transcription}
                        onChange={handleTranscriptionChange}
                        className="w-full h-24 px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 resize-none text-sm"
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
                      onChange={handleTextAnswerChange}
                      className="w-full h-32 px-3 py-2 border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 resize-none transition-colors text-sm"
                      placeholder="Type your comprehensive answer here..."
                    />
                    <div className="mt-2 flex justify-between text-xs text-green-600">
                      <span>Characters: {textAnswer.length}</span>
                      <span>Words: {textAnswer.split(' ').filter(word => word.length > 0).length}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-center gap-3 mt-6">
                <button
                  onClick={skipQuestion}
                  disabled={loading}
                  className="bg-gray-500 hover:bg-gray-600 disabled:bg-gray-300 text-white font-medium py-2 px-4 rounded-lg transition-all duration-200 flex items-center gap-2 text-sm"
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
                
                {((isCodingQuestion && code.trim()) || (!isCodingQuestion && ((answerMode === 'audio' && transcription) || (answerMode === 'text' && textAnswer.trim())))) && (
                  <button
                    onClick={submitAnswer}
                    disabled={loading}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-300 disabled:to-gray-300 text-white font-semibold py-2 px-6 rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none text-sm"
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

            {/* UPDATED: Enhanced Code Editor with JDoodle Integration */}
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
                      value={language}
                      onChange={handleLanguageChange}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      {supportedLanguages.map(lang => (
                        <option key={lang.value} value={lang.value}>
                          {lang.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={executeCodeWithJDoodle}
                      disabled={isRunningCode || !code.trim()}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-2"
                    >
                      {isRunningCode ? (
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
                      key={`code-editor-${currentQuestion?.questionId}-${language}`}
                      value={code}
                      onChange={handleCodeChange}
                      className="w-full h-64 px-4 py-3 border-2 border-gray-300 rounded-lg text-sm bg-white focus:border-purple-500 focus:outline-none resize-none"
                      placeholder={`Write your ${supportedLanguages.find(l => l.value === language)?.label || language} code here...`}
                      style={{ fontFamily: 'monospace' }}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />
                  </div>

                  {/* NEW: Input section for programs that need user input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Program Input (if needed):
                      <span className="text-xs text-gray-500 ml-2">Leave empty if your program doesn't require input</span>
                    </label>
                    <textarea
                      value={codeInput}
                      onChange={handleCodeInputChange}
                      className="w-full h-16 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:border-purple-500 focus:outline-none resize-none"
                      placeholder="Enter input values (one per line) if your program reads from stdin..."
                      style={{ fontFamily: 'monospace' }}
                    />
                  </div>

                  {/* UPDATED: Enhanced output section with execution details */}
                  {codeOutput && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                        <Terminal className="w-4 h-4" />
                        Execution Results:
                      </label>
                      <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap max-h-64 overflow-y-auto border-2 border-gray-700">
                        {codeOutput}
                      </div>
                      <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                          Executed on JDoodle servers
                        </span>
                        <span>Language: {supportedLanguages.find(l => l.value === language)?.label}</span>
                      </div>
                    </div>
                  )}

                  {/* NEW: Code execution tips */}
                  {isCodingQuestion && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <h4 className="text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                        <Code className="w-4 h-4" />
                        Code Execution Tips:
                      </h4>
                      <ul className="text-xs text-blue-700 space-y-1">
                        <li>• Your code runs on real {supportedLanguages.find(l => l.value === language)?.label} servers</li>
                        <li>• Use console.log(), print(), or cout to see output</li>
                        <li>• Add input in the "Program Input" field if needed</li>
                        <li>• Execution timeout is 10 seconds</li>
                        <li>• Memory limit is 128MB</li>
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {debugMode && (
              <div className="bg-gray-900 rounded-xl shadow-lg p-4 border border-gray-700">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="text-sm font-semibold text-green-400">Debug Console</h3>
                  <button 
                    onClick={() => setDebugLogs([])}
                    className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded transition-colors"
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-32 overflow-y-auto text-xs font-mono space-y-1">
                  {debugLogs.slice(-10).map((log, index) => (
                    <div key={index} className={`${
                      log.type === 'error' ? 'text-red-400' : 
                      log.type === 'warn' ? 'text-yellow-400' : 
                      'text-green-400'
                    }`}>
                      <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        </div>

        <audio ref={audioPlaybackRef} className="hidden" />
      </div>
    );
  }, [questionIndex, questions.length, timer, currentQuestion, answerMode, isRecording, loading, audioBlob, isPlaying, recordingTime, audioError, isTranscribing, transcriptionError, transcription, textAnswer, error, debugMode, debugLogs, showCodeEditor, language, code, codeOutput, codeInput, isRunningCode, supportedLanguages, responses, handleLanguageChange, handleCodeChange, handleCodeInputChange, executeCodeWithJDoodle]);

// UPDATED: FeedbackPhase component (same as before, no changes needed)
const FeedbackPhase = useMemo(() => (
  <div className="min-h-screen bg-gray-50">
                      <NavBar/>
    <div className="space-y-6 md:space-y-8"></div>
  <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-indigo-50">
    <div className="container mx-auto px-6 py-8">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-500 rounded-full mb-4 shadow-lg">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Interview Complete!</h1>
          <p className="text-lg text-gray-600">
            Here's your comprehensive performance analysis with detailed feedback.
          </p>
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

            {feedback.feedback && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {feedback.feedback.technicalSkills && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                    <h4 className="font-semibold text-blue-900 mb-2">Technical Skills</h4>
                    <div className="text-2xl font-bold text-blue-600 mb-1">{feedback.feedback.technicalSkills.score}%</div>
                    <p className="text-sm text-blue-700">{feedback.feedback.technicalSkills.feedback}</p>
                  </div>
                )}
                {feedback.feedback.communicationSkills && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-100">
                    <h4 className="font-semibold text-green-900 mb-2">Communication</h4>
                    <div className="text-2xl font-bold text-green-600 mb-1">{feedback.feedback.communicationSkills.score}%</div>
                    <p className="text-sm text-green-700">{feedback.feedback.communicationSkills.feedback}</p>
                  </div>
                )}
                {feedback.feedback.problemSolving && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-100">
                    <h4 className="font-semibold text-purple-900 mb-2">Problem Solving</h4>
                    <div className="text-2xl font-bold text-purple-600 mb-1">{feedback.feedback.problemSolving.score}%</div>
                    <p className="text-sm text-purple-700">{feedback.feedback.problemSolving.feedback}</p>
                  </div>
                )}
              </div>
            )}

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

        {Object.keys(questionFeedbacks).length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-purple-600" />
              Detailed Question Analysis
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {responses.map((response, index) => {
                const feedback = questionFeedbacks[response.questionId];
                if (!feedback) return null;
                
                const isCoding = response.questionType === 'coding' || 
                                response.questionType === 'technical_coding' || 
                                response.questionType === 'problem-solving';
                
                return (
                  <div key={index} className="border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-shadow">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white text-sm ${
                          feedback.score >= 80 ? 'bg-green-500' :
                          feedback.score >= 60 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <h4 className="font-semibold text-gray-900 text-sm">Question {index + 1}</h4>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            isCoding ? 'bg-purple-100 text-purple-700' :
                            questions[index]?.type === 'behavioral' ? 'bg-green-100 text-green-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {questions[index]?.type}
                            {isCoding && <Code className="w-3 h-3 inline ml-1" />}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-lg font-bold ${
                          feedback.score >= 80 ? 'text-green-600' :
                          feedback.score >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {response.skipped ? 'SKIP' : `${feedback.score}%`}
                        </div>
                        <div className="text-xs text-gray-500">{response.responseTime}s</div>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 text-xs mb-3 leading-relaxed">{questions[index]?.question}</p>
                    
                    <div className="space-y-2">
                      {feedback.strengths && feedback.strengths.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            Strengths
                          </h5>
                          <ul className="text-xs text-green-600 space-y-0.5">
                            {feedback.strengths.map((strength, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <div className="w-1 h-1 bg-green-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                {strength}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      {feedback.improvements && feedback.improvements.length > 0 && (
                        <div>
                          <h5 className="text-xs font-semibold text-orange-700 mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Improvements
                          </h5>
                          <ul className="text-xs text-orange-600 space-y-0.5">
                            {feedback.improvements.map((improvement, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5 flex-shrink-0"></div>
                                {improvement}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {response.code && (
                      <div className="mt-3 p-2 bg-gray-50 rounded-lg border">
                        <div className="flex justify-between items-center mb-1">
                          <h5 className="text-xs font-semibold text-gray-700">Code Solution:</h5>
                          <span className="text-xs text-gray-500">{response.language}</span>
                        </div>
                        <pre className="text-xs text-gray-600 font-mono whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto bg-white rounded border p-2">
                          {response.code}
                        </pre>
                      </div>
                    )}

                    {(response.transcription || response.textResponse) && !response.skipped && (
                      <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                        <h5 className="text-xs font-semibold text-blue-700 mb-1">
                          {response.transcription ? 'Audio Response:' : 'Text Response:'}
                        </h5>
                        <p className="text-xs text-blue-600 leading-relaxed">
                          {response.transcription || response.textResponse}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {responses && responses.length > 0 && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-8 border border-gray-100">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              Interview Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-xl font-bold text-blue-600">{responses.length}</div>
                <div className="text-xs text-blue-700">Questions</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-xl font-bold text-green-600">
                  {Math.floor(timer / 60)}:{(timer % 60).toString().padStart(2, '0')}
                </div>
                <div className="text-xs text-green-700">Total Time</div>
              </div>
              <div className="text-center p-3 bg-purple-50 rounded-lg">
                <div className="text-xl font-bold text-purple-600">
                  {responses.filter(r => r.code).length}
                </div>
                <div className="text-xs text-purple-700">Coding</div>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <div className="text-xl font-bold text-orange-600">
                  {responses.filter(r => r.skipped).length}
                </div>
                <div className="text-xs text-orange-700">Skipped</div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <button
            onClick={resetInterview}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <RefreshCw className="w-4 h-4" />
            Start New Interview
          </button>
          <button
            onClick={() => window.print()}
            className="bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:scale-105"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
), [feedback, responses, questions, questionFeedbacks, timer, resetInterview]);

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

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'setup':
        return SetupPhase;
      case 'interview':
        return InterviewPhase;
      case 'feedback':
        return FeedbackPhase;
      default:
        return SetupPhase;
    }
  };

  return (
    <div className="min-h-screen">
      {renderCurrentStep()}
    </div>
  );
};

export default MockInterviewSystem;