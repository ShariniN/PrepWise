import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AppShell from '../../components/AppShell';
import { backendUrl } from '../../api/client';
import { Button, Card, EmptyState } from '../../components/ui';

// Simple icon components to replace Lucide icons
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

const ArrowLeft = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="19" y1="12" x2="5" y2="12"></line>
    <polyline points="12,19 5,12 12,5"></polyline>
  </svg>
);

const ArrowRight = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12,5 19,12 12,19"></polyline>
  </svg>
);

const MessageCircle = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
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

const Star = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"></polygon>
  </svg>
);

const TrendingUp = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <polyline points="23,6 13.5,15.5 8.5,10.5 1,18"></polyline>
    <polyline points="17,6 23,6 23,12"></polyline>
  </svg>
);

const TECH_CATEGORIES = ['Programming Languages', 'Web Frameworks', 'Development Tools', 'Databases', 'CS Concepts', 'Other Technical'];
const NO_TECHNOLOGIES = [];

// Opened from the CV analyzer (props, or router state { resumeHash, extractedTechnologies, technologiesUnavailable })
// or straight from the navigation, in which case it asks for a CV analysis first.
const SWOTAnalysis = (props) => {
  const navState = useLocation().state || {};
  const resumeHash = props.resumeHash ?? navState.resumeHash ?? null;
  const extractedTechnologies = props.extractedTechnologies ?? navState.extractedTechnologies ?? NO_TECHNOLOGIES;
  const technologiesUnavailable = !!(props.technologiesUnavailable ?? navState.technologiesUnavailable);
  const { onBack = null, onGoToInterview = null } = props;
  const [step, setStep] = useState('rating');
  const [newTech, setNewTech] = useState({ name: '', category: TECH_CATEGORIES[0] });
  const [technologies, setTechnologies] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Every extracted technology starts at a rating of 5 (intermediate).
  useEffect(() => {
    if (extractedTechnologies && extractedTechnologies.length > 0) {
      const initializedTechnologies = extractedTechnologies.map(tech => ({
        name: tech.name,
        category: tech.category,
        confidenceLevel: 5
      }));
      setTechnologies(initializedTechnologies);
    }
  }, [extractedTechnologies]);

  // Add a technology by hand (when extraction failed, or one is missing from the list)
  const handleAddTechnology = (e) => {
    e.preventDefault();
    const name = newTech.name.trim().slice(0, 60);
    if (!name) return;
    if (technologies.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setError(`${name} is already in the list.`);
      return;
    }
    setError('');
    setTechnologies((list) => [...list, { name, category: newTech.category, confidenceLevel: 5 }]);
    setNewTech((t) => ({ ...t, name: '' }));
  };

  const addTechnologyForm = (
    <form onSubmit={handleAddTechnology} aria-label="Add a technology" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label htmlFor="sk-new-name" className="mb-1 block text-sm font-medium text-ink-2">Technology</label>
        <input id="sk-new-name" value={newTech.name} maxLength={60} placeholder="e.g. Python"
          onChange={(e) => setNewTech((t) => ({ ...t, name: e.target.value }))}
          className="w-full rounded-xl border border-line p-2 focus:border-transparent focus:ring-2 focus:ring-primary-500" />
      </div>
      <div>
        <label htmlFor="sk-new-cat" className="mb-1 block text-sm font-medium text-ink-2">Category</label>
        <select id="sk-new-cat" value={newTech.category} onChange={(e) => setNewTech((t) => ({ ...t, category: e.target.value }))}
          className="w-full rounded-xl border border-line bg-surface p-2 focus:ring-2 focus:ring-primary-500">
          {TECH_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <Button type="submit" variant="secondary" disabled={!newTech.name.trim()}>Add</Button>
    </form>
  );

  // Handle confidence rating changes
  const handleRatingChange = (techIndex, newRating) => {
    const updatedTechnologies = [...technologies];
    updatedTechnologies[techIndex].confidenceLevel = parseInt(newRating);
    setTechnologies(updatedTechnologies);
  };

  // Save ratings to backend
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
      const response = await fetch(`${backendUrl}/api/swot/save-ratings`, {
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

      let data;
      const contentType = response.headers.get('content-type');

      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(`Server returned ${response.status}: ${text.slice(0, 100)}...`);
      }

      if (!response.ok) {
        throw new Error(data.message || `HTTP error! status: ${response.status}`);
      }

      setSuccess(data.message || 'Technology ratings saved successfully!');
      setStep('success');

    } catch (err) {
      console.error('Error saving ratings:', err);
      if (err.message.includes('404')) {
        setError('API endpoint not found. Please check that the PrepWise server is running.');
      } else if (err.message.includes('Failed to fetch')) {
        setError('Cannot connect to server. Please check if your backend is running.');
      } else {
        setError(err.message || 'Failed to save technology ratings. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  };

  // Get confidence level color
  const getConfidenceColor = (level) => {
    if (level >= 8) return 'text-success-700 bg-success-100';
    if (level >= 6) return 'text-primary-800 bg-primary-100';
    if (level >= 4) return 'text-sun-700 bg-sun-100';
    return 'text-danger-700 bg-danger-100';
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

  // Calculate statistics
  const getStatistics = () => {
    return {
      total: technologies.length,
      expert: technologies.filter(t => t.confidenceLevel >= 8).length,
      proficient: technologies.filter(t => t.confidenceLevel >= 6 && t.confidenceLevel < 8).length,
      intermediate: technologies.filter(t => t.confidenceLevel >= 4 && t.confidenceLevel < 6).length,
      beginner: technologies.filter(t => t.confidenceLevel < 4).length
    };
  };

  const stats = getStatistics();

  const renderRatingStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="font-display text-3xl font-semibold text-ink mb-2">Rate Your Technology Confidence</h2>
        <p className="text-ink-2 text-lg">
          Adjust your confidence level for each technology from 1 (beginner) to 10 (expert)
        </p>
        {technologies.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <div className="bg-primary-50 border border-primary-100 rounded-full px-4 py-2">
              <span className="text-primary-800 font-semibold">{technologies.length} {technologies.length === 1 ? 'technology' : 'technologies'}</span>
            </div>
            <div className="bg-success-100 rounded-full px-4 py-2">
              <span className="text-success-700 font-medium">All start at intermediate level (5/10)</span>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div role="alert" className="bg-danger-100 rounded-2xl p-4">
          <div className="flex items-center">
            <AlertCircle />
            <span className="text-danger-700 ml-2">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-success-100 rounded-2xl p-4">
          <div className="flex items-center">
            <CheckCircle />
            <span className="text-success-700 ml-2">{success}</span>
          </div>
        </div>
      )}

      {technologies.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title={technologiesUnavailable ? 'Technologies could not be extracted' : 'No technologies found'}
            description={technologiesUnavailable
              ? 'Could not extract technologies from your CV right now; add them manually or try again.'
              : 'No technologies were found on your CV. Add the ones you use below, or check that your CV lists your technical skills.'}
            action={onBack
              ? <Button onClick={onBack} icon={<ArrowLeft />}>Back to CV Analysis</Button>
              : <Button as={Link} to="/cv-analyzer" variant="secondary" icon={<ArrowLeft />}>Try again in the CV Analyzer</Button>}
          />
          {addTechnologyForm}
        </div>
      ) : (
        <>
          <div className="max-h-[32rem] overflow-y-auto bg-sand p-4 rounded-3xl">
            {Object.entries(groupedTechnologies).map(([category, techs]) => (
              <div key={category} className="mb-6">
                <h3 className="font-display text-lg font-semibold text-ink mb-3 sticky top-0 bg-sand py-2">
                  {category}
                </h3>
                <div className="space-y-3">
                  {techs.map((tech) => {
                    const globalIndex = technologies.findIndex(t => t.name === tech.name);
                    return (
                      <div key={globalIndex} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border border-line rounded-2xl bg-surface shadow-soft hover:shadow-card transition-shadow">
                        <div className="flex-1">
                          <h4 className="font-semibold text-ink">{tech.name}</h4>
                          <div className="flex items-center mt-1">
                            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${getConfidenceColor(tech.confidenceLevel)}`}>
                              {getConfidenceText(tech.confidenceLevel)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="text-sm text-ink-muted font-medium">1</span>
                          <input
                            type="range"
                            min="1"
                            max="10"
                            value={tech.confidenceLevel}
                            onChange={(e) => handleRatingChange(globalIndex, e.target.value)}
                            className="w-32 h-2 bg-sand rounded-lg appearance-none cursor-pointer slider"
                          />
                          <span className="text-sm text-ink-muted font-medium">10</span>
                          <div className={`ml-3 px-3 py-1 rounded-xl font-bold text-lg min-w-[3rem] text-center ${getConfidenceColor(tech.confidenceLevel)}`}>
                            {tech.confidenceLevel}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {addTechnologyForm}

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            {onBack && (
              <Button variant="secondary" onClick={onBack} icon={<ArrowLeft />}>Back to CV Analysis</Button>
            )}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <div className="text-sm text-ink-2">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span>Expert (8-10): <strong>{stats.expert}</strong></span>
                  <span>Proficient (6-7): <strong>{stats.proficient}</strong></span>
                  <span>Intermediate (4-5): <strong>{stats.intermediate}</strong></span>
                  <span>Beginner (1-3): <strong>{stats.beginner}</strong></span>
                </div>
              </div>
              <Button
                size="lg"
                onClick={handleSaveRatings}
                disabled={saving || technologies.length === 0}
              >
                {saving ? (
                  <>
                    <Loader className="w-5 h-5 mr-2 animate-spin" />
                    Saving Ratings...
                  </>
                ) : (
                  <>
                    <Star />
                    <span className="ml-2">Save Technology Ratings</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );

  const renderSuccessStep = () => {
    const averageConfidence = technologies.length > 0
      ? technologies.reduce((sum, tech) => sum + tech.confidenceLevel, 0) / technologies.length
      : 0;

    return (
      <div className="space-y-8 text-center">
        <div className="w-20 h-20 bg-success-100 text-success-700 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle />
        </div>

        <div>
          <h2 className="font-display text-3xl font-semibold text-success-700 mb-2">Ratings Saved Successfully!</h2>
          <p className="text-ink-2 text-lg">
            Your technology confidence ratings have been saved for {stats.total} technologies
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
          <div className="bg-success-100 rounded-3xl p-4">
            <div className="flex items-center justify-center mb-2 text-success-700">
              <TrendingUp />
              <span className="font-bold text-success-700 ml-2 text-sm">Expert</span>
            </div>
            <div className="font-display text-3xl font-semibold text-success-700 mb-1">
              {stats.expert}
            </div>
            <div className="text-xs text-success-700">Level 8-10</div>
          </div>

          <div className="bg-primary-100 rounded-3xl p-4">
            <div className="flex items-center justify-center mb-2 text-primary-800">
              <Star />
              <span className="font-bold text-primary-800 ml-2 text-sm">Proficient</span>
            </div>
            <div className="font-display text-3xl font-semibold text-primary-800 mb-1">
              {stats.proficient}
            </div>
            <div className="text-xs text-primary-800">Level 6-7</div>
          </div>

          <div className="bg-sun-100 rounded-3xl p-4">
            <div className="flex items-center justify-center mb-2 text-sun-700">
              <AlertCircle />
              <span className="font-bold text-sun-700 ml-2 text-sm">Intermediate</span>
            </div>
            <div className="font-display text-3xl font-semibold text-sun-700 mb-1">
              {stats.intermediate}
            </div>
            <div className="text-xs text-sun-700">Level 4-5</div>
          </div>

          <div className="bg-danger-100 rounded-3xl p-4">
            <div className="flex items-center justify-center mb-2 text-danger-700">
              <AlertCircle />
              <span className="font-bold text-danger-700 ml-2 text-sm">Beginner</span>
            </div>
            <div className="font-display text-3xl font-semibold text-danger-700 mb-1">
              {stats.beginner}
            </div>
            <div className="text-xs text-danger-700">Level 1-3</div>
          </div>
        </div>

        <div className="bg-sand rounded-3xl p-6 max-w-2xl mx-auto">
          <h3 className="font-display text-lg font-semibold text-ink mb-4">Rating Summary</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-ink-2">Average Confidence:</span>
              <span className="font-bold text-ink ml-2">
                {averageConfidence.toFixed(1)}/10
              </span>
            </div>
            <div>
              <span className="text-ink-2">Technologies Rated:</span>
              <span className="font-bold text-ink ml-2">{stats.total}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 justify-center">
          <Button variant="secondary" onClick={() => setStep('rating')} icon={<ArrowLeft />}>Update Ratings</Button>
          {onBack && <Button variant="dark" onClick={onBack}>Back to CV Analysis</Button>}
          {onGoToInterview && (
            <Button onClick={onGoToInterview} icon={<MessageCircle />} iconRight={<ArrowRight />}>Start Interview Practice</Button>
          )}
        </div>
      </div>
    );
  };

  // Ratings belong to an analysed CV, so without one there is nothing to rate yet.
  if (!resumeHash) {
    return (
      <AppShell width="narrow" title="Skills" subtitle="Rate your confidence in the technologies found on your CV.">
        <Card tone="sand" className="text-center !p-8 sm:!p-10">
          <div className="w-16 h-16 text-primary-700 mx-auto mb-4 flex items-center justify-center rounded-2xl bg-primary-100">
            <AlertCircle />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink mb-3">Analyse your CV first</h2>
          <p className="text-ink-2 mb-6">
            The skills self-assessment uses the technologies found on your CV. Analyse your CV against a job description,
            then choose Start Assessment on the results.
          </p>
          {onBack
            ? <Button onClick={onBack} icon={<ArrowLeft />}>Back to CV Analysis</Button>
            : <Button as={Link} to="/cv-analyzer" iconRight={<ArrowRight />}>Go to the CV Analyzer</Button>}
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Skills" subtitle="Rate your confidence in the technologies found on your CV.">
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-moz-range-thumb {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4f46e5;
          cursor: pointer;
          border: 2px solid #ffffff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .slider::-webkit-slider-track {
          height: 8px;
          border-radius: 4px;
          background: #ebe7dc;
        }
        .slider::-moz-range-track {
          height: 8px;
          border-radius: 4px;
          background: #ebe7dc;
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
    </AppShell>
  );
};

export default SWOTAnalysis;