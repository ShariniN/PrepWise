// Validation utilities
export const isValidAnswer = (responseText, questionType, codeText = null) => {
  const isCodingQuestion = ['coding', 'technical_coding', 'problem-solving'].includes(questionType);
  
  if (isCodingQuestion) {
    if (!codeText?.trim()) return false;
    
    const normalizedCode = codeText.replace(/\s+/g, ' ').trim();
    if (normalizedCode.length < 20) return false;
    
    const codeWithoutComments = codeText
      .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      .replace(/#.*$/gm, '')
      .trim();
    
    if (codeWithoutComments.length < 20) return false;
    
    const meaningfulCodePattern = /[{};()=+\-*/><%]/;
    return meaningfulCodePattern.test(codeWithoutComments);
  } else {
    if (!responseText?.trim()) return false;
    
    const text = responseText.trim().toLowerCase();
    if (text.length < 20) return false;
    
    const words = text.split(/\s+/).filter(word => word.length > 0);
    if (words.length < 5) return false;
    
    const meaninglessResponses = [
      'i don\'t know', 'no idea', 'not sure', 'pass', 'skip',
      'i have no idea', 'don\'t know', 'no clue', 'nothing'
    ];
    
    if (meaninglessResponses.includes(text)) return false;
    
    const repeatedWordThreshold = 0.5;
    const wordCounts = {};
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    const mostCommonCount = Math.max(...Object.values(wordCounts));
    return mostCommonCount / words.length <= repeatedWordThreshold;
  }
};

export const isCodingQuestionType = (type) => {
  return ['coding', 'technical_coding', 'problem-solving'].includes(type);
};

export const isSetupValid = (jobDescription, resumeText) => {
  return jobDescription?.trim().length > 0 && resumeText?.trim().length >= 50;
};

// Feedback processing utilities
export const processFeedback = (rawFeedback, isCodingQuestion) => {
  let feedback;
  
  if (typeof rawFeedback === 'string') {
    try {
      const jsonMatch = rawFeedback.match(/\{[\s\S]*\}/);
      feedback = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        score: 50,
        strengths: [],
        improvements: [rawFeedback.substring(0, 100) + '...'],
        detailedAnalysis: rawFeedback
      };
    } catch {
      feedback = {
        score: 50,
        strengths: [],
        improvements: ['AI feedback parsing failed'],
        detailedAnalysis: rawFeedback
      };
    }
  } else {
    feedback = rawFeedback;
  }

  const baseFeedback = {
    score: feedback.score || 50,
    strengths: Array.isArray(feedback.strengths) ? feedback.strengths : [],
    improvements: Array.isArray(feedback.improvements) ? feedback.improvements : [],
    detailedAnalysis: feedback.detailedAnalysis || 'Response analyzed',
    communicationClarity: feedback.communicationClarity || 5,
    technicalAccuracy: feedback.technicalAccuracy || 5,
    questionRelevance: feedback.questionRelevance || 5,
    responseType: feedback.responseType || 'submitted'
  };

  if (!isCodingQuestion) {
    return baseFeedback;
  }

  return {
    ...baseFeedback,
    codeMetrics: {
      syntaxCorrectness: feedback.codeMetrics?.syntaxCorrectness || feedback.syntaxCorrectness || 5,
      logicalFlow: feedback.codeMetrics?.logicalFlow || feedback.logicalFlow || 5,
      efficiency: feedback.codeMetrics?.efficiency || feedback.efficiency || 5,
      readability: feedback.codeMetrics?.readability || feedback.readability || 5,
      bestPractices: feedback.codeMetrics?.bestPractices || feedback.bestPractices || 5
    },
    algorithmicThinking: {
      problemDecomposition: feedback.algorithmicThinking?.problemDecomposition || 5,
      algorithmChoice: feedback.algorithmicThinking?.algorithmChoice || 5,
      edgeCaseHandling: feedback.algorithmicThinking?.edgeCaseHandling || 5,
      timeComplexity: feedback.algorithmicThinking?.timeComplexity || 5,
      spaceComplexity: feedback.algorithmicThinking?.spaceComplexity || 5
    },
    codeQuality: {
      structure: feedback.codeQuality?.structure || 5,
      naming: feedback.codeQuality?.naming || 5,
      comments: feedback.codeQuality?.comments || 5,
      modularity: feedback.codeQuality?.modularity || 5,
      errorHandling: feedback.codeQuality?.errorHandling || 5
    }
  };
};

export const createFallbackFeedback = (responses) => {
  const validResponses = responses.filter(r => !r.skipped);
  const averageScore = validResponses.length > 0 
    ? Math.round(validResponses.reduce((sum, r) => sum + (r.score || 50), 0) / validResponses.length)
    : 50;

  return {
    score: averageScore,
    feedback: {
      technicalSkills: {
        score: Math.max(averageScore - 10, 0),
        feedback: 'Technical analysis completed'
      },
      communicationSkills: {
        score: Math.min(averageScore + 5, 100),
        feedback: 'Communication assessment completed'
      },
      problemSolving: {
        score: averageScore,
        feedback: 'Problem-solving approach analyzed'
      },
      recommendations: [
        'Practice more coding problems',
        'Work on explaining technical concepts',
        'Focus on systematic problem-solving',
        'Review computer science fundamentals'
      ]
    }
  };
};

// Format utilities
export const formatTime = (seconds) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const formatFileSize = (bytes) => {
  if (!bytes) return 'N/A';
  return `${Math.round(bytes / 1024)}KB`;
};

// Supported languages configuration
export const SUPPORTED_LANGUAGES = [
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
    template: 'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello World");\n        System.out.println(solution());\n    }\n    \n    public static String solution() {\n        return "result";\n    }\n}',
    jdoodleLanguage: 'java',
    version: '4'
  },
  { 
    value: 'c', 
    label: 'C', 
    template: '#include <stdio.h>\n\nint main() {\n    printf("Hello World\\n");\n    return 0;\n}',
    jdoodleLanguage: 'c',
    version: '5'
  },
  { 
    value: 'cpp', 
    label: 'C++', 
    template: '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello World" << endl;\n    return 0;\n}',
    jdoodleLanguage: 'cpp',
    version: '5'
  },
  { 
    value: 'csharp', 
    label: 'C#', 
    template: 'using System;\n\nclass Program {\n    static void Main() {\n        Console.WriteLine("Hello World");\n    }\n}',
    jdoodleLanguage: 'csharp',
    version: '4'
  },
  { 
    value: 'php', 
    label: 'PHP', 
    template: '<?php\necho "Hello World\\n";\n?>',
    jdoodleLanguage: 'php',
    version: '4'
  },
  { 
    value: 'go', 
    label: 'Go', 
    template: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello World")\n}',
    jdoodleLanguage: 'go',
    version: '4'
  }
];