import { useState, useCallback } from 'react';

export const useInterview = (addDebugLog) => {
  const [interview, setInterview] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [responses, setResponses] = useState([]);
  const [questionFeedbacks, setQuestionFeedbacks] = useState({});

  const createInterview = useCallback(async (interviewData, cvMode, profileCV, user) => {
    if (!user) throw new Error('Please log in to start an interview');

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

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include',
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    
    if (!result.success || !result.interview?.questions?.length) {
      throw new Error(result.error || 'Failed to create interview');
    }

    setInterview(result.interview);
    setQuestions(result.interview.questions);
    addDebugLog(`Interview created with ${result.interview.questions.length} questions`);
    
    return result.interview;
  }, [addDebugLog]);

  const startInterview = useCallback(async (interviewId, language, supportedLanguages) => {
    addDebugLog(`Starting interview: ${interviewId}`);
    
    const response = await fetch(`/api/interviews/${interviewId}/start`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include'
    });

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start interview');
    }

    const firstQuestion = result.firstQuestion || result.questions?.[0] || questions[0];
    
    if (!firstQuestion) {
      throw new Error('No questions available');
    }

    setCurrentQuestion(firstQuestion);
    setQuestionIndex(0);
    
    addDebugLog(`Interview started with question: ${firstQuestion.question.substring(0, 50)}...`);
    
    return firstQuestion;
  }, [questions, addDebugLog]);

  const submitAnswer = useCallback(async (interviewId, submitData) => {
    addDebugLog('Submitting answer...');
    
    const response = await fetch(`/api/interviews/${interviewId}/submit-answer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include',
      body: JSON.stringify(submitData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to submit answer');
    }

    return result.feedback;
  }, [addDebugLog]);

  const skipQuestion = useCallback(async (interviewId, currentQuestion, language) => {
    const isCodingQuestion = ['coding', 'technical_coding', 'problem-solving'].includes(currentQuestion?.type);

    const submitData = {
      questionId: currentQuestion.questionId,
      responseTime: 5,
      answerMode: 'skipped',
      responseText: 'Question skipped by candidate',
      skipped: true,
      questionType: currentQuestion.type,
      difficulty: currentQuestion.difficulty || 'intermediate',
      ...(isCodingQuestion && { code: null, language })
    };

    const response = await fetch(`/api/interviews/${interviewId}/submit-answer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include',
      body: JSON.stringify(submitData)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to skip question');
    }

    return result.feedback || {
      score: 0,
      strengths: [],
      improvements: ['Question was skipped'],
      detailedAnalysis: 'Question was skipped',
      responseType: 'skipped'
    };
  }, []);

  const completeInterview = useCallback(async (interviewId) => {
    addDebugLog('Completing interview...');
    
    const response = await fetch(`/api/interviews/${interviewId}/complete`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to complete interview');
    }

    const feedbackResponse = await fetch(`/api/interviews/${interviewId}/feedback`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include'
    });

    if (feedbackResponse.ok) {
      const feedbackResult = await feedbackResponse.json();
      if (feedbackResult.success && feedbackResult.feedback) {
        return feedbackResult.feedback;
      }
    }

    return null;
  }, [addDebugLog]);

  const getNextQuestion = useCallback(async (interviewId) => {
    const response = await fetch(`/api/interviews/${interviewId}/next-question`, {
      method: 'GET',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    
    if (result.success && !result.completed) {
      const nextQuestion = result.question || questions[questionIndex + 1];
      setCurrentQuestion(nextQuestion);
      setQuestionIndex(prev => prev + 1);
      return nextQuestion;
    }

    return null;
  }, [questions, questionIndex]);

  const reset = useCallback(() => {
    setInterview(null);
    setQuestions([]);
    setCurrentQuestion(null);
    setQuestionIndex(0);
    setResponses([]);
    setQuestionFeedbacks({});
  }, []);

  return {
    interview,
    questions,
    currentQuestion,
    questionIndex,
    responses,
    questionFeedbacks,
    setResponses,
    setQuestionFeedbacks,
    setCurrentQuestion,
    createInterview,
    startInterview,
    submitAnswer,
    skipQuestion,
    completeInterview,
    getNextQuestion,
    reset
  };
};
