import React, { useState, useCallback, useEffect } from "react";
import ScoreBreakdown from './components/ScoreBreakdown';
import SkillsAssessment from './components/SkillsAssessment';
import CircularProgress from './components/CircularProgress';
import StructuredRecommendations from './components/StructuredRecommendations';
import { CheckCircle, XCircle, FileText, Target, BarChart3, Star, Upload, Plus, Trash2, Save, RefreshCw, User } from "lucide-react";
import AppShell from "../../components/AppShell";
import { useNavigate } from "react-router-dom";
import { backendUrl } from '../../api/client';

// API Configuration
const API_BASE_URL = backendUrl;

const API_ENDPOINTS = {
  analyzeResume: `${API_BASE_URL}/api/analyze/analyze-resume`,
  saveAnalysis: `${API_BASE_URL}/api/analyze/save`,
  getCurrentCV: `${API_BASE_URL}/api/user/cv`,
};

const CVAnalyzer = () => {
  const navigate = useNavigate();
  // State management
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescriptions, setJobDescriptions] = useState([""]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [currentView, setCurrentView] = useState('analysis');
  const [savedIndices, setSavedIndices] = useState([]);

  // Profile CV state
  const [profileCV, setProfileCV] = useState(null);
  const [loadingProfileCV, setLoadingProfileCV] = useState(false);
  const [useProfileCV, setUseProfileCV] = useState(false);
  const [cvUploadMode, setCvUploadMode] = useState('check'); // 'check', 'upload', 'profile'

  // Check for profile CV on component mount
  useEffect(() => {
    checkForProfileCV();
  }, []);

  // Check if user has a CV in their profile
  const checkForProfileCV = async () => {
    setLoadingProfileCV(true);
    try {
      const response = await fetch(API_ENDPOINTS.getCurrentCV, {
        method: 'GET',
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setProfileCV(data.data);
          setCvUploadMode('profile');
        } else {
          setCvUploadMode('upload');
        }
      } else if (response.status === 404) {
        // No CV found in profile
        setCvUploadMode('upload');
      } else {
        throw new Error('Failed to check profile CV');
      }
    } catch (err) {
      console.error('Error checking profile CV:', err);
      setCvUploadMode('upload');
    } finally {
      setLoadingProfileCV(false);
    }
  };

  // Handle using profile CV
  const handleUseProfileCV = () => {
    setUseProfileCV(true);
    setResumeFile(null);
    setError(null);
  };

  // Handle uploading new CV
  const handleUploadNewCV = () => {
    setUseProfileCV(false);
    setResumeFile(null);
    setError(null);
  };

  // File validation
  const validateFile = (file) => {
    if (!file) return { valid: false, error: "No file selected" };

    if (file.type !== "application/pdf") {
      return { valid: false, error: "Only PDF files are allowed" };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { valid: false, error: "File size must be less than 10MB" };
    }

    return { valid: true };
  };

  // Handle file selection
  const handleFileChange = (file) => {
    const validation = validateFile(file);
    if (!validation.valid) {
      setError(validation.error);
      setResumeFile(null);
      return;
    }

    setError(null);
    setResumeFile(file);
    setUseProfileCV(false);
  };

  // Drag handlers
  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, []);

  // Job description handlers
  const handleJDChange = (index, value) => {
    const updated = [...jobDescriptions];
    updated[index] = value;
    setJobDescriptions(updated);

    if (error && value.trim()) {
      setError(null);
    }
  };

  const addJD = () => {
    if (jobDescriptions.length < 5) {
      setJobDescriptions([...jobDescriptions, ""]);
    }
  };

  const removeJD = (index) => {
    if (jobDescriptions.length > 1) {
      setJobDescriptions(jobDescriptions.filter((_, i) => i !== index));
    }
  };

  // Form validation
  const validateForm = () => {
    if (!useProfileCV && !resumeFile) {
      setError("Please upload a PDF resume or use your profile CV");
      return false;
    }

    if (useProfileCV && !profileCV) {
      setError("No profile CV available. Please upload a resume.");
      return false;
    }

    if (jobDescriptions.some((jd) => jd.trim() === "")) {
      setError("Please fill in all job descriptions");
      return false;
    }

    if (jobDescriptions.some((jd) => jd.trim().length < 50)) {
      setError("Job descriptions should be at least 50 characters long");
      return false;
    }

    return true;
  };

  const handleAnalyze = async () => {
    setError(null);

    if (!validateForm()) return;

    setLoading(true);
    setResults([]);

    try {
      const formData = new FormData();

      // Add job descriptions
      formData.append('jobDescriptions', JSON.stringify(jobDescriptions.filter(jd => jd.trim())));

      // Add CV source information
      if (useProfileCV) {
        formData.append('useProfileCV', 'true');
      } else {
        formData.append('resume', resumeFile);
      }

      const response = await fetch(API_ENDPOINTS.analyzeResume, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            const errorData = await response.json();
            errorMessage = errorData.message || errorData.error || errorMessage;
          } else {
            const errorText = await response.text();
            if (errorText) {
              errorMessage = errorText;
            }
          }
        } catch (parseError) {
          console.warn("Could not parse error response:", parseError);
        }

        throw new Error(errorMessage);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Server returned non-JSON response');
      }

      const responseText = await response.text();

      if (!responseText.trim()) {
        throw new Error('Server returned empty response');
      }

      let data;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error('Invalid JSON response from server');
      }

      if (!data || !data.analysis) {
        throw new Error('Invalid response format: missing analysis data');
      }

      const resumeHash = data.resumeHash || `resume_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      setResumeData({
        resumeText: data.resumeText || (useProfileCV ? 'Profile CV' : `Resume: ${resumeFile?.name}`),
        resumeHash: resumeHash,
        jobDescriptions: jobDescriptions.filter(jd => jd.trim()),
        extractedTechnologies: data.extractedTechnologies || [],
        // The AI could not extract technologies right now (not the same as "none on the CV")
        technologiesUnavailable: !!data.technologiesUnavailable,
        usedProfileCV: useProfileCV,
        metadata: {
          fileName: useProfileCV ? profileCV?.fileName : resumeFile?.name,
          analysisDate: new Date().toISOString(),
          totalTechnologies: (data.extractedTechnologies || []).length
        }
      });

      setResults(data.analysis);

    } catch (err) {
      console.error("Analyze Error:", err);

      let userMessage = "Failed to analyze resume. ";

      if (err.message.includes('404')) {
        userMessage += "The analysis service is not available. Please check if the backend server is running on the correct port.";
      } else if (err.message.includes('401') || err.message.includes('403')) {
        userMessage += "You are not authorized. Please log in again.";
      } else if (err.message.includes('500')) {
        userMessage += "Server error occurred. Please try again later.";
      } else if (err.message.includes('Failed to fetch') || err.message.includes('TypeError: NetworkError')) {
        userMessage += "Network error. Please check your connection and ensure the backend server is running.";
      } else {
        userMessage += err.message;
      }

      setError(userMessage);
    } finally {
      setLoading(false);
    }
  };

const handleSaveIndividualAnalysis = async (index) => {
  if ((!resumeFile && !useProfileCV) || !results[index] || savedIndices.includes(index)) return;

  try {
    const saveData = {
      // Use resumeText instead of resumeName - this is what the server expects
      resumeText: resumeData?.resumeText || (useProfileCV ? 'Profile CV content' : resumeFile?.name || 'Resume content'),
      jobDescriptions: jobDescriptions.filter(jd => jd.trim()),
      results: [results[index]], // Send only the specific result we're saving
      resumeHash: resumeData?.resumeHash,
      usedProfileCV: useProfileCV,
      extractedTechnologies: resumeData?.extractedTechnologies || [] // Include extracted technologies
    };

    const response = await fetch(API_ENDPOINTS.saveAnalysis, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(saveData)
    });

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      try {
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json();
          errorMessage = errorData.message || errorData.error || errorMessage;
        }
      } catch (parseError) {
        console.warn("Could not parse save error response:", parseError);
      }

      throw new Error(errorMessage);
    }

    await response.json();

    setSavedIndices((prev) => [...prev, index]);

  } catch (err) {
    console.error("Save error:", err);
    setError(`Error saving analysis: ${err.message}`);
    setTimeout(() => setError(''), 5000);
  }
};

  // Navigate to Skills Assessment
  const handleNavigateToSkillsAssessment = () => {
    if (!resumeData) {
      setError("No resume analysis available for skills assessment. Please analyze your resume first.");
      return;
    }

    if (!resumeData.extractedTechnologies || resumeData.extractedTechnologies.length === 0) {
      setError("No technologies were extracted from your resume. Please ensure your resume contains technical skills and try analyzing again.");
      return;
    }

    setCurrentView('skills');
  };

  // Clear all data
  const handleClear = () => {
    setResumeFile(null);
    setJobDescriptions([""]);
    setResults([]);
    setError(null);
    setResumeData(null);
    setSavedIndices([]);
    setCurrentView('analysis');
    setUseProfileCV(false);
  };

  // Handle back navigation
  const handleBackFromSkills = () => {
    setCurrentView('analysis');
  };

  // Render CV source selection
  const renderCVSourceSelection = () => {
    if (cvUploadMode === 'check' || loadingProfileCV) {
      return (
        <div className="bg-surface rounded-3xl border border-line p-4 md:p-6 shadow-soft">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto text-ink-muted bg-sand rounded-2xl flex items-center justify-center mb-4">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <p className="text-ink-2">Checking for existing CV...</p>
            </div>
          </div>
        </div>
      );
    }

    if (cvUploadMode === 'profile' && profileCV) {
      return (
        <div className="bg-surface rounded-3xl border border-line p-4 md:p-6 shadow-soft">
          <label className="block font-bold mb-4 text-ink">
            Choose CV Source
          </label>

          {/* Profile CV Option */}
          <div className={`p-4 rounded-2xl border-2 cursor-pointer transition-all mb-4 ${
            useProfileCV
              ? 'border-success-500 bg-success-50 shadow-soft'
              : 'border-line bg-surface hover:border-line hover:shadow-md'
          }`} onClick={handleUseProfileCV}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-soft ${
                useProfileCV ? 'bg-success-500 text-white' : 'bg-sand text-ink-2'
              }`}>
                <User className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink">Use Profile CV</h3>
                <p className="text-sm text-ink-2">{profileCV.fileName}</p>
                <p className="text-xs text-ink-muted">
                  Uploaded: {new Date(profileCV.uploadedAt).toLocaleDateString()}
                  {profileCV.fileSize && ` • ${(profileCV.fileSize / 1024).toFixed(1)} KB`}
                </p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                useProfileCV ? 'border-success-500 bg-success-500' : 'border-line'
              }`}>
                {useProfileCV && <div className="w-2 h-2 bg-surface rounded-full"></div>}
              </div>
            </div>
          </div>

          {/* Upload New CV Option */}
          <div className={`p-4 rounded-2xl border-2 cursor-pointer transition-all ${
            !useProfileCV && !resumeFile
              ? 'border-line bg-surface hover:border-line hover:shadow-md'
              : !useProfileCV && resumeFile
              ? 'border-success-500 bg-success-50 shadow-soft'
              : 'border-line bg-surface hover:border-line hover:shadow-md'
          }`} onClick={handleUploadNewCV}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-soft ${
                !useProfileCV && resumeFile
                  ? 'bg-success-500 text-white'
                  : 'bg-sand text-ink-2'
              }`}>
                <Upload className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-ink">Upload New CV</h3>
                <p className="text-sm text-ink-2">
                  {resumeFile ? resumeFile.name : 'Choose a different PDF file'}
                </p>
                {resumeFile && (
                  <p className="text-xs text-ink-muted">
                    {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                !useProfileCV && resumeFile ? 'border-success-500 bg-success-500' : 'border-line'
              }`}>
                {!useProfileCV && resumeFile && <div className="w-2 h-2 bg-surface rounded-full"></div>}
              </div>
            </div>
          </div>

          {/* File Upload Area (only show when upload new is selected) */}
          {!useProfileCV && (
            <div className="mt-4">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-all ${
                  dragActive
                    ? "border-primary-400 bg-primary-50 scale-105 shadow-soft"
                    : resumeFile
                    ? "border-success-500 bg-success-50 shadow-soft"
                    : "border-line hover:border-line hover:bg-sand hover:shadow-md"
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept=".pdf"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => handleFileChange(e.target.files[0])}
                />

                {resumeFile ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 mx-auto text-success-600 bg-success-100 rounded-2xl flex items-center justify-center shadow-soft">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-success-700 truncate">{resumeFile.name}</p>
                    <p className="text-sm text-success-600">
                      {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-12 h-12 mx-auto text-ink-muted bg-sand rounded-2xl flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-ink-2">
                        <span className="font-semibold text-primary-600">
                          Click to upload
                        </span>{" "}
                        or drag and drop
                      </p>
                      <p className="text-sm text-ink-muted mt-1">PDF files up to 10MB</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Default upload mode when no profile CV exists
    return (
      <div className="bg-surface rounded-3xl border border-line p-4 md:p-6 shadow-soft">
        <label className="block font-bold mb-4 text-ink">
          Upload Resume (PDF only)
        </label>
        <div
          className={`relative border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-all ${
            dragActive
              ? "border-primary-400 bg-primary-50 scale-105 shadow-soft"
              : resumeFile
              ? "border-success-500 bg-success-50 shadow-soft"
              : "border-line hover:border-line hover:bg-sand hover:shadow-md"
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            type="file"
            accept=".pdf"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            onChange={(e) => handleFileChange(e.target.files[0])}
          />

          {resumeFile ? (
            <div className="space-y-3">
              <div className="w-12 h-12 mx-auto text-success-600 bg-success-100 rounded-2xl flex items-center justify-center shadow-soft">
                <CheckCircle className="w-6 h-6" />
              </div>
              <p className="font-semibold text-success-700 truncate">{resumeFile.name}</p>
              <p className="text-sm text-success-600">
                {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto text-ink-muted bg-sand rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-ink-2">
                  <span className="font-semibold text-primary-600">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </p>
                <p className="text-sm text-ink-muted mt-1">PDF files up to 10MB</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render Skills Assessment view
  if (currentView === 'skills') {
    return (
      <SkillsAssessment
        resumeHash={resumeData?.resumeHash}
        extractedTechnologies={resumeData?.extractedTechnologies || []}
        onBack={handleBackFromSkills}
      />
    );
  }

  return (
    <AppShell
      width="wide"
      eyebrow="AI-Powered Analysis"
      title="CV Analyzer"
      subtitle="Upload your resume and compare it against job descriptions"
    >
      <div>
      <div className="grid items-start gap-6 lg:grid-cols-2">

        {/* Left Sidebar - 50% width on desktop */}
        <div className="min-w-0">
          <div>
            <div className="space-y-6 md:space-y-8">
              {/* Error Display */}
              {error && (
                <div className="bg-danger-50 border border-danger-100 text-danger-700 px-4 py-4 rounded-2xl shadow-soft animate-pulse">
                  <div className="flex items-start">
                    <XCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-sm leading-relaxed">{error}</span>
                  </div>
                </div>
              )}

              {/* CV Source Selection */}
              {renderCVSourceSelection()}

              {/* Job Descriptions */}
              <div className="bg-surface rounded-3xl border border-line p-4 md:p-6 shadow-soft">
                <div className="flex justify-between items-center mb-4">
                  <label className="block font-bold text-ink">
                    Job Descriptions
                  </label>
                  <span className="text-sm text-ink-muted bg-surface px-3 py-1 rounded-full shadow-sm border border-line font-medium">
                    {jobDescriptions.length}/5
                  </span>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                  {jobDescriptions.map((jd, index) => (
                    <div key={index} className="relative">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <textarea
                            className="w-full p-4 border border-line rounded-2xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all resize-none shadow-sm hover:shadow-md bg-surface"
                            rows="4"
                            placeholder={`Enter job description ${index + 1}...`}
                            value={jd}
                            onChange={(e) => handleJDChange(index, e.target.value)}
                          />
                          <div className="flex justify-between mt-2">
                            <span className="text-xs text-ink-muted font-medium bg-sand px-2 py-1 rounded">
                              JD {index + 1}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded ${
                                jd.length < 50
                                  ? "text-sun-600 bg-sun-100"
                                  : "text-success-600 bg-success-100"
                              }`}
                            >
                              {jd.length} chars
                            </span>
                          </div>
                        </div>

                        {jobDescriptions.length > 1 && (
                          <button
                            onClick={() => removeJD(index)}
                            className="self-start mt-1 p-2 text-danger-500 hover:text-danger-700 hover:bg-danger-50 rounded-2xl transition-all shadow-sm hover:shadow-md"
                            title="Remove this job description"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {jobDescriptions.length < 5 && (
                  <button
                    onClick={addJD}
                    className="w-full mt-4 p-3 text-sm bg-surface text-primary-700 border-2 border-primary-200 rounded-2xl hover:bg-primary-50 transition-all font-medium shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add Another Job Description
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col gap-3">
                <button
                  onClick={handleAnalyze}
                  disabled={
                    loading ||
                    (!useProfileCV && !resumeFile) ||
                    (useProfileCV && !profileCV) ||
                    jobDescriptions.some((jd) => jd.trim() === "")
                  }
                  className={`w-full px-6 py-4 rounded-2xl font-bold transition-all text-lg shadow-soft ${
                    loading ||
                    (!useProfileCV && !resumeFile) ||
                    (useProfileCV && !profileCV) ||
                    jobDescriptions.some((jd) => jd.trim() === "")
                      ? "bg-line text-ink-muted cursor-not-allowed"
                      : "bg-surface text-primary-600 border-2 border-primary-600 hover:bg-primary-50 active:scale-95 shadow-card hover:shadow-float"
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                      Analyzing Resume...
                    </div>
                  ) : (
                    <div className="flex items-center justify-center gap-2">
                      <Target className="w-5 h-5" />
                      Analyze Resume
                    </div>
                  )}
                </button>

                {((resumeFile || useProfileCV) || jobDescriptions.some((jd) => jd.trim())) && (
                  <button
                    onClick={handleClear}
                    disabled={loading}
                    className="w-full px-6 py-3 bg-surface text-ink-2 border-2 border-line rounded-full hover:bg-sand transition-all disabled:opacity-50 font-medium shadow-soft hover:shadow-card"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* Right Content Area - 50% width on desktop */}
        <div className="min-w-0">
          <div>
            <div className="space-y-6 md:space-y-8">
              {loading && (
                <div className="flex justify-center items-center py-32">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin mx-auto mb-6"></div>
                    <h3 className="text-xl font-semibold text-ink-2 mb-3">
                      Analyzing Your Resume
                    </h3>
                    <p className="text-ink-muted">This may take a few moments...</p>
                  </div>
                </div>
              )}

              {!loading && results.length > 0 && (
                <>
                  {/* Match Scores */}
                  <div className="bg-surface rounded-3xl shadow-soft border border-line p-6 md:p-8">
                    <h2 className="text-2xl md:text-3xl font-bold mb-6 text-ink">
                      Match Scores Overview
                    </h2>
                    <div className={`grid gap-4 md:gap-6 ${
                      results.length === 1 ? "grid-cols-1 max-w-sm mx-auto" :
                      results.length === 2 ? "grid-cols-1 md:grid-cols-2" :
                      "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    }`}>
                      {results.map((res, idx) => (
                        <CircularProgress
                          key={idx}
                          percentage={res.matchPercentage || 0}
                          unavailable={!!(res.scoreBreakdown && res.scoreBreakdown.aiAvailable === false)}
                          label={res.scoreBreakdown && res.scoreBreakdown.aiAvailable === false ? `Job Description ${idx + 1} (AI unavailable)` : `Job Description ${idx + 1}`}
                          colorIndex={idx}
                        />
                      ))}
                    </div>
                  </div>

                  {/* CV Source Info */}
                  <div className="bg-surface border border-line p-4 md:p-6 rounded-3xl shadow-soft">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-ink-muted rounded-2xl shadow-sm">
                        {useProfileCV ? <User className="w-5 h-5 text-white" /> : <Upload className="w-5 h-5 text-white" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-ink">CV Source</h3>
                        <p className="text-sm text-ink-2">
                          {useProfileCV
                            ? `Using profile CV: ${profileCV?.fileName || 'Unknown'}`
                            : `Uploaded file: ${resumeFile?.name || 'Unknown'}`
                          }
                        </p>
                      </div>
                    </div>
                    {resumeData?.extractedTechnologies?.length > 0 && (
                      <p className="text-sm text-ink-muted ml-11">
                        {resumeData.extractedTechnologies.length} technologies extracted
                      </p>
                    )}
                  </div>

                  {/* Skills Assessment Navigation */}
                  <div className="bg-primary-50 border border-primary-200 p-6 md:p-8 rounded-3xl shadow-card">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-primary-500 rounded-2xl shadow-soft">
                          <BarChart3 className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl md:text-2xl font-bold text-ink">Skills Assessment</h3>
                          <p className="text-ink-2 mt-1">
                            Rate your confidence level for each extracted technology
                            {resumeData?.extractedTechnologies?.length > 0 && (
                              <span className="ml-1 text-primary-600 font-semibold">
                                ({resumeData.extractedTechnologies.length} technologies found)
                              </span>
                            )}
                          </p>
                          {resumeData && !resumeData.extractedTechnologies?.length && (
                            <p role="status" className="mt-2 rounded-xl bg-sun-100 px-3 py-2 text-sm text-ink">
                              {resumeData.technologiesUnavailable
                                ? 'Could not extract technologies from your CV right now; add them manually or try again.'
                                : 'No technologies were found on your CV. You can add them manually.'}
                            </p>
                          )}
                        </div>
                      </div>
                      {resumeData && !resumeData.extractedTechnologies?.length ? (
                        <button
                          onClick={() => navigate('/swot', { state: { resumeHash: resumeData.resumeHash, extractedTechnologies: [], technologiesUnavailable: !!resumeData.technologiesUnavailable } })}
                          className="px-6 md:px-8 py-3 md:py-4 rounded-2xl font-bold transition-all shadow-soft bg-surface text-primary-600 border-2 border-primary-600 hover:bg-primary-50 active:scale-95"
                        >
                          <div className="flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            Add technologies manually
                          </div>
                        </button>
                      ) : (
                      <button
                        onClick={handleNavigateToSkillsAssessment}
                        disabled={!resumeData || !resumeData.extractedTechnologies?.length}
                        className={`px-6 md:px-8 py-3 md:py-4 rounded-2xl font-bold transition-all shadow-soft ${
                          !resumeData || !resumeData.extractedTechnologies?.length
                            ? "bg-line text-ink-muted cursor-not-allowed"
                            : "bg-surface text-primary-600 border-2 border-primary-600 hover:bg-primary-50 active:scale-95 shadow-card hover:shadow-float"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5" />
                          Start Assessment
                        </div>
                      </button>
                      )}
                    </div>
                  </div>

                  {/* Detailed Analysis */}
                  <div className="space-y-6">
                    <h2 className="text-2xl md:text-3xl font-bold text-ink">
                      Detailed Analysis Results
                    </h2>
                    {results.map((res, idx) => (
                      <div key={idx} className="space-y-4">
                        <StructuredRecommendations result={res} index={idx} />
                        <div className="flex justify-end">
                          <button
                            className={`px-6 py-3 rounded-2xl transition-all font-bold shadow-soft ${
                              savedIndices.includes(idx)
                                ? "bg-ink-2 cursor-not-allowed text-white"
                                : "bg-surface text-primary-600 border-2 border-primary-600 hover:bg-primary-50 hover:shadow-card active:scale-95"
                            }`}
                            disabled={savedIndices.includes(idx)}
                            onClick={() => handleSaveIndividualAnalysis(idx)}
                          >
                            {savedIndices.includes(idx) ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Analysis Saved
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <Save className="w-4 h-4" />
                                Save Analysis
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {!loading && results.length === 0 && (
                <div className="text-center py-16 md:py-32 bg-surface border border-line rounded-2xl shadow-card">
                  <div className="w-20 h-20 mx-auto text-ink-muted mb-6 bg-sand rounded-3xl flex items-center justify-center shadow-inner">
                    <FileText className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-ink-2 mb-4">
                    Ready to Analyze Your Resume
                  </h3>
                  <p className="text-ink-muted max-w-md mx-auto leading-relaxed px-4">
                    {cvUploadMode === 'profile' && profileCV
                      ? "Use your profile CV or upload a new one, then add job descriptions to get started."
                      : "Upload your resume and add job descriptions to get started with our comprehensive analysis."
                    }
                    <br /><br />
                    <span className="text-sm text-ink-muted">
                      💡 Pro tip: Include only relevant details in job descriptions for better analysis accuracy.
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Custom Styles */}
      <style>{`
        /* Custom scrollbar styling */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }

        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f1ece1;
          border-radius: 4px;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d6cfbc;
          border-radius: 4px;
          border: 1px solid #f1ece1;
        }

        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }

        /* Mobile-specific styles */
        @media (max-width: 1023px) {
          .lg\\:w-1\\/2 {
            width: 100% !important;
          }
        }

        /* Enhanced animations */
        @keyframes slideInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .animate-slideInUp {
          animation: slideInUp 0.6s ease-out;
        }

        .animate-fadeIn {
          animation: fadeIn 0.4s ease-out;
        }


        /* Enhanced button hover effects */
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 40px rgba(79, 70, 229, 0.3);
        }


        /* Enhanced focus states for accessibility */
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible {
          outline: 2px solid #4f46e5;
          outline-offset: 2px;
        }

        /* Loading shimmer effect */
        @keyframes shimmer {
          0% { background-position: -200px 0; }
          100% { background-position: calc(200px + 100%) 0; }
        }

        .shimmer {
          background: linear-gradient(90deg, #f0f0f0 0px, #e0e0e0 40px, #f0f0f0 80px);
          background-size: 200px;
          animation: shimmer 1.5s infinite;
        }

        /* Custom slider styles */
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          transition: all 0.2s ease;
        }

        .slider::-webkit-slider-thumb:hover {
          background: linear-gradient(135deg, #4338ca 0%, #3730a3 100%);
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
        }

        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5 0%, #4338ca 100%);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }

        .slider::-webkit-slider-track {
          height: 12px;
          border-radius: 6px;
          background: #ebe7dc;
        }

        .slider::-moz-range-track {
          height: 12px;
          border-radius: 6px;
          background: #ebe7dc;
        }

        .slider:focus::-webkit-slider-track {
          background: #d6cfbc;
        }
      `}</style>
    </AppShell>
  );
};

export default CVAnalyzer;