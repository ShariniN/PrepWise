
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // Add this import
import { 
  BookOpen, Users, User, Clock, Calendar, CheckCircle, AlertCircle,
  TrendingUp, Award, Star, ArrowRight, Search, Target, MapPin, DollarSign,
  Filter, ChevronDown, ExternalLink
} from 'lucide-react';
import NavBar from "../components/NavBar";

const TrainingPage = () => {
  const navigate = useNavigate(); // Add this line
  
  // States
  const [interviewResults, setInterviewResults] = useState(null);
  const [allTrainings, setAllTrainings] = useState([]);
  const [recommendedTrainings, setRecommendedTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedType, setSelectedType] = useState('all');
  const [priceFilter, setPriceFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [trainingsPerPage] = useState(6);

  // Fetch data on component mount
  useEffect(() => {
    fetchSkillsAssessment();
    fetchAllTrainings();
  }, []);

  // Update recommendations when data changes
  useEffect(() => {
    if (interviewResults && allTrainings.length > 0) {
      generateRecommendations();
    }
  }, [interviewResults, allTrainings]);

  const fetchSkillsAssessment = async () => {
    try {
      const response = await fetch('/api/swot/ratings', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success && data.data.length > 0) {
        const latestAssessment = data.data[0];
        const transformedData = {
          overallScore: latestAssessment.overallScore || 0,
          skills: latestAssessment.skills.map(skill => ({
            name: skill.name,
            category: mapCategoryForInterview(skill.category),
            score: skill.proficiencyLevel * 10,
            type: determineSkillType(skill.name, skill.category)
          }))
        };
        setInterviewResults(transformedData);
      } else {
        setInterviewResults({ overallScore: 0, skills: [] });
      }
    } catch (err) {
      console.error('Error fetching skills:', err);
      setError('Failed to load skills assessment data');
      setInterviewResults({ overallScore: 0, skills: [] });
    }
  };

  const fetchAllTrainings = async () => {
    try {
      const response = await fetch('/api/trainings/all', {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setAllTrainings(data.data || []);
      } else {
        setError('Failed to fetch trainings');
      }
    } catch (err) {
      console.error('Error fetching trainings:', err);
      setError('Failed to load trainings');
    } finally {
      setLoading(false);
    }
  };

  const generateRecommendations = () => {
    const skillsNeedingImprovement = interviewResults.skills.filter(skill => skill.score < 60);
    
    const recommended = allTrainings.filter(training => {
      // Check if training title or category matches skills needing improvement
      return skillsNeedingImprovement.some(skill => {
        const skillNameLower = skill.name.toLowerCase();
        const trainingTitleLower = training.title.toLowerCase();
        const trainingCategoryLower = training.trainingCategory?.toLowerCase() || '';
        
        return trainingTitleLower.includes(skillNameLower) || 
               trainingCategoryLower.includes(skillNameLower) ||
               skillNameLower.includes(trainingTitleLower.split(' ')[0]);
      });
    });

    setRecommendedTrainings(recommended);
  };

  // Helper functions
  const mapCategoryForInterview = (mongoCategory) => {
    const categoryMap = {
      'Programming Languages': 'technical',
      'Frameworks': 'technical', 
      'Databases': 'technical',
      'Tools': 'technical',
      'General': 'technical',
      'Soft Skills': 'soft',
      'Communication': 'soft',
      'Leadership': 'soft'
    };
    return categoryMap[mongoCategory] || 'technical';
  };

  const determineSkillType = (skillName, category) => {
    const name = skillName.toLowerCase();
    if (name.includes('javascript') || name.includes('python') || name.includes('java')) return 'programming';
    if (name.includes('react') || name.includes('vue') || name.includes('angular')) return 'frontend';
    if (name.includes('node') || name.includes('express') || name.includes('api')) return 'backend';
    if (name.includes('communication') || name.includes('presentation')) return 'interpersonal';
    if (name.includes('leadership') || name.includes('management')) return 'management';
    return 'analytical';
  };

  // Filter trainings based on search and filters
  const getFilteredTrainings = (trainings) => {
    return trainings.filter(training => {
      const matchesSearch = training.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          training.description.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCategory = selectedCategory === 'all' || 
                            training.trainingCategory?.toLowerCase() === selectedCategory.toLowerCase();
      
      const matchesType = selectedType === 'all' || training.trainingType === selectedType;
      
      const matchesPrice = priceFilter === 'all' || 
                         (priceFilter === 'free' && (!training.price || training.price === '0' || training.price.toLowerCase().includes('free'))) ||
                         (priceFilter === 'paid' && training.price && !training.price.toLowerCase().includes('free'));
      
      return matchesSearch && matchesCategory && matchesType && matchesPrice;
    });
  };

  // Pagination logic
  const getPaginatedTrainings = (trainings) => {
    const indexOfLastTraining = currentPage * trainingsPerPage;
    const indexOfFirstTraining = indexOfLastTraining - trainingsPerPage;
    return trainings.slice(indexOfFirstTraining, indexOfLastTraining);
  };

  const paginate = (pageNumber) => setCurrentPage(pageNumber);

  // Component: Score Card
  const ScoreCard = ({ skill }) => {
    const getScoreColor = (score) => score >= 80 ? 'from-green-500 to-emerald-600' : score >= 60 ? 'from-yellow-500 to-orange-600' : 'from-red-500 to-pink-600';
    const getScoreTextColor = (score) => score >= 80 ? 'text-green-800 bg-green-100' : score >= 60 ? 'text-yellow-800 bg-yellow-100' : 'text-red-800 bg-red-100';
    
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 truncate">{skill.name}</h3>
          <span className={`px-2 py-1 rounded-full text-xs font-bold ${getScoreTextColor(skill.score)}`}>
            {skill.score}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
          <div 
            className={`h-2 rounded-full bg-gradient-to-r ${getScoreColor(skill.score)} transition-all duration-500`} 
            style={{ width: `${skill.score}%` }}
          ></div>
        </div>
      </div>
    );
  };

  // Component: Training Card - FIXED NAVIGATION HANDLERS
  const TrainingCard = ({ training, isRecommended = false }) => {
    const handleViewDetails = () => {
      navigate(`/training-details/${training._id}`);
    };

    const handleRegister = () => {
      navigate(`/training-booking/${training._id}`);
    };

    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
        {isRecommended && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white text-xs font-semibold py-2 px-4">
            <Star className="inline-block w-3 h-3 mr-1" />
            Recommended for you
          </div>
        )}
        
        <div className="p-6">
          <div className="flex items-start justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{training.title}</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              training.trainingType === 'technical' 
                ? 'bg-blue-100 text-blue-800' 
                : 'bg-green-100 text-green-800'
            }`}>
              {training.trainingType}
            </span>
          </div>

          <p className="text-gray-600 text-sm mb-4 line-clamp-3">
            {training.description || 'No description available'}
          </p>

          <div className="space-y-2 mb-4">
            {training.trainingCategory && (
              <div className="flex items-center text-sm text-gray-500">
                <Target className="w-4 h-4 mr-2" />
                {training.trainingCategory}
              </div>
            )}
            
            {training.duration && (
              <div className="flex items-center text-sm text-gray-500">
                <Clock className="w-4 h-4 mr-2" />
                {training.duration}
              </div>
            )}

            {training.startDate && (
              <div className="flex items-center text-sm text-gray-500">
                <Calendar className="w-4 h-4 mr-2" />
                {new Date(training.startDate).toLocaleDateString()}
              </div>
            )}

            {training.availableSlots !== undefined && (
              <div className="flex items-center text-sm text-gray-500">
                <Users className="w-4 h-4 mr-2" />
                {training.availableSpots || training.availableSlots} slots available
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {/* <DollarSign className="w-4 h-4 mr-1 text-green-600" /> */}
              <span className="text-lg font-bold text-green-600">
                    {training.price?`LKR ${training.price}` : 'Free'}
              </span>
            </div>
            
            <div className="flex space-x-2">
              <button 
                onClick={handleViewDetails}
                className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center"
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                Details
              </button>
              <button 
                onClick={handleRegister}
                className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center"
              >
                Register
                <ArrowRight className="w-3 h-3 ml-1" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Component: Pagination
  const Pagination = ({ trainingsPerPage, totalTrainings, paginate, currentPage }) => {
    const pageNumbers = [];
    const totalPages = Math.ceil(totalTrainings / trainingsPerPage);

    for (let i = 1; i <= totalPages; i++) {
      pageNumbers.push(i);
    }

    if (totalPages <= 1) return null;

    return (
      <div className="flex justify-center items-center space-x-2 mt-8">
        <button
          onClick={() => paginate(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Previous
        </button>
        
        {pageNumbers.map(number => (
          <button
            key={number}
            onClick={() => paginate(number)}
            className={`px-3 py-2 text-sm rounded-lg ${
              currentPage === number
                ? 'bg-blue-600 text-white'
                : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {number}
          </button>
        ))}
        
        <button
          onClick={() => paginate(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-2 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white p-6">
        <NavBar />
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading trainings...</p>
          </div>
        </div>
      </div>
    );
  }

  const skillsNeedingImprovement = interviewResults?.skills.filter(skill => skill.score < 60) || [];
  const filteredAllTrainings = getFilteredTrainings(allTrainings.filter(training => 
    !recommendedTrainings.some(rec => rec._id === training._id)
  ));
  const paginatedTrainings = getPaginatedTrainings(filteredAllTrainings);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <NavBar />
      
      <div className="max-w-7xl mx-auto p-6 pt-24">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Skill Enhancement Training
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Discover personalized training programs to boost your skills and accelerate your career growth
          </p>
        </div>

        {/* Skills Needing Improvement */}
        {skillsNeedingImprovement.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <AlertCircle className="w-6 h-6 mr-2 text-orange-500" />
              Skills Needing Improvement
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {skillsNeedingImprovement.map((skill, idx) => (
                <ScoreCard key={idx} skill={skill} />
              ))}
            </div>
          </div>
        )}

        {/* Recommended Trainings */}
        {recommendedTrainings.length > 0 && (
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-6 flex items-center">
              <Star className="w-6 h-6 mr-2 text-yellow-500" />
              Recommended Training Programs
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {recommendedTrainings.map(training => (
                <TrainingCard key={training._id} training={training} isRecommended={true} />
              ))}
            </div>
          </div>
        )}

        {/* All Trainings Section */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold text-gray-900 flex items-center">
              <BookOpen className="w-6 h-6 mr-2 text-blue-500" />
              All Training Programs
            </h2>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              <ChevronDown className={`w-4 h-4 ml-2 transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Search and Filters */}
          <div className={`transition-all duration-300 ${showFilters ? 'mb-6' : 'mb-6'}`}>
            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Search trainings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Filters - Show/Hide based on showFilters state */}
              {showFilters && (
                <div className="flex flex-wrap gap-4">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="technical">Technical</option>
                    <option value="soft skills">Soft Skills</option>
                  </select>

                  <select
                    value={priceFilter}
                    onChange={(e) => setPriceFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Prices</option>
                    <option value="free">Free</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Training Grid */}
          {paginatedTrainings.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {paginatedTrainings.map(training => (
                  <TrainingCard key={training._id} training={training} />
                ))}
              </div>

              <Pagination
                trainingsPerPage={trainingsPerPage}
                totalTrainings={filteredAllTrainings.length}
                paginate={paginate}
                currentPage={currentPage}
              />
            </>
          ) : (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-medium text-gray-900 mb-2">No trainings found</h3>
              <p className="text-gray-500">
                {searchTerm || selectedType !== 'all' || priceFilter !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No training programs are currently available'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TrainingPage;