import React, { useState, useCallback, useEffect } from "react";
import ScoreBreakdown from './components/ScoreBreakdown';
import { CheckCircle, XCircle, AlertTriangle, Lightbulb, FileText, Layout, Target, BarChart3, ArrowLeft, Star, TrendingUp, Settings, Upload, Plus, Trash2, Save, RefreshCw, User } from "lucide-react";
import AppShell from "../../components/AppShell";
import { useNavigate } from "react-router-dom";
import { backendUrl } from '../../api/client';


// Enhanced Skills Assessment Component
const SkillsAssessment = ({ 
  resumeHash = null, 
  resumeText = null,
  jobDescriptions = [],
  extractedTechnologies = [],
  onBack = null,
  userId = null
}) => {
  const [step, setStep] = useState('rating');
  const [technologies, setTechnologies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  

  // Simple icon components
  const AlertCircle = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  );

  const CheckCircle = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
    </svg>
  );

  const ArrowRight = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12,5 19,12 12,19"></polyline>
  </svg>
  );

  const ArrowLeft = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <line x1="19" y1="12" x2="5" y2="12"></line>
      <polyline points="12,19 5,12 12,5"></polyline>
    </svg>
  );

  const Loader = ({ className }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" strokeDasharray="31.416" strokeDashoffset="31.416">
        <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
        <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
      </circle>
    </svg>
  );

  // Initialize technologies when extractedTechnologies prop changes
  React.useEffect(() => {
    if (extractedTechnologies && extractedTechnologies.length > 0) {
      const initializedTechnologies = extractedTechnologies.map(tech => ({
        name: tech.name,
        category: tech.category,
        confidenceLevel: tech.confidenceLevel || 5
      }));
      setTechnologies(initializedTechnologies);
    }
  }, [extractedTechnologies]);

  // Handle confidence rating changes
  const handleRatingChange = (techIndex, newRating) => {
    const updatedTechnologies = [...technologies];
    updatedTechnologies[techIndex].confidenceLevel = parseInt(newRating);
    setTechnologies(updatedTechnologies);
  };

  // Save technology ratings to backend
  const handleSaveRatings = async () => {
    if (!resumeHash) {
      setError('Resume hash is required. Please analyze your resume first.');
      return;
    }

    if (technologies.length === 0) {
      setError('No technologies to save. Please extract technologies first.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const response = await fetch('/api/swot/save-ratings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          technologies: technologies,
          resumeHash: resumeHash
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save ratings');
      }

      setSuccess(data.message || 'Skill assessments saved successfully!');
      setStep('success');
      
    } catch (err) {
      console.error('Error saving ratings:', err);
      setError(err.message || 'Failed to save skill assessments. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Get confidence level color
  const getConfidenceColor = (level) => {
    if (level >= 8) return 'text-success-700 bg-success-100 border-success-100';
    if (level >= 6) return 'text-primary-700 bg-primary-100 border-primary-200';
    if (level >= 4) return 'text-sun-700 bg-sun-100 border-sun-200';
    return 'text-danger-700 bg-danger-100 border-danger-100';
  };

  // Get confidence level text
  const getConfidenceText = (level) => {
    if (level >= 8) return 'Expert';
    if (level >= 6) return 'Proficient';
    if (level >= 4) return 'Intermediate';
    return 'Beginner';
  };

  // Group technologies by category
  const groupedTechnologies = technologies.reduce((groups, tech) => {
    const category = tech.category || 'General';
    if (!groups[category]) {
      groups[category] = [];
    }
    groups[category].push(tech);
    return groups;
  }, {});

  const renderInstructions = () => (
    <div className="bg-primary-50 border border-primary-200 rounded-3xl p-4 md:p-6 mb-6">
      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-primary-500 rounded-2xl flex items-center justify-center shadow-soft">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg md:text-xl font-bold text-primary-900 mb-3">How to Rate Your Skills</h3>
          <div className="space-y-3 text-sm text-primary-800">
            <p className="font-medium">Rate each technology based on your current confidence level:</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-danger-500 rounded-full shadow-sm"></div>
                <span><strong>1-3 (Beginner):</strong> Basic understanding, need guidance</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-sun-400 rounded-full shadow-sm"></div>
                <span><strong>4-5 (Intermediate):</strong> Can work independently with some help</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary-400 rounded-full shadow-sm"></div>
                <span><strong>6-7 (Proficient):</strong> Confident, can mentor others</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-success-500 rounded-full shadow-sm"></div>
                <span><strong>8-10 (Expert):</strong> Deep expertise, can architect solutions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRatingStep = () => (
    <div>
    <div className="space-y-6 md:space-y-8">
      {/* Header */}
      <div className="text-center">
        
        <div className="inline-flex items-center gap-2 bg-primary-100 text-primary-800 px-4 py-2 rounded-full text-sm font-medium mb-4 shadow-sm">
          <Star className="w-4 h-4" />
          Skills Assessment
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-ink mb-4">Rate Your Technical Skills</h1>
        <p className="text-lg md:text-xl text-ink-2 max-w-3xl mx-auto px-4">
          Help us understand your confidence level with each technology to provide better career insights
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-sand rounded-2xl px-4 py-2 shadow-sm">
          <BarChart3 className="w-5 h-5 text-ink-2" />
          <span className="text-ink font-semibold">{technologies.length} technologies found</span>
        </div>
      </div>
      </div>

      {/* Instructions */}
      {renderInstructions()}

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-danger-50 border border-danger-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-danger-600 mr-2 flex-shrink-0" />
            <span className="text-danger-700">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-success-50 border border-success-100 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-success-600 mr-2 flex-shrink-0" />
            <span className="text-success-700">{success}</span>
          </div>
        </div>
      )}

      {technologies.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 text-ink-muted mx-auto mb-6 flex items-center justify-center bg-sand rounded-2xl shadow-inner">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-semibold text-ink-2 mb-3">No Technologies Found</h3>
          <p className="text-ink-muted mb-8 max-w-md mx-auto px-4">
            No technologies were extracted from your resume. Please go back and analyze your CV first.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-6 py-3 bg-surface text-primary-600 border-2 border-primary-600 rounded-full hover:bg-primary-50 transition-all shadow-soft hover:shadow-card"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to CV Analysis
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Technologies Rating Grid */}
          <div className="bg-surface rounded-2xl border border-line shadow-soft overflow-hidden">
            <div className="bg-sand p-4 md:p-6 border-b border-line">
              <h2 className="text-xl md:text-2xl font-bold text-ink">Technology Skills</h2>
              <p className="text-ink-2 mt-1">Use the sliders to rate your confidence level for each technology</p>
            </div>
            
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              {Object.entries(groupedTechnologies).map(([category, techs]) => (
                <div key={category} className="border-b border-line last:border-0">
                  <div className="bg-sand px-4 md:px-6 py-3 border-b border-line sticky top-0 z-10">
                    <h3 className="text-lg font-bold text-ink">{category}</h3>
                  </div>
                  <div className="p-4 md:p-6 space-y-6">
                    {techs.map((tech, techIndex) => {
                      const globalIndex = technologies.findIndex(t => t.name === tech.name);
                      return (
                        <div key={globalIndex} className="group">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                            <div className="flex items-center gap-3">
                              <h4 className="text-lg font-semibold text-ink">{tech.name}</h4>
                              <span className={`text-xs px-3 py-1 rounded-full border font-medium ${getConfidenceColor(tech.confidenceLevel)}`}>
                                {getConfidenceText(tech.confidenceLevel)}
                              </span>
                            </div>
                            <div className={`text-2xl font-bold px-4 py-2 rounded-2xl shadow-sm ${getConfidenceColor(tech.confidenceLevel)}`}>
                              {tech.confidenceLevel}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 md:gap-4">
                            <span className="text-sm text-ink-muted font-medium w-6 md:w-8">1</span>
                            <div className="flex-1 relative">
                              <input
                                type="range"
                                min="1"
                                max="10"
                                value={tech.confidenceLevel}
                                onChange={(e) => handleRatingChange(globalIndex, e.target.value)}
                                className="w-full h-3 bg-line rounded-xl appearance-none cursor-pointer slider focus:outline-none focus:ring-2 focus:ring-primary-500"
                              />
                              <div className="flex justify-between text-xs text-ink-muted mt-1">
                                <span>Beginner</span>
                                <span className="hidden sm:inline">Intermediate</span>
                                <span className="hidden sm:inline">Proficient</span>
                                <span>Expert</span>
                              </div>
                            </div>
                            <span className="text-sm text-ink-muted font-medium w-6 md:w-8 text-right">10</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* Action Bar */}
          <div className="bg-surface border border-line rounded-3xl p-4 md:p-6 shadow-soft">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6">
              {/* Statistics */}
              <div className="flex flex-wrap items-center gap-3 md:gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-success-500 rounded-full shadow-sm"></div>
                  <span className="text-ink-2">Expert (8-10): <strong className="text-ink">{technologies.filter(t => t.confidenceLevel >= 8).length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-primary-500 rounded-full shadow-sm"></div>
                  <span className="text-ink-2">Proficient (6-7): <strong className="text-ink">{technologies.filter(t => t.confidenceLevel >= 6 && t.confidenceLevel < 8).length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-sun-500 rounded-full shadow-sm"></div>
                  <span className="text-ink-2">Learning (&lt;6): <strong className="text-ink">{technologies.filter(t => t.confidenceLevel < 6).length}</strong></span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface text-ink-2 border-2 border-line rounded-full hover:bg-sand transition-all shadow-sm hover:shadow-md"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Analysis
                  </button>
                )}
                <button
                  onClick={handleSaveRatings}
                  disabled={saving || technologies.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-surface text-primary-600 border-2 border-primary-600 rounded-full hover:bg-primary-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-soft hover:shadow-card"
                >
                  {saving ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin text-primary-600" />
                      Saving Assessment...
                    </>
                  ) : (
                    <>
                      <Star className="w-5 h-5" />
                      Save Skills Assessment
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
  const navigate = useNavigate();

  const renderSuccessStep = () => (
    <div>
    <div className="space-y-6 md:space-y-8 text-center max-w-5xl mx-auto">
      <div className="w-24 h-24 bg-success-100 rounded-3xl flex items-center justify-center mx-auto shadow-soft">
        <CheckCircle className="w-12 h-12 text-success-600" />
      </div>
      
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-success-600 mb-4">Skills Assessment Complete!</h1>
        <p className="text-xl text-ink-2 px-4">
          Your skill assessments have been saved for {technologies.length} technologies
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 px-4">
        <div className="bg-success-50 border border-success-100 rounded-3xl p-6 md:p-8 shadow-soft hover:shadow-card transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TrendingUp className="w-6 h-6 text-success-600" />
            <span className="font-bold text-success-700 text-lg">Expert Level</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-success-600 mb-2">
            {technologies.filter(t => t.confidenceLevel >= 8).length}
          </div>
          <div className="text-success-700">Technologies (8-10)</div>
        </div>

        <div className="bg-primary-50 border border-primary-200 rounded-3xl p-6 md:p-8 shadow-soft hover:shadow-card transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Star className="w-6 h-6 text-primary-600" />
            <span className="font-bold text-primary-800 text-lg">Proficient</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-primary-600 mb-2">
            {technologies.filter(t => t.confidenceLevel >= 6 && t.confidenceLevel < 8).length}
          </div>
          <div className="text-primary-700">Technologies (6-7)</div>
        </div>

        <div className="bg-sun-50 border border-sun-200 rounded-3xl p-6 md:p-8 shadow-soft hover:shadow-card transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BarChart3 className="w-6 h-6 text-sun-600" />
            <span className="font-bold text-sun-700 text-lg">Learning</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-sun-600 mb-2">
            {technologies.filter(t => t.confidenceLevel < 6).length}
          </div>
          <div className="text-sun-700">Technologies (&lt;6)</div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-surface border border-line rounded-3xl p-6 md:p-8 shadow-soft mx-4">
        <h3 className="text-xl font-bold text-ink mb-6">Assessment Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-ink mb-1">
              {(technologies.reduce((sum, tech) => sum + tech.confidenceLevel, 0) / technologies.length).toFixed(1)}/10
            </div>
            <div className="text-ink-2">Average Confidence Level</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-ink mb-1">{technologies.length}</div>
            <div className="text-ink-2">Technologies Assessed</div>
          </div>
        </div>
      </div>

      
      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
        <button
          onClick={() => setStep('rating')}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface text-ink-2 border-2 border-line rounded-full hover:bg-sand transition-all shadow-soft hover:shadow-card"
        >
          <Settings className="w-4 h-4" />
          Update Assessments
        </button>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface text-primary-600 border-2 border-primary-600 rounded-full hover:bg-primary-50 transition-all shadow-soft hover:shadow-card"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to CV Analysis
          </button>
        )}
        <button
          onClick={() => navigate('/interview')}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-surface text-primary-600 border-2 border-primary-600 rounded-full hover:bg-primary-50 transition-all shadow-soft hover:shadow-card"
          >
          <ArrowRight className="w-4 h-4" />
          Proceed to Mock Interview 
      </button>
      </div>
    </div>
    </div>
  );

  // Enhanced validation check
  if (!resumeHash || !extractedTechnologies || extractedTechnologies.length === 0) {
    return (
      <div className="min-h-screen bg-sand flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-surface border border-danger-100 rounded-2xl p-8 text-center shadow-card">
            <div className="w-16 h-16 text-danger-600 mx-auto mb-6 flex items-center justify-center bg-danger-100 rounded-2xl shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-danger-700 mb-4">
              {!resumeHash ? "Resume Analysis Required" : "No Technologies Found"}
            </h2>
            <p className="text-danger-600 mb-6">
              {!resumeHash 
                ? "Please analyze your resume first to extract technologies for assessment."
                : "No technologies were extracted from your resume. Please ensure your resume contains technical skills and try analyzing again."
              }
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-6 py-3 bg-surface text-danger-600 border-2 border-danger-600 rounded-full hover:bg-danger-50 transition-all shadow-soft hover:shadow-card"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to CV Analysis
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell width="wide">
      <div>
        <style>{`
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
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          .animate-spin {
            animation: spin 1s linear infinite;
          }
        `}</style>
        
        {step === 'rating' && renderRatingStep()}
        {step === 'success' && renderSuccessStep()}
      </div>
    </AppShell>
  );
};

// API Configuration
const API_BASE_URL = backendUrl;

const API_ENDPOINTS = {
  analyzeResume: `${API_BASE_URL}/api/analyze/analyze-resume`,
  saveAnalysis: `${API_BASE_URL}/api/analyze/save`,
  saveSWOTRatings: `${API_BASE_URL}/api/swot/save-ratings`,
  getUserProfile: `${API_BASE_URL}/api/user/profile`,
  getCurrentCV: `${API_BASE_URL}/api/user/cv`,
  uploadCV: `${API_BASE_URL}/api/user/upload-cv`,
  deleteCV: `${API_BASE_URL}/api/user/cv`,
};

// Enhanced Circular Progress Component
const CircularProgress = ({ percentage, label, colorIndex = 0, unavailable = false }) => {
  const colors = [
    { primary: "#4f46e5", secondary: "#e0e7ff", gradient: "from-primary-500 to-primary-600" },
    { primary: "#059669", secondary: "#d1fae5", gradient: "from-success-500 to-success-600" },
    { primary: "#d97706", secondary: "#fef3c7", gradient: "from-sun-500 to-sun-600" },
    { primary: "#dc2626", secondary: "#fee2e2", gradient: "from-danger-500 to-danger-600" },
    { primary: "#4338ca", secondary: "#ede9fe", gradient: "from-primary-500 to-primary-600" },
    { primary: "#0891b2", secondary: "#cffafe", gradient: "from-primary-500 to-primary-600" },
  ];
  const color = colors[colorIndex % colors.length];
  const strokeDasharray = 2 * Math.PI * 50;
  const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage) / 100;

  return (
    <div className="flex flex-col items-center p-4 md:p-6 bg-surface rounded-3xl border border-line hover:shadow-card transition-all shadow-soft transform hover:scale-105">
      <div className="relative w-24 md:w-28 h-24 md:h-28 mb-4">
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            cx="56"
            cy="56"
            r="50"
            stroke={color.secondary}
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="56"
            cy="56"
            r="50"
            stroke={color.primary}
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={strokeDasharray}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl md:text-2xl font-bold" style={{ color: color.primary }}>
            {unavailable ? '-' : `${percentage}%`}
          </span>
        </div>
      </div>
      <span className="text-sm font-semibold text-ink-2 text-center">{label}</span>
    </div>
  );
};

// Enhanced Structured Recommendations Component
const StructuredRecommendations = ({ result, index }) => {
  const [activeTab, setActiveTab] = useState('strengths');

  if (result.isNonTechRole) {
    return (
      <div className="bg-sun-50 border border-sun-200 p-4 md:p-6 rounded-3xl shadow-soft">
        <div className="flex items-center mb-3">
          <AlertTriangle className="w-5 h-5 text-sun-600 mr-2 flex-shrink-0" />
          <h3 className="font-semibold text-sun-700">Non-Technical Role Detected</h3>
        </div>
        <p className="text-sun-700">{result.message}</p>
      </div>
    );
  }

  const tabs = [
    { id: 'strengths', label: 'Strengths', icon: CheckCircle, color: 'text-success-600', bgColor: 'bg-success-50', borderColor: 'border-success-100' },
    { id: 'content', label: 'Content Issues', icon: FileText, color: 'text-sun-600', bgColor: 'bg-sun-50', borderColor: 'border-sun-200' },
    { id: 'structure', label: 'Structure Issues', icon: Layout, color: 'text-danger-600', bgColor: 'bg-danger-50', borderColor: 'border-danger-100' },
    { id: 'recommendations', label: 'Recommendations', icon: Lightbulb, color: 'text-primary-600', bgColor: 'bg-primary-50', borderColor: 'border-primary-200' }
  ];

  const renderList = (items, icon, colorClass, bgClass) => {
    if (!items || items.length === 0) {
      return (
        <div className="text-ink-muted italic text-center py-8 bg-sand rounded-2xl">
          No items available for this category
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className={`flex items-start gap-4 p-4 ${bgClass} rounded-2xl border border-line shadow-sm hover:shadow-md transition-shadow`}>
            <icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colorClass}`} />
            <span className="text-ink-2 leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTabContent = () => {
    const activeTabData = tabs.find(tab => tab.id === activeTab);
    
    switch (activeTab) {
      case 'strengths':
        return renderList(result.strengths, CheckCircle, 'text-success-600', 'bg-success-50');
      case 'content':
        return renderList(result.contentWeaknesses, FileText, 'text-sun-600', 'bg-sun-50');
      case 'structure':
        return renderList(result.structureWeaknesses, Layout, 'text-danger-600', 'bg-danger-50');
      case 'recommendations':
        const allRecommendations = [
          ...(result.contentRecommendations || []).map(rec => ({ text: rec, type: 'content' })),
          ...(result.structureRecommendations || []).map(rec => ({ text: rec, type: 'structure' }))
        ];
        return (
          <div className="space-y-4">
            {allRecommendations.length === 0 ? (
              <div className="text-ink-muted italic text-center py-8 bg-sand rounded-2xl">
                No recommendations available
              </div>
            ) : (
              allRecommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-primary-50 rounded-2xl border border-line shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-primary-600 flex-shrink-0" />
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      rec.type === 'content' 
                        ? 'bg-sun-100 text-sun-700 border border-sun-200' 
                        : 'bg-primary-100 text-primary-700 border border-primary-200'
                    }`}>
                      {rec.type}
                    </span>
                  </div>
                  <span className="text-ink-2 leading-relaxed">{rec.text}</span>
                </div>
              ))
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-surface p-4 md:p-6 shadow-soft border border-line rounded-3xl hover:shadow-card transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-ink">Job Description {index + 1}</h3>
        <span
          className={`px-4 py-2 rounded-full text-sm font-bold shadow-sm ${
            result.scoreBreakdown && result.scoreBreakdown.aiAvailable === false
              ? "bg-sand text-ink-2 border border-line"
              : result.matchPercentage >= 80
              ? "bg-success-100 text-success-700 border border-success-100"
              : result.matchPercentage >= 60
              ? "bg-sun-100 text-sun-700 border border-sun-300"
              : "bg-danger-100 text-danger-700 border border-danger-100"
          }`}
        >
          {result.scoreBreakdown && result.scoreBreakdown.aiAvailable === false ? 'No score (AI unavailable)' : `Match Score: ${result.matchPercentage}%`}
        </span>
      </div>

      <ScoreBreakdown breakdown={result.scoreBreakdown} />

      {/* The AI could not write the advice: say so instead of four empty "No items" tabs. */}
      {result.recommendationsUnavailable && (
        <div role="status" className="flex items-start gap-3 rounded-2xl border border-sun-200 bg-sun-100 p-4 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-sun-700" aria-hidden="true" />
          <div>
            <p className="font-semibold">AI advice is unavailable right now</p>
            <p className="mt-1 text-ink-2">
              {result.scoreBreakdown && result.scoreBreakdown.aiAvailable === false
                ? 'Neither the match score nor the written feedback could be produced. The keyword check above still shows which skills from the job description appear in your CV.'
                : 'The match score above was calculated, but the written feedback (strengths, issues and recommendations) could not be produced.'}
              {' '}Try analysing again in a few minutes.
            </p>
          </div>
        </div>
      )}

      {!result.recommendationsUnavailable && <>
      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-8 bg-sand p-2 rounded-2xl shadow-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 rounded-2xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? `bg-surface ${tab.color} shadow-soft border ${tab.borderColor} transform scale-105`
                  : 'text-ink-2 hover:text-ink hover:bg-sand hover:shadow-sm'
              }`}
            >
              <Icon className={`w-4 h-4 ${activeTab === tab.id ? tab.color : 'text-ink-muted'}`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {renderTabContent()}
      </div>
      </>}
    </div>
  );
};

const CVAnalyzer = () => {
  const navigate = useNavigate();
  // State management
  const [resumeFile, setResumeFile] = useState(null);
  const [jobDescriptions, setJobDescriptions] = useState([""]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(''); // Added missing success state
  const [dragActive, setDragActive] = useState(false);
  const [resumeData, setResumeData] = useState(null);
  const [currentView, setCurrentView] = useState('analysis');
  const [savedIndices, setSavedIndices] = useState([]);
  
  // NEW: Profile CV state
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

  // Enhanced analyze function
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
      } catch (parseError) {
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

  // Fixed handleSaveIndividualAnalysis function
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

    console.log('Saving analysis data:', saveData); // Debug log

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

    const responseData = await response.json();
    console.log('Save response:', responseData); // Debug log

    setSavedIndices((prev) => [...prev, index]);
    
    // Show success message
    setSuccess(`Analysis ${index + 1} saved successfully!`);
    setTimeout(() => setSuccess(''), 3000);

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
        resumeText={resumeData?.resumeText}
        jobDescriptions={resumeData?.jobDescriptions || []}
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