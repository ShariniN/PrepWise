import React, { useState } from "react";
import { CheckCircle, AlertTriangle, Lightbulb, FileText, Layout } from "lucide-react";
import ScoreBreakdown from './ScoreBreakdown';

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
    switch (activeTab) {
      case 'strengths':
        return renderList(result.strengths, CheckCircle, 'text-success-600', 'bg-success-50');
      case 'content':
        return renderList(result.contentWeaknesses, FileText, 'text-sun-600', 'bg-sun-50');
      case 'structure':
        return renderList(result.structureWeaknesses, Layout, 'text-danger-600', 'bg-danger-50');
      case 'recommendations': {
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
      }
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

export default StructuredRecommendations;
