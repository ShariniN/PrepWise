// Enhanced CV Analysis API using Gemini 2.5 Flash directly
import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from "crypto";

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const validateInputs = (text1, text2) => {
  if (
    !text1 ||
    !text2 ||
    typeof text1 !== "string" ||
    typeof text2 !== "string"
  ) {
    throw new Error("Both inputs must be non-empty strings");
  }
  if (text1.length > 50000 || text2.length > 50000) {
    throw new Error("Input text too long (max 50,000 characters)");
  }
};

// Enhanced CS/Software Engineering specific keywords with weights
const CS_TECHNICAL_SKILLS = {
  // Core Programming Languages (High weight)
  programming_languages: {
    weight: 0.3,
    keywords: ['python', 'java', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'swift', 'kotlin', 'scala', 'ruby', 'php', 'c', 'r', 'matlab']
  },
  // Web Development (High weight for most internships)
  web_technologies: {
    weight: 0.25,
    keywords: ['react', 'angular', 'vue', 'nodejs', 'express', 'django', 'flask', 'spring', 'html', 'css', 'bootstrap', 'tailwind', 'next.js', 'nuxt.js']
  },
  // Data Structures & Algorithms (Critical for CS)
  cs_fundamentals: {
    weight: 0.2,
    keywords: ['data structures', 'algorithms', 'algorithm', 'binary tree', 'graph', 'hash table', 'linked list', 'array', 'sorting', 'searching', 'recursion', 'dynamic programming', 'big o', 'complexity analysis']
  },
  // Development Tools & Practices
  dev_tools: {
    weight: 0.15,
    keywords: ['git', 'github', 'gitlab', 'docker', 'kubernetes', 'ci/cd', 'jenkins', 'testing', 'unit testing', 'integration testing', 'agile', 'scrum', 'api', 'rest', 'graphql']
  },
  // Databases
  databases: {
    weight: 0.1,
    keywords: ['mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'firebase', 'sql', 'nosql', 'database design', 'orm']
  }
};

const NON_CS_INDICATORS = [
  'medical', 'doctor', 'physician', 'nurse', 'healthcare', 'hospital', 'clinic', 'patient', 'surgery', 'diagnosis',
  'law', 'lawyer', 'attorney', 'legal', 'court', 'litigation', 'paralegal', 'contract law', 'criminal law',
  'teacher', 'educator', 'instructor', 'professor', 'school', 'classroom', 'curriculum', 'pedagogy',
  'retail', 'sales associate', 'cashier', 'store manager', 'customer service representative', 'merchandising',
  'chef', 'cook', 'kitchen', 'restaurant', 'food service', 'culinary', 'catering', 'menu planning',
  'accountant', 'bookkeeper', 'financial analyst', 'audit', 'tax preparation', 'payroll', 'accounting principles',
  'marketing coordinator', 'social media manager', 'content creator', 'copywriter', 'brand management',
  'hr manager', 'human resources', 'recruiter', 'talent acquisition', 'employee relations',
  'administrative assistant', 'secretary', 'office manager', 'receptionist', 'data entry',
  'warehouse', 'logistics', 'driver', 'delivery', 'shipping', 'inventory management'
];

// Function to create a hash of the resume text for comparison
function createResumeHash(resumeText) {
  return crypto.createHash('sha256').update(resumeText.trim()).digest('hex');
}

// Advanced technical skill matching for precise percentage calculation
const calculateTechnicalMatch = (resumeText, jobDesc) => {
  const resumeLower = resumeText.toLowerCase();
  const jobDescLower = jobDesc.toLowerCase();
  
  let totalScore = 0;
  let maxPossibleScore = 0;
  
  // Analyze each category
  for (const [category, config] of Object.entries(CS_TECHNICAL_SKILLS)) {
    const requiredSkills = config.keywords.filter(skill => 
      jobDescLower.includes(skill.toLowerCase())
    );
    
    if (requiredSkills.length === 0) continue;
    
    const candidateSkills = config.keywords.filter(skill => 
      resumeLower.includes(skill.toLowerCase())
    );
    
    const matchingSkills = requiredSkills.filter(skill => 
      candidateSkills.includes(skill)
    );
    
    const categoryScore = (matchingSkills.length / requiredSkills.length) * config.weight;
    totalScore += categoryScore;
    maxPossibleScore += config.weight;
  }
  
  return maxPossibleScore > 0 ? (totalScore / maxPossibleScore) : 0;
};

// Enhanced similarity scoring with improved consistency
const getSimilarityScore = async (resumeText, jobDesc) => {
  try {
    validateInputs(resumeText, jobDesc);

    // Pre-screening for non-CS roles
    const jobDescLower = jobDesc.toLowerCase();
    const resumeLower = resumeText.toLowerCase();
    
    const hasNonCSIndicators = NON_CS_INDICATORS.some(indicator => 
      jobDescLower.includes(indicator.toLowerCase())
    );

    const hasCSIndicators = Object.values(CS_TECHNICAL_SKILLS)
      .flatMap(category => category.keywords)
      .some(keyword => jobDescLower.includes(keyword.toLowerCase()));

    if (hasNonCSIndicators && !hasCSIndicators) {
      console.log("Non-CS role detected, returning 0 similarity");
      return 0;
    }

    // Get technical match score as baseline
    const technicalMatchScore = calculateTechnicalMatch(resumeText, jobDesc);
    
    const maxLength = 4000;
    const truncatedResume = resumeText.length > maxLength
      ? resumeText.substring(0, maxLength) + "..."
      : resumeText;
    const truncatedJobDesc = jobDesc.length > maxLength
      ? jobDesc.substring(0, maxLength) + "..."
      : jobDesc;

    const prompt = `You are an expert technical recruiter specializing in Computer Science and Software Engineering internships at top tech companies.

CRITICAL: First verify this is a CS/Software Engineering internship role.

CS/SOFTWARE ENGINEERING ROLES include:
- Software Engineer/Developer Intern (any level: Frontend, Backend, Full-Stack)
- Computer Science Intern, Programming Intern
- Web Developer Intern, Mobile Developer Intern
- Data Engineer/Scientist Intern, ML/AI Engineer Intern
- DevOps Engineer Intern, QA/Test Engineer Intern
- Any role requiring programming, algorithms, or software development

NON-CS ROLES (return 0 immediately):
- Any role not requiring programming or computer science knowledge
- Medical, Legal, Education, Retail, Food Service, Marketing, Sales, HR, Administrative

If NOT a CS/Software Engineering role, return: 0.0

For CS/SOFTWARE ENGINEERING roles, evaluate the candidate using this precise framework:

EVALUATION CRITERIA (weights shown):
1. Programming Languages Match (30%): Does candidate know required languages?
2. CS Fundamentals (25%): Data structures, algorithms, problem-solving ability
3. Relevant Projects (20%): Technical projects demonstrating coding skills
4. Development Tools/Practices (15%): Git, testing, development methodologies
5. Educational Foundation (10%): CS degree, relevant coursework, certifications

SCORING GUIDE:
- 0.0-0.2: Minimal CS background, major gaps in required skills
- 0.2-0.4: Some CS knowledge but missing key requirements
- 0.4-0.6: Decent foundation, moderate skill gaps to address
- 0.6-0.8: Strong candidate with minor areas for improvement
- 0.8-1.0: Excellent match, highly qualified for the internship

Resume:
${truncatedResume}

Job Description:
${truncatedJobDesc}

Consider the technical match baseline score: ${technicalMatchScore.toFixed(2)}

Return ONLY a decimal between 0.0-1.0 representing the overall match quality:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const scoreText = response.text().trim();
    const aiScore = parseFloat(scoreText);

    if (isNaN(aiScore) || aiScore < 0 || aiScore > 1) {
      console.warn("Invalid AI score, using technical match score");
      return Math.max(0, Math.min(1, technicalMatchScore));
    }

    // Blend AI score with technical match for consistency
    const finalScore = (aiScore * 0.7) + (technicalMatchScore * 0.3);
    return Math.max(0, Math.min(1, finalScore));

  } catch (err) {
    console.error("Error in getSimilarityScore:", err.message);
    return calculateTechnicalMatch(resumeText, jobDesc);
  }
};

// Enhanced fallback with CS focus
const getFallbackSimilarity = async (resumeText, jobDesc) => {
  return calculateTechnicalMatch(resumeText, jobDesc);
};

// Extract technologies from resume using Gemini 2.5 Flash
const extractTechnologiesFromResume = async (resumeText) => {
  try {
    const prompt = `Analyze this resume and extract ONLY technical skills relevant to Computer Science/Software Engineering.

Focus on:
- Programming languages (Python, Java, JavaScript, C++, etc.)
- Web frameworks (React, Angular, Vue, Django, Spring, etc.)
- Development tools (Git, Docker, Jenkins, etc.)
- Databases (MySQL, MongoDB, PostgreSQL, etc.)
- CS concepts (Data Structures, Algorithms, OOP, etc.)

Resume text:
${resumeText}

Return JSON array with format:
[
  {"name": "Python", "category": "Programming Languages", "confidenceLevel": 8},
  {"name": "React", "category": "Web Frameworks", "confidenceLevel": 6}
]

Categories: "Programming Languages", "Web Frameworks", "Development Tools", "Databases", "CS Concepts", "Other Technical"

Only include technical skills relevant to software development. Return only the JSON array.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const content = response.text().trim();
    
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const technologies = JSON.parse(jsonMatch[0]);
      return technologies.filter(tech => 
        tech.name && 
        tech.category && 
        tech.confidenceLevel >= 1 && 
        tech.confidenceLevel <= 10
      );
    }
    
    return [];
  } catch (error) {
    console.error("Technology extraction error:", error);
    return [];
  }
};

// Helper function to clean and parse JSON response
const parseJSONResponse = (responseText) => {
  try {
    let cleanText = responseText.replace(/```json\s*|```\s*/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = jsonMatch[0];
    }
    return JSON.parse(cleanText);
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${error.message}`);
  }
};

// CS-specific structured recommendations
const getStructuredRecommendations = async (resumeText, jobDesc) => {
  try {
    validateInputs(resumeText, jobDesc);

    const maxLength = 4500;
    const truncatedResume = resumeText.length > maxLength
      ? resumeText.substring(0, maxLength) + "..."
      : resumeText;
    const truncatedJobDesc = jobDesc.length > maxLength
      ? jobDesc.substring(0, maxLength) + "..."
      : jobDesc;

    const prompt = `You are a senior technical recruiter at top tech companies (Google, Meta, Amazon, Microsoft, Apple) specializing in Computer Science internships.

VERIFICATION STEP: Confirm this is a CS/Software Engineering internship.

CS/SOFTWARE ENGINEERING INTERNSHIPS:
- Software Engineer Intern, Developer Intern, Programming Intern
- Web/Mobile/Full-Stack Developer Intern
- Data Engineer/Scientist Intern, ML Engineer Intern
- Any internship requiring programming, algorithms, or software development skills

NON-CS ROLES: Medical, Legal, Education, Business, Marketing, Sales, HR, etc.

If this is NOT a CS/Software Engineering internship, respond: NON_CS_ROLE

For CS/SOFTWARE ENGINEERING internships, provide analysis in this exact JSON format:

{
  "strengths": [
    "Specific CS/programming strengths from their background",
    "Technical projects or coursework that demonstrate coding ability", 
    "Programming languages they know that match job requirements",
    "Relevant CS education, certifications, or technical experience"
  ],
  "contentWeaknesses": [
    "Missing specific programming languages from job posting (name exact languages)",
    "Lack of demonstrated CS fundamentals (data structures, algorithms)",
    "Missing technical projects with quantified impact and GitHub links",
    "Insufficient software development methodology knowledge (Agile, testing, etc.)",
    "No evidence of collaborative coding or version control experience",
    "Missing relevant CS coursework or technical certifications"
  ],
  "structureWeaknesses": [
    "Technical skills section not optimized (should categorize Languages, Frameworks, Tools)",
    "Missing GitHub portfolio and technical project links",
    "Resume not formatted for technical recruiting and ATS systems",
    "Project descriptions lack technical depth and implementation details",
    "Missing CS-relevant keywords from job posting throughout resume"
  ],
  "contentRecommendations": [
    "Learn specific technologies from job posting: [list exact requirements]",
    "Build 2-3 substantial coding projects: web apps, algorithms, or systems with GitHub repos",
    "Add CS coursework: Data Structures, Algorithms, Software Engineering, Database Systems",
    "Include quantified technical achievements with metrics and impact",
    "Gain practical experience: open source contributions, coding competitions, hackathons",
    "Add technical certifications relevant to role requirements",
    "Demonstrate CS fundamentals: solve coding problems, implement algorithms, build systems"
  ],
  "structureRecommendations": [
    "Create technical resume sections: Contact, Summary, Education, Technical Skills, Projects, Experience",
    "Categorize technical skills: Languages, Frameworks, Databases, Tools with proficiency levels",
    "Add essential links: GitHub profile, LinkedIn, personal portfolio/website",
    "Format for technical recruiting: ATS-friendly, consistent formatting, CS-focused keywords",
    "Structure project descriptions: Name | Tech Stack | Description | GitHub | Live Demo",
    "Use technical action verbs: Developed, Implemented, Architected, Optimized with specific outcomes"
  ]
}

Resume:
${truncatedResume}

Job Description:
${truncatedJobDesc}

Focus specifically on CS/Software Engineering internship requirements. Be precise about technical gaps and provide actionable recommendations for improving technical qualifications.`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text().trim();

    if (responseText === "NON_CS_ROLE" || responseText.includes("NON_CS_ROLE")) {
      return {
        isNonTechRole: true,
        message: "This position is not a Computer Science or Software Engineering internship. Our analysis tool is specifically designed for technical CS roles requiring programming and software development skills. Please provide a CS/Software Engineering internship job description for accurate technical resume optimization."
      };
    }

    try {
      const structuredData = parseJSONResponse(responseText);
      
      const result = {
        isNonTechRole: false,
        strengths: Array.isArray(structuredData.strengths) && structuredData.strengths.length > 0 
          ? structuredData.strengths 
          : getDefaultCSStrengths(),
        contentWeaknesses: Array.isArray(structuredData.contentWeaknesses) && structuredData.contentWeaknesses.length > 0
          ? structuredData.contentWeaknesses 
          : getDefaultCSContentWeaknesses(),
        structureWeaknesses: Array.isArray(structuredData.structureWeaknesses) && structuredData.structureWeaknesses.length > 0
          ? structuredData.structureWeaknesses 
          : getDefaultCSStructureWeaknesses(),
        contentRecommendations: Array.isArray(structuredData.contentRecommendations) && structuredData.contentRecommendations.length > 0
          ? structuredData.contentRecommendations 
          : getDefaultCSContentRecommendations(),
        structureRecommendations: Array.isArray(structuredData.structureRecommendations) && structuredData.structureRecommendations.length > 0
          ? structuredData.structureRecommendations 
          : getDefaultCSStructureRecommendations()
      };

      return result;
    } catch (parseError) {
      console.error("JSON parsing failed:", parseError.message);
      return getDefaultCSRecommendations();
    }

  } catch (err) {
    console.error("Structured recommendations error:", err.message);
    return getDefaultCSRecommendations();
  }
};

// Default CS-specific recommendations
const getDefaultCSStrengths = () => [
  "Demonstrates foundational computer science education and technical coursework",
  "Shows programming aptitude and problem-solving mindset suitable for software development",
  "Has academic exposure to CS concepts and software engineering principles",
  "Displays learning initiative in technical skills and programming languages"
];

const getDefaultCSContentWeaknesses = () => [
  "Missing core programming languages commonly required (Python, Java, JavaScript, C++)",
  "Lacks demonstrated CS fundamentals: data structures, algorithms, complexity analysis",
  "No visible coding projects with technical implementation details and GitHub repositories",
  "Missing practical software development experience with frameworks and development tools",
  "Insufficient evidence of version control usage (Git) and collaborative programming",
  "No quantified technical achievements or measurable project impact"
];

const getDefaultCSStructureWeaknesses = () => [
  "Technical skills section not organized for CS recruiting (should separate Languages, Frameworks, Tools)",
  "Missing essential technical links: GitHub profile, coding portfolio, technical blog",
  "Resume format not optimized for software engineering roles and technical ATS systems",
  "Project descriptions lack CS-specific technical depth and implementation details",
  "Missing CS-relevant keywords and technical terminology from job requirements"
];

const getDefaultCSContentRecommendations = () => [
  "Master fundamental programming languages: Python or Java for backend, JavaScript for web development",
  "Build substantial coding projects: full-stack applications, algorithms implementation, data structures projects",
  "Study CS fundamentals: implement common data structures (trees, graphs, hash tables) and sorting algorithms",
  "Complete relevant coursework: Data Structures & Algorithms, Software Engineering, Database Systems, Computer Networks",
  "Create technical portfolio: solve 100+ coding problems on LeetCode, contribute to open source projects",
  "Gain practical experience: build web applications, participate in hackathons, complete coding bootcamp modules",
  "Add measurable achievements: 'Built REST API handling 1000+ requests/sec', 'Optimized algorithm reducing runtime by 50%'"
];

const getDefaultCSStructureRecommendations = () => [
  "Use CS-focused resume template: Contact, Technical Summary, Education, Technical Skills, Projects, Experience",
  "Organize technical skills by category: 'Languages: Python, Java, C++', 'Web: React, Node.js', 'Databases: MySQL, MongoDB', 'Tools: Git, Docker'",
  "Add technical links prominently: GitHub (github.com/username), LinkedIn, personal website or portfolio",
  "Format for technical ATS: clean layout, standard fonts, CS keywords, consistent structure, PDF and .docx versions",
  "Structure project entries: 'Project Name | Tech Stack Used | Technical Description | GitHub Link | Live Demo'",
  "Use CS-specific action verbs: 'Implemented', 'Architected', 'Optimized', 'Debugged' with quantified technical outcomes"
];

const getDefaultCSRecommendations = () => ({
  isNonTechRole: false,
  strengths: getDefaultCSStrengths(),
  contentWeaknesses: getDefaultCSContentWeaknesses(),
  structureWeaknesses: getDefaultCSStructureWeaknesses(),
  contentRecommendations: getDefaultCSContentRecommendations(),
  structureRecommendations: getDefaultCSStructureRecommendations()
});

// Legacy function for backward compatibility
const getImprovementSuggestions = async (resumeText, jobDesc) => {
  try {
    const structured = await getStructuredRecommendations(resumeText, jobDesc);
    
    if (structured.isNonTechRole) {
      return structured.message;
    }

    let suggestions = "**Technical Strengths:**\n";
    suggestions += structured.strengths.map(s => `• ${s}`).join('\n') + '\n\n';
    
    suggestions += "**Critical Technical Gaps:**\n";
    suggestions += structured.contentWeaknesses.concat(structured.structureWeaknesses)
      .map(w => `• ${w}`).join('\n') + '\n\n';
    
    suggestions += "**CS Internship Optimization Recommendations:**\n";
    suggestions += structured.contentRecommendations.concat(structured.structureRecommendations)
      .map(r => `• ${r}`).join('\n');

    return suggestions;
  } catch (err) {
    console.error("Legacy suggestions error:", err.message);
    return "Unable to generate CS-specific recommendations. Please ensure both resume and job description are for Computer Science or Software Engineering internships.";
  }
};

// Improved match percentage calculation with better consistency
const calculateMatchPercentage = (similarityScore) => {
  if (similarityScore === 0) return 0;
  
  // More linear and predictable mapping
  // 0.0-0.2 -> 0-20%
  // 0.2-0.4 -> 20-40% 
  // 0.4-0.6 -> 40-60%
  // 0.6-0.8 -> 60-80%
  // 0.8-1.0 -> 80-100%
  
  const percentage = Math.round(similarityScore * 100);
  return Math.max(0, Math.min(100, percentage));
};

// Enhanced main analysis function
const analyzeResumeMatch = async (resumeText, jobDesc) => {
  try {
    console.log("Starting CS internship-specific resume analysis...");

    const [similarity, structuredAnalysis] = await Promise.all([
      getSimilarityScore(resumeText, jobDesc).catch((err) => {
        console.error("Similarity calculation failed:", err.message);
        return calculateTechnicalMatch(resumeText, jobDesc);
      }),
      getStructuredRecommendations(resumeText, jobDesc).catch((err) => {
        console.error("Structured analysis failed:", err.message);
        return getDefaultCSRecommendations();
      }),
    ]);

    console.log("Similarity score:", similarity.toFixed(3));
    console.log("Analysis completed for CS role:", !structuredAnalysis.isNonTechRole);

    if (structuredAnalysis.isNonTechRole) {
      return {
        similarityScore: 0,
        matchPercentage: 0,
        isNonTechRole: true,
        message: structuredAnalysis.message,
        timestamp: new Date().toISOString(),
        warning: "Non-CS role detected - analysis requires CS/Software Engineering internship"
      };
    }

    const matchPercentage = calculateMatchPercentage(similarity);

    return {
      similarityScore: Number(similarity.toFixed(3)),
      matchPercentage,
      isNonTechRole: false,
      strengths: structuredAnalysis.strengths || [],
      contentWeaknesses: structuredAnalysis.contentWeaknesses || [],
      structureWeaknesses: structuredAnalysis.structureWeaknesses || [],
      contentRecommendations: structuredAnalysis.contentRecommendations || [],
      structureRecommendations: structuredAnalysis.structureRecommendations || [],
      timestamp: new Date().toISOString(),
      technicalMatchDetails: {
        programmingLanguages: calculateCategoryMatch(resumeText, jobDesc, CS_TECHNICAL_SKILLS.programming_languages),
        webTechnologies: calculateCategoryMatch(resumeText, jobDesc, CS_TECHNICAL_SKILLS.web_technologies),
        csFundamentals: calculateCategoryMatch(resumeText, jobDesc, CS_TECHNICAL_SKILLS.cs_fundamentals),
        devTools: calculateCategoryMatch(resumeText, jobDesc, CS_TECHNICAL_SKILLS.dev_tools),
        databases: calculateCategoryMatch(resumeText, jobDesc, CS_TECHNICAL_SKILLS.databases)
      }
    };
  } catch (err) {
    console.error("Error in analyzeResumeMatch:", err.message);

    return {
      similarityScore: 0,
      matchPercentage: 0,
      isNonTechRole: false,
      ...getDefaultCSRecommendations(),
      timestamp: new Date().toISOString(),
      error: err.message,
    };
  }
};

// Helper function to calculate category-specific matches
const calculateCategoryMatch = (resumeText, jobDesc, category) => {
  const resumeLower = resumeText.toLowerCase();
  const jobDescLower = jobDesc.toLowerCase();
  
  const requiredSkills = category.keywords.filter(skill => 
    jobDescLower.includes(skill.toLowerCase())
  );
  
  const candidateSkills = category.keywords.filter(skill => 
    resumeLower.includes(skill.toLowerCase())
  );
  
  const matchingSkills = requiredSkills.filter(skill => 
    candidateSkills.includes(skill)
  );
  
  return {
    required: requiredSkills.length,
    matched: matchingSkills.length,
    percentage: requiredSkills.length > 0 ? Math.round((matchingSkills.length / requiredSkills.length) * 100) : 0,
    matchedSkills: matchingSkills,
    missingSkills: requiredSkills.filter(skill => !matchingSkills.includes(skill))
  };
};

// Export functions
export {
  getSimilarityScore,
  getImprovementSuggestions,
  getStructuredRecommendations,
  analyzeResumeMatch,
  extractTechnologiesFromResume,
  createResumeHash,
  calculateTechnicalMatch,
  calculateMatchPercentage
};