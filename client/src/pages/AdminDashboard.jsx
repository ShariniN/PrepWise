import React, { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, UserPlus, Bell, Award, BookOpen, Clock, CheckCircle, AlertCircle, Edit, BarChart3, Brain, Target, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('freshers');
  const [freshers, setFreshers] = useState([]);
  const [trainers, setTrainers] = useState([]);
  const [notices, setNotices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [formData, setFormData] = useState({});
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [adminData, setAdminData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    checkAuthentication();
  }, []);

  // Add keyboard event listener for Escape key
  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape' && showModal) {
        closeModal();
      }
    };

    if (showModal) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [showModal]);

  const checkAuthentication = async () => {
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
      navigate('/admin-login');
      return;
    }

    try {
      // Verify token with backend
      const response = await fetch('/api/admin/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Authentication failed');
      }

      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(true);
        setAdminData(data.admin);
        // Only fetch data after authentication is confirmed
        await Promise.all([
          fetchFreshers(),
          fetchTrainers(),
          fetchNotices()
        ]);
      } else {
        localStorage.removeItem('adminToken');
        navigate('/admin-login');
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('adminToken');
      navigate('/admin-login');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    navigate('/admin-login');
  };

  // Helper function for authenticated requests
  const makeAuthenticatedRequest = async (url, options = {}) => {
    const token = localStorage.getItem('adminToken');
    return fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
  };

  const fetchFreshers = async () => {
    try {
      const res = await makeAuthenticatedRequest('/api/admin/freshers');
      
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          navigate('/admin-login');
          return;
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        setFreshers(data.data || []);
        console.log('Freshers fetched successfully:', data.data?.length || 0);
      } else {
        throw new Error(data.message || 'Failed to fetch freshers');
      }
    } catch (err) {
      console.error('Error fetching freshers:', err);
      setError(`Failed to fetch freshers: ${err.message}`);
      setFreshers([]);
    }
  };

  const fetchTrainers = async () => {
    try {
      const res = await makeAuthenticatedRequest('/api/admin/trainers');
      
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          navigate('/admin-login');
          return;
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      if (data.success) {
        setTrainers(data.data || []);
        console.log('Trainers fetched successfully:', data.data?.length || 0);
      } else {
        throw new Error(data.message || 'Failed to fetch trainers');
      }
    } catch (err) {
      console.error('Error fetching trainers:', err);
      setError(`Failed to fetch trainers: ${err.message}`);
      setTrainers([]);
    }
  };

  const fetchNotices = async () => {
    try {
      const res = await makeAuthenticatedRequest('/api/admin/notices');
      
      if (!res.ok) {
        if (res.status === 401) {
          localStorage.removeItem('adminToken');
          navigate('/admin-login');
          return;
        }
        throw new Error(`HTTP error! status: ${res.status}`);
      }

      const data = await res.json();
      
      let noticesData = data.success ? data.data || [] : Array.isArray(data) ? data : [];
      setNotices(noticesData.map(n => ({ ...n, _id: n._id || n.noticeId })));
      console.log('Notices fetched successfully:', noticesData.length);
    } catch (err) {
      console.error('Error fetching notices:', err);
      setError(`Failed to fetch notices: ${err.message}`);
      setNotices([]);
    }
  };

  const handleDeleteFresher = async (id) => {
    if (!window.confirm('Are you sure you want to delete this fresher?')) return;
    
    try {
      const res = await makeAuthenticatedRequest(`/api/admin/freshers/${id}`, { method: "DELETE" });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
      }
      
      setFreshers(prev => prev.filter(f => f._id !== id));
      setError('');
      alert('Fresher deleted successfully');
    } catch (error) {
      console.error("Error deleting fresher:", error);
      setError('Failed to delete fresher: ' + error.message);
    }
  };

  const handleDeleteTrainer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this trainer?')) return;
    
    try {
      const res = await makeAuthenticatedRequest(`/api/admin/trainers/${id}`, { method: "DELETE" });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
      }
      
      setTrainers(prev => prev.filter(t => t._id !== id));
      setError('');
      alert('Trainer deleted successfully');
    } catch (error) {
      console.error("Error deleting trainer:", error);
      setError('Failed to delete trainer: ' + error.message);
    }
  };

  const handleAddNotice = async (data) => {
    try {
      const res = await makeAuthenticatedRequest('/api/admin/notices', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
      }
      
      const responseData = await res.json();
      
      if (responseData.success) {
        await fetchNotices();
        setShowModal(false);
        setFormData({});
        setError('');
        alert('Event notice added successfully');
      } else {
        throw new Error(responseData.message || 'Failed to add notice');
      }
    } catch (err) {
      console.error('Error adding notice:', err);
      setError('Failed to add notice: ' + err.message);
    }
  };

  const handleUpdateNotice = async (id, data) => {
    try {
      const res = await makeAuthenticatedRequest(`/api/admin/notices/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
      }
      
      const responseData = await res.json();
      
      if (responseData.success) {
        await fetchNotices();
        setShowModal(false);
        setFormData({});
        setError('');
        alert('Event notice updated successfully');
      } else {
        throw new Error(responseData.message || 'Failed to update notice');
      }
    } catch (err) {
      console.error('Error updating notice:', err);
      setError('Failed to update notice: ' + err.message);
    }
  };

  const handleDeleteNotice = async (id) => {
    if (!window.confirm('Are you sure you want to delete this notice?')) return;
    
    try {
      const res = await makeAuthenticatedRequest(`/api/admin/notices/${id}`, { method: 'DELETE' });
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: 'Unknown error' }));
        throw new Error(errorData.message || `HTTP error! status: ${res.status}`);
      }
      
      const data = await res.json();
      
      if (data.success) {
        await fetchNotices();
        setError('');
        alert('Event notice deleted successfully');
      } else {
        throw new Error(data.message || 'Failed to delete notice');
      }
    } catch (err) {
      console.error('Error deleting notice:', err);
      setError('Failed to delete notice: ' + err.message);
    }
  };

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const openModal = useCallback((type, item = null) => {
    setModalType(type);
    setSelectedItem(item);
    setError('');
    
    if (item) {
      setFormData({ ...item });
    } else {
      setFormData({});
    }
    setShowModal(true);
  }, []);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    setError('');
    
    // Form validation for notice forms
    if ((modalType === 'addNotice' || modalType === 'editNotice')) {
      const eventName = formData.eventName?.trim();
      const eventDescription = formData.eventDescription?.trim();
      
      if (!eventName || !eventDescription) {
        setError('Event name and description are required');
        return;
      }
    }
    
    if (modalType === 'addNotice') handleAddNotice(formData);
    if (modalType === 'editNotice') handleUpdateNotice(formData._id, formData);
  }, [modalType, formData]);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setFormData({});
    setModalType('');
    setSelectedItem(null);
    setError('');
  }, []);

  const formatDate = (date) => {
    if (!date) return 'N/A';
    try {
      return new Date(date).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-500" />;
      case 'active':
        return <Clock size={16} className="text-blue-500" />;
      case 'upcoming':
        return <AlertCircle size={16} className="text-yellow-500" />;
      default:
        return <AlertCircle size={16} className="text-gray-500" />;
    }
  };

  const getProficiencyColor = (level) => {
    if (level >= 8) return 'text-green-600 bg-green-100';
    if (level >= 5) return 'text-blue-600 bg-blue-100';
    return 'text-orange-600 bg-orange-100';
  };

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <div className="text-lg text-gray-700">Verifying authentication...</div>
        </div>
      </div>
    );
  }

  // Return null if not authenticated (will redirect via useEffect)
  if (!isAuthenticated) {
    return null;
  }

  const filteredFreshers = freshers.filter(f =>
    f.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const filteredTrainers = trainers.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const TabButton = ({ id, label, icon: Icon }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
        activeTab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  const SkillsAssessmentCard = ({ skillsAssessment }) => {
    if (!skillsAssessment || !skillsAssessment.hasAssessment) {
      return (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center space-x-2 mb-2">
            <Brain size={16} className="text-gray-400" />
            <span className="font-medium text-gray-600">Skills Assessment</span>
          </div>
          <p className="text-gray-500 text-sm">No assessment completed</p>
        </div>
      );
    }

    return (
      <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Brain size={16} className="text-blue-600" />
            <span className="font-medium text-blue-800">Skills Assessment</span>
          </div>
          <div className="text-sm text-blue-600">
            Score: {skillsAssessment.overallScore || 'N/A'}/100
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-sm">
            <span className="text-gray-600">Total Skills:</span>
            <span className="ml-1 font-medium">{skillsAssessment.totalSkills || 0}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Avg Proficiency:</span>
            <span className="ml-1 font-medium">{skillsAssessment.averageProficiency?.toFixed(1) || 'N/A'}</span>
          </div>
        </div>

        {skillsAssessment.topSkills?.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Top Skills:</p>
            <div className="flex flex-wrap gap-2">
              {skillsAssessment.topSkills.slice(0, 3).map((skill, idx) => (
                <div key={idx} className={`px-2 py-1 rounded text-xs ${getProficiencyColor(skill.proficiencyLevel || 0)}`}>
                  {skill.name} ({skill.proficiencyLevel || 0}/10)
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => openModal('viewSkills', { 
            skills: skillsAssessment.skills || [], 
            strengths: skillsAssessment.strengths || [], 
            weaknesses: skillsAssessment.weaknesses || [] 
          })}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          View All Skills & SWOT
        </button>
      </div>
    );
  };

  const InterviewScoreCard = ({ interviewScore }) => {
    if (!interviewScore || !interviewScore.hasInterview) {
      return (
        <div className="bg-gray-50 rounded-lg p-4 border">
          <div className="flex items-center space-x-2 mb-2">
            <Target size={16} className="text-gray-400" />
            <span className="font-medium text-gray-600">Interview Score</span>
          </div>
          <p className="text-gray-500 text-sm">No interview completed</p>
        </div>
      );
    }

    return (
      <div className="bg-green-50 rounded-lg p-4 border border-green-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <Target size={16} className="text-green-600" />
            <span className="font-medium text-green-800">Interview Score</span>
          </div>
          <div className="text-sm text-green-600">
            {interviewScore.overallScore || 'N/A'}/100
          </div>
        </div>
        
        {interviewScore.readinessLevel && (
          <div className="mb-3">
            <span className="text-sm text-gray-600">Readiness Level: </span>
            <span className="font-medium text-green-700">{interviewScore.readinessLevel}</span>
          </div>
        )}

        {interviewScore.categoryPercentages && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Category Scores:</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(interviewScore.categoryPercentages).map(([category, score]) => (
                <div key={category} className="flex justify-between">
                  <span className="capitalize">{category}:</span>
                  <span className="font-medium">{score || 0}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => openModal('viewInterview', interviewScore)}
          className="text-xs text-green-600 hover:text-green-800"
        >
          View Interview Details
        </button>
      </div>
    );
  };

  const TrainerTrainingsCard = ({ createdTrainings }) => {
    const trainings = createdTrainings || { 
      total: 0, 
      active: 0, 
      upcoming: 0, 
      completed: 0, 
      totalParticipants: 0, 
      trainings: [] 
    };

    return (
      <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <BookOpen size={16} className="text-purple-600" />
            <span className="font-medium text-purple-800">Created Trainings</span>
          </div>
          <div className="text-sm text-purple-600">
            Total: {trainings.total}
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="text-sm">
            <span className="text-gray-600">Active:</span>
            <span className="ml-1 font-medium text-blue-600">{trainings.active}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Upcoming:</span>
            <span className="ml-1 font-medium text-yellow-600">{trainings.upcoming}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Completed:</span>
            <span className="ml-1 font-medium text-green-600">{trainings.completed}</span>
          </div>
          <div className="text-sm">
            <span className="text-gray-600">Total Participants:</span>
            <span className="ml-1 font-medium">{trainings.totalParticipants}</span>
          </div>
        </div>

        {trainings.trainings?.length > 0 && (
          <div className="mb-3">
            <p className="text-sm font-medium text-gray-700 mb-2">Recent Trainings:</p>
            <div className="space-y-2">
              {trainings.trainings.slice(0, 3).map((training, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs bg-white p-2 rounded border">
                  <div className="flex items-center space-x-2">
                    {getStatusIcon(training.status)}
                    <span className="font-medium">{training.title || 'Untitled'}</span>
                  </div>
                  <span className="text-gray-500">
                    {training.registeredParticipants || 0}/{training.availableSlots || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => openModal('viewTrainings', trainings)}
          className="text-xs text-purple-600 hover:text-purple-800"
        >
          View All Trainings
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              Freshers: {freshers.length} | Trainers: {trainers.length}
            </div>
            {adminData && (
              <div className="flex items-center space-x-3">
                <span className="text-gray-700">Welcome, {adminData.name || adminData.username || 'Admin'}</span>
                <button
                  onClick={handleLogout}
                  className="flex items-center space-x-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
            <button 
              onClick={() => setError('')} 
              className="float-right text-red-700 hover:text-red-900"
            >
              ×
            </button>
          </div>
        )}

        <div className="flex space-x-2 mb-6">
          <TabButton id="freshers" label="Manage Freshers" icon={UserPlus} />
          <TabButton id="trainers" label="Manage Trainers" icon={Award} />
          <TabButton id="notices" label="Event Notices" icon={Bell} />
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full max-w-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'freshers' && (
            <div className="grid gap-6">
              {filteredFreshers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {freshers.length === 0 ? 'No freshers found' : 'No freshers match your search'}
                </div>
              ) : (
                filteredFreshers.map(fresher => (
                  <div key={fresher._id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-4 mb-6">
                          <div className="h-16 w-16 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white font-bold text-xl">
                            {fresher.name ? fresher.name[0].toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-semibold text-xl text-gray-900">{fresher.name || 'Unknown'}</div>
                            <div className="text-gray-600">{fresher.email || 'No email'}</div>
                            <div className="text-sm text-gray-500">{fresher.phoneNumber || 'No contact'}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              Joined: {formatDate(fresher.createdAt)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid lg:grid-cols-2 gap-4 mb-6">
                          <SkillsAssessmentCard skillsAssessment={fresher.skillsAssessment} />
                          <InterviewScoreCard interviewScore={fresher.interviewScore} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                          <div>
                            <span className="font-medium text-gray-700">Resume Status:</span>
                            <div className="mt-1">
                              {fresher.currentCV?.fileName || fresher.hasCV ? 
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                  <CheckCircle size={12} className="mr-1" />
                                  Uploaded
                                </span> : 
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                                  <AlertCircle size={12} className="mr-1" />
                                  Not Uploaded
                                </span>
                              }
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Last Active:</span>
                            <div className="mt-1 text-gray-600">{formatDate(fresher.lastActive)}</div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ml-6 flex flex-col space-y-2">
                        <button 
                          onClick={() => handleDeleteFresher(fresher._id)} 
                          className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Fresher"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'trainers' && (
            <div className="grid gap-6">
              {filteredTrainers.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {trainers.length === 0 ? 'No trainers found' : 'No trainers match your search'}
                </div>
              ) : (
                filteredTrainers.map(trainer => (
                  <div key={trainer._id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center space-x-4 mb-6">
                          <div className="h-16 w-16 rounded-full bg-gradient-to-r from-green-500 to-green-600 flex items-center justify-center text-white font-bold text-xl">
                            {trainer.name ? trainer.name[0].toUpperCase() : 'T'}
                          </div>
                          <div>
                            <div className="font-semibold text-xl text-gray-900">{trainer.name || 'Unknown'}</div>
                            <div className="text-gray-600">{trainer.email || 'No email'}</div>
                            <div className="text-sm text-gray-500">{trainer.contact || 'No contact'}</div>
                            <div className="text-xs text-gray-400 mt-1">
                              Joined: {formatDate(trainer.createdAt)}
                            </div>
                          </div>
                        </div>

                        {trainer.specializationSkills && trainer.specializationSkills.length > 0 && (
                          <div className="mb-4">
                            <span className="text-sm font-medium text-gray-700">Specialization Skills:</span>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {trainer.specializationSkills.map((skill, idx) => (
                                <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="mb-6">
                          <TrainerTrainingsCard createdTrainings={trainer.createdTrainings} />
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                          <div>
                            <span className="font-medium text-gray-700">Education:</span>
                            <div className="mt-1 text-gray-600">
                              {trainer.education?.length || 0} entries
                            </div>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">Experience:</span>
                            <div className="mt-1 text-gray-600">
                              {trainer.experiences?.length || 0} entries
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div className="ml-6 flex flex-col space-y-2">
                        <button 
                          onClick={() => handleDeleteTrainer(trainer._id)} 
                          className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50 transition-colors"
                          title="Delete Trainer"
                        >
                          <Trash2 size={20} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          
          {activeTab === 'notices' && (
            <div className="grid gap-4">
              <button 
                onClick={() => openModal('addNotice')} 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center space-x-2 hover:bg-blue-700 w-fit font-medium"
              >
                <Bell size={20} />
                <span>Add Event Notice</span>
              </button>
              {notices.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No notices found</div>
              ) : (
                notices.map(notice => (
                  <div key={notice._id} className="bg-white rounded-lg shadow p-6 flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-semibold text-lg text-gray-900">{notice.eventName}</div>
                      <div className="text-gray-600 text-sm mt-2">{notice.eventDescription}</div>
                      <div className="text-gray-500 text-xs mt-3">
                        <div className="flex items-center space-x-4">
                          <span>Date: {notice.date ? formatDate(notice.date) : 'TBD'}</span>
                          {notice.time && <span>Time: {notice.time}</span>}
                          {notice.venue && <span>Venue: {notice.venue}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-2 ml-6">
                      <button 
                        onClick={() => openModal('editNotice', notice)} 
                        className="text-blue-600 hover:text-blue-800 p-2 rounded-lg hover:bg-blue-50"
                        title="Edit Notice"
                      >
                        <Edit size={18} />
                      </button>
                      <button 
                        onClick={() => handleDeleteNotice(notice._id)} 
                        className="text-red-600 hover:text-red-800 p-2 rounded-lg hover:bg-red-50"
                        title="Delete Notice"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Modal for viewing detailed information */}
      {showModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            // Close modal when clicking on backdrop
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto relative">
            <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white z-10">
              <h3 className="text-xl font-semibold text-gray-900">
                {modalType === 'addNotice' && 'Add Event Notice'}
                {modalType === 'editNotice' && 'Edit Event Notice'}
                {modalType === 'viewSkills' && 'Skills Assessment Details'}
                {modalType === 'viewInterview' && 'Interview Score Details'}
                {modalType === 'viewTrainings' && 'Created Trainings'}
              </h3>
              <button 
                onClick={closeModal} 
                className="text-gray-400 hover:text-gray-600 text-2xl relative bg-white hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center z-50"
              >
                ×
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                  {error}
                </div>
              )}

              {modalType === 'viewSkills' && selectedItem && (
                <div className="space-y-6">
                  {selectedItem.skills && selectedItem.skills.length > 0 && (
                    <div>
                      <h4 className="text-lg font-medium mb-4 flex items-center">
                        <BarChart3 className="mr-2 text-blue-600" size={20} />
                        All Skills ({selectedItem.skills.length})
                      </h4>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {selectedItem.skills.map((skill, idx) => (
                          <div key={idx} className={`p-3 rounded-lg border-2 ${getProficiencyColor(skill.proficiencyLevel || 0)}`}>
                            <div className="font-medium">{skill.name || 'Unknown Skill'}</div>
                            <div className="text-sm opacity-75">{skill.category || 'General'}</div>
                            <div className="text-sm font-bold">Level: {skill.proficiencyLevel || 0}/10</div>
                            {skill.yearsOfExperience > 0 && (
                              <div className="text-xs opacity-75">{skill.yearsOfExperience} years exp.</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-6">
                    {selectedItem.strengths && selectedItem.strengths.length > 0 && (
                      <div>
                        <h4 className="text-lg font-medium mb-3 text-green-700">Strengths</h4>
                        <ul className="space-y-2">
                          {selectedItem.strengths.map((strength, idx) => (
                            <li key={idx} className="bg-green-50 p-3 rounded-lg border-l-4 border-green-400">
                              {strength}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {selectedItem.weaknesses && selectedItem.weaknesses.length > 0 && (
                      <div>
                        <h4 className="text-lg font-medium mb-3 text-red-700">Weaknesses</h4>
                        <ul className="space-y-2">
                          {selectedItem.weaknesses.map((weakness, idx) => (
                            <li key={idx} className="bg-red-50 p-3 rounded-lg border-l-4 border-red-400">
                              {weakness}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {modalType === 'viewInterview' && selectedItem && (
                <div className="space-y-6">
                  <div className="bg-gradient-to-r from-green-50 to-blue-50 p-6 rounded-lg">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xl font-semibold">Overall Performance</h4>
                      <div className="text-3xl font-bold text-green-600">
                        {selectedItem.overallScore || 0}/100
                      </div>
                    </div>
                    <div className="text-lg text-green-700 font-medium">
                      Readiness Level: {selectedItem.readinessLevel || 'Not Assessed'}
                    </div>
                  </div>

                  {selectedItem.categoryPercentages && (
                    <div>
                      <h4 className="text-lg font-medium mb-4">Category Performance</h4>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Object.entries(selectedItem.categoryPercentages).map(([category, score]) => (
                          <div key={category} className="bg-gray-50 p-4 rounded-lg">
                            <div className="text-sm text-gray-600 capitalize mb-1">{category}</div>
                            <div className="text-2xl font-bold text-gray-900">{score || 0}%</div>
                            <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full" 
                                style={{ width: `${score || 0}%` }}
                              ></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg">
                    <div>
                      <span className="font-medium text-gray-700">Questions Completed:</span>
                      <div className="text-gray-900">{selectedItem.completedQuestions || 0}/{selectedItem.totalQuestions || 0}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">Completed Date:</span>
                      <div className="text-gray-900">{formatDate(selectedItem.completedAt)}</div>
                    </div>
                  </div>
                </div>
              )}

              {modalType === 'viewTrainings' && selectedItem && (
                <div className="space-y-6">
                  <div className="grid md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-blue-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{selectedItem.active || 0}</div>
                      <div className="text-sm text-blue-700">Active</div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-yellow-600">{selectedItem.upcoming || 0}</div>
                      <div className="text-sm text-yellow-700">Upcoming</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{selectedItem.completed || 0}</div>
                      <div className="text-sm text-green-700">Completed</div>
                    </div>
                    <div className="bg-purple-50 p-4 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">{selectedItem.totalParticipants || 0}</div>
                      <div className="text-sm text-purple-700">Total Participants</div>
                    </div>
                  </div>

                  {selectedItem.trainings && selectedItem.trainings.length > 0 && (
                    <div>
                      <h4 className="text-lg font-medium mb-4">All Trainings</h4>
                      <div className="space-y-3">
                        {selectedItem.trainings.map((training, idx) => (
                          <div key={idx} className="bg-gray-50 p-4 rounded-lg border">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center space-x-3">
                                {getStatusIcon(training.status)}
                                <div className="font-medium">{training.title || 'Untitled Training'}</div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  training.status === 'active' ? 'bg-blue-100 text-blue-800' :
                                  training.status === 'upcoming' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-green-100 text-green-800'
                                }`}>
                                  {training.status}
                                </span>
                              </div>
                              <div className="text-sm text-gray-600">
                                {training.registeredParticipants || 0}/{training.availableSlots || 0} participants
                              </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4 text-sm text-gray-600">
                              <div>Type: {training.trainingType || 'N/A'}</div>
                              <div>Category: {training.trainingCategory || 'N/A'}</div>
                              <div>Duration: {training.duration || 'N/A'}</div>
                              <div>Start Date: {formatDate(training.startDate)}</div>
                            </div>
                            {training.description && (
                              <div className="mt-2 text-sm text-gray-600">
                                {training.description}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(modalType === 'addNotice' || modalType === 'editNotice') && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Event Name *</label>
                    <input
                      type="text"
                      name="eventName"
                      value={formData.eventName || ''}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Description *</label>
                    <textarea
                      name="eventDescription"
                      value={formData.eventDescription || ''}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={4}
                      required
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Date</label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date ? (formData.date.includes('T') ? formData.date.slice(0,10) : formData.date) : ''}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">Time</label>
                      <input
                        type="time"
                        name="time"
                        value={formData.time || ''}
                        onChange={handleChange}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Venue</label>
                    <input
                      type="text"
                      name="venue"
                      value={formData.venue || ''}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Registration Link</label>
                    <input
                      type="url"
                      name="registrationLink"
                      value={formData.registrationLink || ''}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://example.com/register"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">Organized by</label>
                    <textarea
                      name="otherInfo"
                      value={formData.otherInfo || ''}
                      onChange={handleChange}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                    />
                  </div>

                  <div className="flex justify-end space-x-4 pt-6">
                    <button 
                      type="button" 
                      onClick={closeModal} 
                      className="px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 font-medium"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                    >
                      {modalType === 'addNotice' ? 'Add Event' : 'Update Event'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;