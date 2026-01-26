import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { AppContext } from "../context/AppContext";

const SavedAnalysis = () => {
  // Get backend URL from global context
  const { backendUrl } = useContext(AppContext);
  // State to hold the list of saved CV analyses fetched from backend
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  // Loading state to show a loading indicator while fetching data
  const [loading, setLoading] = useState(true);

  // Function to fetch saved CV analyses from backend API
  const fetchSavedAnalyses = async () => {
    try {
      // Make GET request to fetch saved analyses
      const { data } = await axios.get(`${backendUrl}/api/analyze/saved`);

      // Update state with fetched saved analyses or empty array if none found
      setSavedAnalyses(data.savedAnalyses || []);
    } catch (error) {
      console.error("Failed to fetch saved analyses:", error.message);
    } finally {
      setLoading(false);
    }
  };

  // Function to delete a saved analysis by its id
  const handleDelete = async (id) => {
    // Confirm user wants to delete
    if (!window.confirm("Are you sure you want to delete this analysis?")) return;
    try {
      // Send DELETE request to backend
      await axios.delete(`${backendUrl}/api/analyze/delete/${id}`);

      // Update state by removing the deleted analysis
      setSavedAnalyses(savedAnalyses.filter((entry) => entry._id !== id));
    } catch (error) {
      console.error("Delete failed:", error.message);
      alert("Failed to delete analysis.");
    }
  };

  // Fetch saved analyses on component mount
  useEffect(() => {
    fetchSavedAnalyses();
  }, []);

  // While loading, show a loading message
  if (loading) {
    return <div className="text-center py-10">Loading saved analyses...</div>;
  }

  if (!loading && savedAnalyses.length === 0) {
    return null; 
  }

  return (
    <div className="mx-auto">
      <h2 className="text-2xl text-gray-800 font-bold mb-4 mt-8">Saved CV Analyses</h2>
      {savedAnalyses.map((entry, i) => (
        <div key={i} className="bg-white shadow-md rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-600 font-semibold mb-2">Saved on: {new Date(entry.createdAt).toLocaleString()}</p>
              <div className="mb-4">
                <p className="font-semibold mb-1">Resume Name:</p>
                <p className="mb-2 text-gray-700">{entry.resumeText}</p>
              </div>
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-6">
            <div className="sm:w-1/2">
              <p className="font-semibold sm:mt-4 mb-2">Job Description:</p>
              {entry.jobDescriptions.map((jd, idx) => (
                <div
                  key={idx}
                  className="bg-gray-50 p-3 rounded-md text-sm text-gray-700 mb-3 whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{ __html: jd }}
                />
              ))}
            </div>

            <div className="sm:w-1/2"> 
              <p className="font-semibold sm:mt-4 mb-2">Results:</p>
              {entry.results.map((result, idx) => (
                <div key={idx} className="border border-gray-300 bg-gray-50 rounded-lg p-3 mb-3">
                  <p className="font-medium text-blue-600">Match: {result.matchPercentage}%</p>
                  <div
                    className="prose prose-sm max-w-none mt-2 text-sm text-gray-800"
                    dangerouslySetInnerHTML={{ __html: result.suggestions }}
                  />
                </div>
              ))}
            </div>
          </div>
          <button
            onClick={() => handleDelete(entry._id)}
            className="mt-3 mb-3 text-sm font-semibold text-red-600 hover:text-red-700"
          >
            Remove Analysis
          </button>
        </div>
      ))}
    </div>
  );
};

export default SavedAnalysis;
