import React, { useState, useCallback, useEffect } from "react";
import { CheckCircle, XCircle, AlertTriangle, Lightbulb, FileText, Layout, Target, BarChart3, ArrowLeft, Star, TrendingUp, Settings, Upload, Plus, Trash2, Save, RefreshCw, User } from "lucide-react";
import NavBar from "../components/NavBar";
import { useNavigate } from "react-router-dom";


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
    if (level >= 8) return 'text-emerald-700 bg-emerald-100 border-emerald-200';
    if (level >= 6) return 'text-blue-700 bg-blue-100 border-blue-200';
    if (level >= 4) return 'text-amber-700 bg-amber-100 border-amber-200';
    return 'text-red-700 bg-red-100 border-red-200';
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
    <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-2xl p-4 md:p-6 mb-6">
      <div className="flex flex-col md:flex-row items-start gap-4">
        <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
          <Settings className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg md:text-xl font-bold text-blue-900 mb-3">How to Rate Your Skills</h3>
          <div className="space-y-3 text-sm text-blue-800">
            <p className="font-medium">Rate each technology based on your current confidence level:</p>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-400 rounded-full shadow-sm"></div>
                <span><strong>1-3 (Beginner):</strong> Basic understanding, need guidance</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-400 rounded-full shadow-sm"></div>
                <span><strong>4-5 (Intermediate):</strong> Can work independently with some help</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-400 rounded-full shadow-sm"></div>
                <span><strong>6-7 (Proficient):</strong> Confident, can mentor others</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-400 rounded-full shadow-sm"></div>
                <span><strong>8-10 (Expert):</strong> Deep expertise, can architect solutions</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderRatingStep = () => (
    <div className="min-h-screen bg-gray-50">
                      <NavBar/>
    <div className="space-y-6 md:space-y-8">
      <br />
      {/* Header */}
      <div className="text-center">
        
        <div className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-800 px-4 py-2 rounded-full text-sm font-medium mb-4 shadow-sm">
          <Star className="w-4 h-4" />
          Skills Assessment
        </div>
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Rate Your Technical Skills</h1>
        <p className="text-lg md:text-xl text-gray-600 max-w-3xl mx-auto px-4">
          Help us understand your confidence level with each technology to provide better career insights
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-gradient-to-r from-gray-100 to-gray-200 rounded-xl px-4 py-2 shadow-sm">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <span className="text-gray-800 font-semibold">{technologies.length} technologies found</span>
        </div>
      </div>
      </div>

      {/* Instructions */}
      {renderInstructions()}

      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-2 flex-shrink-0" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-emerald-600 mr-2 flex-shrink-0" />
            <span className="text-emerald-800">{success}</span>
          </div>
        </div>
      )}

      {technologies.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 text-gray-400 mx-auto mb-6 flex items-center justify-center bg-gray-100 rounded-2xl shadow-inner">
            <AlertTriangle className="w-10 h-10" />
          </div>
          <h3 className="text-2xl font-semibold text-gray-600 mb-3">No Technologies Found</h3>
          <p className="text-gray-500 mb-8 max-w-md mx-auto px-4">
            No technologies were extracted from your resume. Please go back and analyze your CV first.
          </p>
          {onBack && (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl hover:bg-indigo-50 transition-all shadow-lg hover:shadow-xl"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to CV Analysis
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Technologies Rating Grid */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-gray-50 to-gray-100 p-4 md:p-6 border-b border-gray-200">
              <h2 className="text-xl md:text-2xl font-bold text-gray-900">Technology Skills</h2>
              <p className="text-gray-600 mt-1">Use the sliders to rate your confidence level for each technology</p>
            </div>
            
            <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
              {Object.entries(groupedTechnologies).map(([category, techs]) => (
                <div key={category} className="border-b border-gray-100 last:border-0">
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 md:px-6 py-3 border-b border-gray-200 sticky top-0 z-10">
                    <h3 className="text-lg font-bold text-gray-800">{category}</h3>
                  </div>
                  <div className="p-4 md:p-6 space-y-6">
                    {techs.map((tech, techIndex) => {
                      const globalIndex = technologies.findIndex(t => t.name === tech.name);
                      return (
                        <div key={globalIndex} className="group">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-2">
                            <div className="flex items-center gap-3">
                              <h4 className="text-lg font-semibold text-gray-900">{tech.name}</h4>
                              <span className={`text-xs px-3 py-1 rounded-full border font-medium ${getConfidenceColor(tech.confidenceLevel)}`}>
                                {getConfidenceText(tech.confidenceLevel)}
                              </span>
                            </div>
                            <div className={`text-2xl font-bold px-4 py-2 rounded-xl shadow-sm ${getConfidenceColor(tech.confidenceLevel)}`}>
                              {tech.confidenceLevel}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 md:gap-4">
                            <span className="text-sm text-gray-500 font-medium w-6 md:w-8">1</span>
                            <div className="flex-1 relative">
                              <input
                                type="range"
                                min="1"
                                max="10"
                                value={tech.confidenceLevel}
                                onChange={(e) => handleRatingChange(globalIndex, e.target.value)}
                                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer slider focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                              <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>Beginner</span>
                                <span className="hidden sm:inline">Intermediate</span>
                                <span className="hidden sm:inline">Proficient</span>
                                <span>Expert</span>
                              </div>
                            </div>
                            <span className="text-sm text-gray-500 font-medium w-6 md:w-8 text-right">10</span>
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
          <div className="bg-white border border-gray-200 rounded-2xl p-4 md:p-6 shadow-lg">
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 lg:gap-6">
              {/* Statistics */}
              <div className="flex flex-wrap items-center gap-3 md:gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full shadow-sm"></div>
                  <span className="text-gray-600">Expert (8-10): <strong className="text-gray-900">{technologies.filter(t => t.confidenceLevel >= 8).length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full shadow-sm"></div>
                  <span className="text-gray-600">Proficient (6-7): <strong className="text-gray-900">{technologies.filter(t => t.confidenceLevel >= 6 && t.confidenceLevel < 8).length}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-amber-500 rounded-full shadow-sm"></div>
                  <span className="text-gray-600">Learning (&lt;6): <strong className="text-gray-900">{technologies.filter(t => t.confidenceLevel < 6).length}</strong></span>
                </div>
              </div>

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                {onBack && (
                  <button
                    onClick={onBack}
                    className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all shadow-sm hover:shadow-md"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Analysis
                  </button>
                )}
                <button
                  onClick={handleSaveRatings}
                  disabled={saving || technologies.length === 0}
                  className="inline-flex items-center justify-center gap-2 px-8 py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold shadow-lg hover:shadow-xl"
                >
                  {saving ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin text-indigo-600" />
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
    <div className="min-h-screen bg-gray-50">
                      <NavBar/>
                      <br/>
    <div className="space-y-6 md:space-y-8 text-center max-w-5xl mx-auto">
      <div className="w-24 h-24 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-3xl flex items-center justify-center mx-auto shadow-lg">
        <CheckCircle className="w-12 h-12 text-emerald-600" />
      </div>
      
      <div>
        <h1 className="text-3xl md:text-4xl font-bold text-emerald-600 mb-4">Skills Assessment Complete!</h1>
        <p className="text-xl text-gray-600 px-4">
          Your skill assessments have been saved for {technologies.length} technologies
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 px-4">
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border border-emerald-200 rounded-2xl p-6 md:p-8 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <TrendingUp className="w-6 h-6 text-emerald-600" />
            <span className="font-bold text-emerald-800 text-lg">Expert Level</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-emerald-600 mb-2">
            {technologies.filter(t => t.confidenceLevel >= 8).length}
          </div>
          <div className="text-emerald-700">Technologies (8-10)</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-2xl p-6 md:p-8 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Star className="w-6 h-6 text-blue-600" />
            <span className="font-bold text-blue-800 text-lg">Proficient</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-blue-600 mb-2">
            {technologies.filter(t => t.confidenceLevel >= 6 && t.confidenceLevel < 8).length}
          </div>
          <div className="text-blue-700">Technologies (6-7)</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-6 md:p-8 shadow-lg hover:shadow-xl transition-all">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BarChart3 className="w-6 h-6 text-amber-600" />
            <span className="font-bold text-amber-800 text-lg">Learning</span>
          </div>
          <div className="text-3xl md:text-4xl font-bold text-amber-600 mb-2">
            {technologies.filter(t => t.confidenceLevel < 6).length}
          </div>
          <div className="text-amber-700">Technologies (&lt;6)</div>
        </div>
      </div>

      {/* Summary Card */}
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-6 md:p-8 shadow-lg mx-4">
        <h3 className="text-xl font-bold text-gray-800 mb-6">Assessment Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 mb-1">
              {(technologies.reduce((sum, tech) => sum + tech.confidenceLevel, 0) / technologies.length).toFixed(1)}/10
            </div>
            <div className="text-gray-600">Average Confidence Level</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900 mb-1">{technologies.length}</div>
            <div className="text-gray-600">Technologies Assessed</div>
          </div>
        </div>
      </div>

      
      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center px-4">
        <button
          onClick={() => setStep('rating')}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-xl hover:bg-gray-50 transition-all shadow-lg hover:shadow-xl"
        >
          <Settings className="w-4 h-4" />
          Update Assessments
        </button>
        {onBack && (
          <button
            onClick={onBack}
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl hover:bg-indigo-50 transition-all shadow-lg hover:shadow-xl"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to CV Analysis
          </button>
        )}
        <button
          onClick={() => navigate('/interview')}
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-indigo-600 border-2 border-indigo-600 rounded-xl hover:bg-indigo-50 transition-all shadow-lg hover:shadow-xl"
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <div className="bg-white border border-red-200 rounded-2xl p-8 text-center shadow-xl">
            <div className="w-16 h-16 text-red-600 mx-auto mb-6 flex items-center justify-center bg-red-100 rounded-2xl shadow-inner">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-red-800 mb-4">
              {!resumeHash ? "Resume Analysis Required" : "No Technologies Found"}
            </h2>
            <p className="text-red-600 mb-6">
              {!resumeHash 
                ? "Please analyze your resume first to extract technologies for assessment."
                : "No technologies were extracted from your resume. Please ensure your resume contains technical skills and try analyzing again."
              }
            </p>
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 px-6 py-3 bg-white text-red-600 border-2 border-red-600 rounded-xl hover:bg-red-50 transition-all shadow-lg hover:shadow-xl"
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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      <div className="max-w-7xl mx-auto px-4 py-6 md:px-6 md:py-8">
        <style>{`
          .slider::-webkit-slider-thumb {
            appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
            transition: all 0.2s ease;
          }
          .slider::-webkit-slider-thumb:hover {
            background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
            transform: scale(1.1);
            box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
          }
          .slider::-moz-range-thumb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
            cursor: pointer;
            border: 3px solid #ffffff;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          }
          .slider::-webkit-slider-track {
            height: 12px;
            border-radius: 6px;
            background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
          }
          .slider::-moz-range-track {
            height: 12px;
            border-radius: 6px;
            background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
          }
          .slider:focus::-webkit-slider-track {
            background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
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
    </div>
  );
};

// API Configuration
const API_BASE_URL = import.meta.env?.VITE_BACKEND_URL || 'http://localhost:4000';

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
const CircularProgress = ({ percentage, label, colorIndex = 0 }) => {
  const colors = [
    { primary: "#4f46e5", secondary: "#e0e7ff", gradient: "from-indigo-500 to-purple-600" },
    { primary: "#059669", secondary: "#d1fae5", gradient: "from-emerald-500 to-teal-600" },
    { primary: "#d97706", secondary: "#fef3c7", gradient: "from-amber-500 to-orange-600" },
    { primary: "#dc2626", secondary: "#fee2e2", gradient: "from-red-500 to-pink-600" },
    { primary: "#7c3aed", secondary: "#ede9fe", gradient: "from-purple-500 to-indigo-600" },
    { primary: "#0891b2", secondary: "#cffafe", gradient: "from-cyan-500 to-blue-600" },
  ];
  const color = colors[colorIndex % colors.length];
  const strokeDasharray = 2 * Math.PI * 50;
  const strokeDashoffset = strokeDasharray - (strokeDasharray * percentage) / 100;

  return (
    <div className="flex flex-col items-center p-4 md:p-6 bg-white rounded-2xl border border-gray-200 hover:shadow-xl transition-all shadow-lg transform hover:scale-105">
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
            {percentage}%
          </span>
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-700 text-center">{label}</span>
    </div>
  );
};

// Enhanced Structured Recommendations Component
const StructuredRecommendations = ({ result, index }) => {
  const [activeTab, setActiveTab] = useState('strengths');

  if (result.isNonTechRole) {
    return (
      <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-4 md:p-6 rounded-2xl shadow-lg">
        <div className="flex items-center mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 mr-2 flex-shrink-0" />
          <h3 className="font-semibold text-amber-800">Non-Technical Role Detected</h3>
        </div>
        <p className="text-amber-700">{result.message}</p>
      </div>
    );
  }

  const tabs = [
    { id: 'strengths', label: 'Strengths', icon: CheckCircle, color: 'text-emerald-600', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
    { id: 'content', label: 'Content Issues', icon: FileText, color: 'text-amber-600', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
    { id: 'structure', label: 'Structure Issues', icon: Layout, color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
    { id: 'recommendations', label: 'Recommendations', icon: Lightbulb, color: 'text-indigo-600', bgColor: 'bg-indigo-50', borderColor: 'border-indigo-200' }
  ];

  const renderList = (items, icon, colorClass, bgClass) => {
    if (!items || items.length === 0) {
      return (
        <div className="text-gray-500 italic text-center py-8 bg-gray-50 rounded-xl">
          No items available for this category
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className={`flex items-start gap-4 p-4 ${bgClass} rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow`}>
            <icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${colorClass}`} />
            <span className="text-gray-700 leading-relaxed">{item}</span>
          </div>
        ))}
      </div>
    );
  };

  const renderTabContent = () => {
    const activeTabData = tabs.find(tab => tab.id === activeTab);
    
    switch (activeTab) {
      case 'strengths':
        return renderList(result.strengths, CheckCircle, 'text-emerald-600', 'bg-emerald-50');
      case 'content':
        return renderList(result.contentWeaknesses, FileText, 'text-amber-600', 'bg-amber-50');
      case 'structure':
        return renderList(result.structureWeaknesses, Layout, 'text-red-600', 'bg-red-50');
      case 'recommendations':
        const allRecommendations = [
          ...(result.contentRecommendations || []).map(rec => ({ text: rec, type: 'content' })),
          ...(result.structureRecommendations || []).map(rec => ({ text: rec, type: 'structure' }))
        ];
        return (
          <div className="space-y-4">
            {allRecommendations.length === 0 ? (
              <div className="text-gray-500 italic text-center py-8 bg-gray-50 rounded-xl">
                No recommendations available
              </div>
            ) : (
              allRecommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-indigo-50 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-5 h-5 text-indigo-600 flex-shrink-0" />
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      rec.type === 'content' 
                        ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                        : 'bg-purple-100 text-purple-700 border border-purple-200'
                    }`}>
                      {rec.type}
                    </span>
                  </div>
                  <span className="text-gray-700 leading-relaxed">{rec.text}</span>
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
    <div className="bg-white p-4 md:p-6 shadow-lg border border-gray-200 rounded-2xl hover:shadow-xl transition-all">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
        <h3 className="text-xl font-bold text-gray-800">Job Description {index + 1}</h3>
        <span
          className={`px-4 py-2 rounded-full text-sm font-bold shadow-sm ${
            result.matchPercentage >= 80
              ? "bg-gradient-to-r from-emerald-100 to-emerald-200 text-emerald-800 border border-emerald-300"
              : result.matchPercentage >= 60
              ? "bg-gradient-to-r from-amber-100 to-amber-200 text-amber-800 border border-amber-300"
              : "bg-gradient-to-r from-red-100 to-red-200 text-red-800 border border-red-300"
          }`}
        >
          Match Score: {result.matchPercentage}%
        </span>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 mb-8 bg-gradient-to-r from-gray-100 to-gray-200 p-2 rounded-2xl shadow-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 md:px-4 py-2 md:py-3 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? `bg-white ${tab.color} shadow-lg border ${tab.borderColor} transform scale-105`
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:shadow-sm'
              }`}
            >
              <Icon className={`w-4 h-4 ${activeTab === tab.id ? tab.color : 'text-gray-400'}`} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="min-h-[200px]">
        {renderTabContent()}
      </div>
    </div>
  );
};

const CVAnalyzer = () => {
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
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-4 md:p-6 shadow-lg">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="w-12 h-12 mx-auto text-gray-400 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <p className="text-gray-600">Checking for existing CV...</p>
            </div>
          </div>
        </div>
      );
    }

    if (cvUploadMode === 'profile' && profileCV) {
      return (
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-4 md:p-6 shadow-lg">
          <label className="block font-bold mb-4 text-gray-800">
            Choose CV Source
          </label>
          
          {/* Profile CV Option */}
          <div className={`p-4 rounded-xl border-2 cursor-pointer transition-all mb-4 ${
            useProfileCV 
              ? 'border-emerald-400 bg-emerald-50 shadow-lg' 
              : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-md'
          }`} onClick={handleUseProfileCV}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                useProfileCV ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-600'
              }`}>
                <User className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Use Profile CV</h3>
                <p className="text-sm text-gray-600">{profileCV.fileName}</p>
                <p className="text-xs text-gray-500">
                  Uploaded: {new Date(profileCV.uploadedAt).toLocaleDateString()}
                  {profileCV.fileSize && ` • ${(profileCV.fileSize / 1024).toFixed(1)} KB`}
                </p>
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                useProfileCV ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
              }`}>
                {useProfileCV && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
            </div>
          </div>

          {/* Upload New CV Option */}
          <div className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
            !useProfileCV && !resumeFile 
              ? 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-md' 
              : !useProfileCV && resumeFile
              ? 'border-emerald-400 bg-emerald-50 shadow-lg'
              : 'border-gray-300 bg-white hover:border-gray-400 hover:shadow-md'
          }`} onClick={handleUploadNewCV}>
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                !useProfileCV && resumeFile 
                  ? 'bg-emerald-500 text-white' 
                  : 'bg-gray-100 text-gray-600'
              }`}>
                <Upload className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">Upload New CV</h3>
                <p className="text-sm text-gray-600">
                  {resumeFile ? resumeFile.name : 'Choose a different PDF file'}
                </p>
                {resumeFile && (
                  <p className="text-xs text-gray-500">
                    {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
              </div>
              <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                !useProfileCV && resumeFile ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
              }`}>
                {!useProfileCV && resumeFile && <div className="w-2 h-2 bg-white rounded-full"></div>}
              </div>
            </div>
          </div>

          {/* File Upload Area (only show when upload new is selected) */}
          {!useProfileCV && (
            <div className="mt-4">
              <div
                className={`relative border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-all ${
                  dragActive
                    ? "border-indigo-400 bg-indigo-50 scale-105 shadow-lg"
                    : resumeFile
                    ? "border-emerald-400 bg-emerald-50 shadow-lg"
                    : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 hover:shadow-md"
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
                    <div className="w-12 h-12 mx-auto text-emerald-600 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-lg">
                      <CheckCircle className="w-6 h-6" />
                    </div>
                    <p className="font-semibold text-emerald-700 truncate">{resumeFile.name}</p>
                    <p className="text-sm text-emerald-600">
                      {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="w-12 h-12 mx-auto text-gray-400 bg-gray-100 rounded-2xl flex items-center justify-center">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-gray-600">
                        <span className="font-semibold text-indigo-600">
                          Click to upload
                        </span>{" "}
                        or drag and drop
                      </p>
                      <p className="text-sm text-gray-500 mt-1">PDF files up to 10MB</p>
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
      <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-4 md:p-6 shadow-lg">
        <label className="block font-bold mb-4 text-gray-800">
          Upload Resume (PDF only)
        </label>
        <div
          className={`relative border-2 border-dashed rounded-2xl p-6 md:p-8 text-center transition-all ${
            dragActive
              ? "border-indigo-400 bg-indigo-50 scale-105 shadow-lg"
              : resumeFile
              ? "border-emerald-400 bg-emerald-50 shadow-lg"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50 hover:shadow-md"
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
              <div className="w-12 h-12 mx-auto text-emerald-600 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-lg">
                <CheckCircle className="w-6 h-6" />
              </div>
              <p className="font-semibold text-emerald-700 truncate">{resumeFile.name}</p>
              <p className="text-sm text-emerald-600">
                {(resumeFile.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="w-12 h-12 mx-auto text-gray-400 bg-gray-100 rounded-2xl flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>
              <div>
                <p className="text-gray-600">
                  <span className="font-semibold text-indigo-600">
                    Click to upload
                  </span>{" "}
                  or drag and drop
                </p>
                <p className="text-sm text-gray-500 mt-1">PDF files up to 10MB</p>
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <div className="min-h-screen bg-gray-50">
                      <NavBar />
      <div className="flex flex-col lg:flex-row min-h-screen">

        {/* Left Sidebar - 50% width on desktop */}
        <div className="w-full lg:w-1/2 bg-white border-r border-gray-200 shadow-xl">
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 md:p-6 space-y-6 md:space-y-8">
              {/* Header */}
              <div className="text-center lg:text-left">
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-indigo-100 to-purple-100 px-4 py-2 rounded-full text-indigo-700 font-medium text-sm mb-4">
                  <Target className="w-4 h-4" />
                  AI-Powered Analysis
                </div>
                <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-2">
                  CV Analyzer
                </h1>
                <p className="text-gray-600">Upload your resume and compare it against job descriptions</p>
              </div>

              {/* Error Display */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-4 rounded-2xl shadow-lg animate-pulse">
                  <div className="flex items-start">
                    <XCircle className="w-5 h-5 mr-3 flex-shrink-0 mt-0.5" />
                    <span className="text-sm leading-relaxed">{error}</span>
                  </div>
                </div>
              )}

              {/* CV Source Selection */}
              {renderCVSourceSelection()}

              {/* Job Descriptions */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200 p-4 md:p-6 shadow-lg">
                <div className="flex justify-between items-center mb-4">
                  <label className="block font-bold text-gray-800">
                    Job Descriptions
                  </label>
                  <span className="text-sm text-gray-500 bg-white px-3 py-1 rounded-full shadow-sm border border-gray-200 font-medium">
                    {jobDescriptions.length}/5
                  </span>
                </div>

                <div className="space-y-4 max-h-96 overflow-y-auto custom-scrollbar">
                  {jobDescriptions.map((jd, index) => (
                    <div key={index} className="relative">
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <textarea
                            className="w-full p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all resize-none shadow-sm hover:shadow-md bg-white"
                            rows="4"
                            placeholder={`Enter job description ${index + 1}...`}
                            value={jd}
                            onChange={(e) => handleJDChange(index, e.target.value)}
                          />
                          <div className="flex justify-between mt-2">
                            <span className="text-xs text-gray-500 font-medium bg-gray-100 px-2 py-1 rounded">
                              JD {index + 1}
                            </span>
                            <span
                              className={`text-xs font-medium px-2 py-1 rounded ${
                                jd.length < 50 
                                  ? "text-amber-600 bg-amber-100" 
                                  : "text-emerald-600 bg-emerald-100"
                              }`}
                            >
                              {jd.length} chars
                            </span>
                          </div>
                        </div>

                        {jobDescriptions.length > 1 && (
                          <button
                            onClick={() => removeJD(index)}
                            className="self-start mt-1 p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all shadow-sm hover:shadow-md"
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
                    className="w-full mt-4 p-3 text-sm bg-white text-indigo-700 border-2 border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all font-medium shadow-sm hover:shadow-md flex items-center justify-center gap-2"
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
                  className={`w-full px-6 py-4 rounded-2xl font-bold transition-all text-lg shadow-lg ${
                    loading ||
                    (!useProfileCV && !resumeFile) ||
                    (useProfileCV && !profileCV) ||
                    jobDescriptions.some((jd) => jd.trim() === "")
                      ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                      : "bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 active:scale-95 shadow-xl hover:shadow-2xl"
                  }`}
                >
                  {loading ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
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
                    className="w-full px-6 py-3 bg-white text-gray-700 border-2 border-gray-300 rounded-2xl hover:bg-gray-50 transition-all disabled:opacity-50 font-medium shadow-lg hover:shadow-xl"
                  >
                    Clear All
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      

        {/* Right Content Area - 50% width on desktop */}
        <div className="w-full lg:w-1/2 flex-1 min-h-screen">
          <div className="h-full overflow-y-auto custom-scrollbar">
            <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
              {loading && (
                <div className="flex justify-center items-center py-32">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-6"></div>
                    <h3 className="text-xl font-semibold text-gray-700 mb-3">
                      Analyzing Your Resume
                    </h3>
                    <p className="text-gray-500">This may take a few moments...</p>
                  </div>
                </div>
              )}

              {!loading && results.length > 0 && (
                <>
                  {/* Match Scores */}
                  <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-6 md:p-8">
                    <h2 className="text-2xl md:text-3xl font-bold mb-6 bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
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
                          label={`Job Description ${idx + 1}`}
                          colorIndex={idx}
                        />
                      ))}
                    </div>
                  </div>

                  {/* CV Source Info */}
                  <div className="bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100 border border-gray-200 p-4 md:p-6 rounded-2xl shadow-lg">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-gradient-to-r from-gray-500 to-gray-600 rounded-xl shadow-sm">
                        {useProfileCV ? <User className="w-5 h-5 text-white" /> : <Upload className="w-5 h-5 text-white" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-800">CV Source</h3>
                        <p className="text-sm text-gray-600">
                          {useProfileCV 
                            ? `Using profile CV: ${profileCV?.fileName || 'Unknown'}` 
                            : `Uploaded file: ${resumeFile?.name || 'Unknown'}`
                          }
                        </p>
                      </div>
                    </div>
                    {resumeData?.extractedTechnologies?.length > 0 && (
                      <p className="text-sm text-gray-500 ml-11">
                        {resumeData.extractedTechnologies.length} technologies extracted
                      </p>
                    )}
                  </div>

                  {/* Skills Assessment Navigation */}
                  <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 border border-indigo-200 p-6 md:p-8 rounded-2xl shadow-xl">
                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-2xl shadow-lg">
                          <BarChart3 className="w-8 h-8 text-white" />
                        </div>
                        <div>
                          <h3 className="text-xl md:text-2xl font-bold text-gray-900">Skills Assessment</h3>
                          <p className="text-gray-600 mt-1">
                            Rate your confidence level for each extracted technology
                            {resumeData?.extractedTechnologies?.length > 0 && (
                              <span className="ml-1 text-indigo-600 font-semibold">
                                ({resumeData.extractedTechnologies.length} technologies found)
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleNavigateToSkillsAssessment}
                        disabled={!resumeData || !resumeData.extractedTechnologies?.length}
                        className={`px-6 md:px-8 py-3 md:py-4 rounded-2xl font-bold transition-all shadow-lg ${
                          !resumeData || !resumeData.extractedTechnologies?.length
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                            : "bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 active:scale-95 shadow-xl hover:shadow-2xl"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Star className="w-5 h-5" />
                          Start Assessment
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Detailed Analysis */}
                  <div className="space-y-6">
                    <h2 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
                      Detailed Analysis Results
                    </h2>
                    {results.map((res, idx) => (
                      <div key={idx} className="space-y-4">
                        <StructuredRecommendations result={res} index={idx} />
                        <div className="flex justify-end">
                          <button
                            className={`px-6 py-3 rounded-2xl transition-all font-bold shadow-lg ${
                              savedIndices.includes(idx)
                                ? "bg-gray-600 cursor-not-allowed text-white"
                                : "bg-white text-indigo-600 border-2 border-indigo-600 hover:bg-indigo-50 hover:shadow-xl active:scale-95"
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
                <div className="text-center py-16 md:py-32 bg-white border border-gray-200 rounded-2xl shadow-xl">
                  <div className="w-20 h-20 mx-auto text-gray-400 mb-6 bg-gradient-to-br from-gray-100 to-gray-200 rounded-3xl flex items-center justify-center shadow-inner">
                    <FileText className="w-10 h-10" />
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-700 mb-4">
                    Ready to Analyze Your Resume
                  </h3>
                  <p className="text-gray-500 max-w-md mx-auto leading-relaxed px-4">
                    {cvUploadMode === 'profile' && profileCV 
                      ? "Use your profile CV or upload a new one, then add job descriptions to get started."
                      : "Upload your resume and add job descriptions to get started with our comprehensive analysis."
                    }
                    <br /><br />
                    <span className="text-sm text-gray-400">
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
      <style jsx>{`
        /* Custom scrollbar styling */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }
        
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 4px;
          border: 1px solid #f1f5f9;
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

        /* Responsive text adjustments */
        @media (max-width: 640px) {
          h1 { font-size: 1.75rem !important; }
          h2 { font-size: 1.5rem !important; }
          h3 { font-size: 1.25rem !important; }
        }

        /* Enhanced button hover effects */
        .btn-gradient:hover {
          transform: translateY(-2px);
          box-shadow: 0 20px 40px rgba(79, 70, 229, 0.3);
        }

        /* Smooth transitions for all interactive elements */
        * {
          transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
          transition-duration: 200ms;
          transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Enhanced focus states for accessibility */
        button:focus-visible,
        input:focus-visible,
        textarea:focus-visible {
          outline: 2px solid #6366f1;
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
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
          transition: all 0.2s ease;
        }
        
        .slider::-webkit-slider-thumb:hover {
          background: linear-gradient(135deg, #4338ca 0%, #6d28d9 100%);
          transform: scale(1.1);
          box-shadow: 0 6px 16px rgba(79, 70, 229, 0.4);
        }
        
        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          border-radius: 50%;
          background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%);
          cursor: pointer;
          border: 3px solid #ffffff;
          box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        
        .slider::-webkit-slider-track {
          height: 12px;
          border-radius: 6px;
          background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
        }
        
        .slider::-moz-range-track {
          height: 12px;
          border-radius: 6px;
          background: linear-gradient(135deg, #e5e7eb 0%, #d1d5db 100%);
        }
        
        .slider:focus::-webkit-slider-track {
          background: linear-gradient(135deg, #d1d5db 0%, #9ca3af 100%);
        }
      `}</style>
    </div>
  );
};

export default CVAnalyzer;