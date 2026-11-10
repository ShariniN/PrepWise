import React, { useState } from "react";
import { AlertTriangle, BarChart3, Star, TrendingUp, Settings, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";

// Self-rating of the technologies found in the CV, opened from an analysis result.
const SkillsAssessment = ({
  resumeHash = null,
  extractedTechnologies = [],
  onBack = null,
}) => {
  const [step, setStep] = useState('rating');
  const [technologies, setTechnologies] = useState([]);
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
                    {techs.map((tech) => {
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

export default SkillsAssessment;
