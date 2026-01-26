import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Save, X, User, BookOpen, Briefcase, Award, Calendar, Clock, Users, Link, CheckCircle, AlertCircle, GraduationCap, Key } from 'lucide-react';

// Validation utilities
const isValidURL = (string) => {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
};

const isFutureDate = (dateString, timeString = null) => {
  if (!dateString) return false;
  
  const selectedDate = new Date(dateString);
  const now = new Date();
  
  // If time is provided, include it in the comparison
  if (timeString) {
    const [hours, minutes] = timeString.split(':');
    selectedDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  } else {
    // For date-only comparison, set to start of day
    selectedDate.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
  }
  
  return selectedDate > now;
};

// Extracted form components to prevent heavy re-renders
const TrainingFormFields = React.memo(({ 
  trainingForm, 
  setTrainingForm, 
  newTimeSlot, 
  setNewTimeSlot, 
  addTimeSlot, 
  removeTimeSlot 
}) => {
  // Use useCallback to prevent recreation on every render
  const updateField = useCallback((field, value) => {
    setTrainingForm(prev => ({ ...prev, [field]: value }));
  }, [setTrainingForm]);

  const handleTypeChange = useCallback((value) => {
    setTrainingForm(prev => ({ ...prev, trainingType: value, timeSlots: [] }));
  }, [setTrainingForm]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            type="text"
            placeholder="Training Title"
            value={trainingForm.title}
            onChange={(e) => updateField('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
          <select
            value={trainingForm.trainingType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select Type</option>
            <option value="technical">Technical</option>
            <option value="soft skills">Soft Skills</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <input
            type="text"
            placeholder="Training Category"
            value={trainingForm.trainingCategory}
            onChange={(e) => updateField('trainingCategory', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Available Slots ({trainingForm.trainingType === 'technical' ? 'Participants' : 'Time Slots'})
          </label>
          <input
            type="number"
            placeholder="Available Slots"
            value={trainingForm.availableSlots}
            onChange={(e) => updateField('availableSlots', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
          <input
            type="text"
            placeholder="e.g., 2 hours"
            value={trainingForm.duration}
            onChange={(e) => updateField('duration', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Technical Training Fields */}
      {trainingForm.trainingType === 'technical' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={trainingForm.startDate}
              onChange={(e) => updateField('startDate', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Time *</label>
            <input
              type="time"
              value={trainingForm.startTime}
              onChange={(e) => updateField('startTime', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Soft Skills Training Fields */}
      {trainingForm.trainingType === 'soft skills' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Time Slots *</label>
          <div className="space-y-2">
            <div className="flex space-x-2">
              <input
                type="text"
                placeholder="e.g., 10:00 AM - 11:00 AM"
                value={newTimeSlot}
                onChange={(e) => setNewTimeSlot(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={addTimeSlot}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                Add Slot
              </button>
            </div>
            {trainingForm.timeSlots.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {trainingForm.timeSlots.map((slot, index) => (
                  <span
                    key={`${slot}-${index}`}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {slot}
                    <button
                      type="button"
                      onClick={() => removeTimeSlot(slot)}
                      className="ml-2 text-blue-600 hover:text-blue-800"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Price</label>
          <input
            type="text"
            placeholder="Price"
            value={trainingForm.price}
            onChange={(e) => updateField('price', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
          <select
            value={trainingForm.status}
            onChange={(e) => updateField('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="upcoming">Upcoming</option>
            <option value="active">Open for Registrations</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Online Link</label>
        <input
          type="url"
          placeholder="Meeting/Training Link"
          value={trainingForm.onlineLink}
          onChange={(e) => updateField('onlineLink', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
        <textarea
          placeholder="Training Description"
          value={trainingForm.description}
          onChange={(e) => updateField('description', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          rows="3"
        />
      </div>
    </div>
  );
});

// Skills management component
const SkillsManager = React.memo(({ 
  skills, 
  newSkill, 
  setNewSkill, 
  onAddSkill, 
  onRemoveSkill 
}) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      <Award className="w-4 h-4 inline mr-1" />
      Specialization Skills
    </label>
    <div className="space-y-2">
      <div className="flex space-x-2">
        <input
          type="text"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          placeholder="Enter a skill"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="button"
          onClick={onAddSkill}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Add
        </button>
      </div>
      {skills && skills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {skills.map((skill, index) => (
            <span
              key={`${skill}-${index}`}
              className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
            >
              {skill}
              <button
                type="button"
                onClick={() => onRemoveSkill(skill)}
                className="ml-2 text-blue-600 hover:text-blue-800"
              >
                <X className="w-4 h-4" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  </div>
));

const TrainerDashboard = () => {
  // State management
  const [trainer, setTrainer] = useState(null);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [activeTab, setActiveTab] = useState('trainings');
  const [editingTraining, setEditingTraining] = useState(null);
  const [editingTrainer, setEditingTrainer] = useState(null);
  const [showAddTraining, setShowAddTraining] = useState(false);

  // Training form state
  const [trainingForm, setTrainingForm] = useState({
    title: '',
    trainingType: '',
    trainingCategory: '',
    availableSlots: '',
    startDate: '',
    startTime: '',
    venue: '',
    timeSlots: [],
    duration: '',
    price: '',
    status: 'upcoming',
    description: '',
    onlineLink: ''
  });

  // Trainer form state
  const [trainerForm, setTrainerForm] = useState({
    name: '',
    email: '',
    contact: '',
    trainerId: '',
    password: '',
    specializationSkills: [],
    experiences: [],
    education: [],
    address: ''
  });

  // Additional state for managing arrays
  const [newSkill, setNewSkill] = useState('');
  const [newExperience, setNewExperience] = useState({
    title: '',
    company: '',
    years: '',
    description: ''
  });
  const [newEducation, setNewEducation] = useState({
    degree: '',
    institution: '',
    yearOfCompletion: ''
  });
  const [newTimeSlot, setNewTimeSlot] = useState('');
  const [showPasswordField, setShowPasswordField] = useState(false);

  // Fetch trainer profile on component mount
  useEffect(() => {
    fetchTrainerProfile();
  }, []);

  // Validation functions
  const validateTrainingForm = () => {
    const errors = [];

    if (!trainingForm.title?.trim()) {
      errors.push('Title is required');
    }

    if (!trainingForm.trainingType) {
      errors.push('Training type is required');
    }

    if (trainingForm.trainingType === 'technical') {
      if (!trainingForm.startDate) {
        errors.push('Date is required for technical training');
      } else if (!isFutureDate(trainingForm.startDate, trainingForm.startTime)) {
        errors.push('Training date and time must be in the future');
      }

      if (!trainingForm.startTime) {
        errors.push('Time is required for technical training');
      }
    }

    if (trainingForm.trainingType === 'soft skills') {
      if (!trainingForm.timeSlots || trainingForm.timeSlots.length === 0) {
        errors.push('At least one time slot is required for soft skills training');
      }
    }

    if (trainingForm.onlineLink && trainingForm.onlineLink.trim() && !isValidURL(trainingForm.onlineLink)) {
      errors.push('Please enter a valid URL for the online link');
    }

    return errors;
  };

  const validateTrainerForm = () => {
    const errors = [];

    if (!trainerForm.name?.trim()) {
      errors.push('Name is required');
    }

    if (!trainerForm.email?.trim()) {
      errors.push('Email is required');
    }

    return errors;
  };

  // Fetch trainer profile - FIXED VERSION
  const fetchTrainerProfile = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/trainer/profile/me', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`);
      }

      const data = await response.json();
      console.log('Full API Response:', data);
      
      if (data.success) {
        const trainerData = {
          ...data.data,
          ...(data.data.personalDetails || {})
        };
        
        setTrainer(trainerData);
        setTrainings(data.data.trainingPrograms || []);
        setError('');
      } else {
        setError(data.message || 'Failed to fetch trainer profile');
      }
    } catch (error) {
      console.error('Error fetching trainer profile:', error);
      setError('Failed to load trainer profile');
    } finally {
      setLoading(false);
    }
  };

  // FIXED: Use proper spread operator for state updates
  const updateTrainerProfile = async () => {
    const validationErrors = validateTrainerForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    try {
      setLoading(true);
      
      const updatePayload = {
        name: trainerForm.name,
        email: trainerForm.email,
        contact: trainerForm.contact,
        address: trainerForm.address,
        specializationSkills: trainerForm.specializationSkills,
        experiences: trainerForm.experiences,
        education: trainerForm.education
      };

      if (trainerForm.password && trainerForm.password.trim()) {
        updatePayload.password = trainerForm.password;
      }

      const response = await fetch('/api/trainer/profile/me', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });

      const data = await response.json();
      if (data.success) {
        setTrainer(prev => ({ ...prev, ...updatePayload }));
        setEditingTrainer(null);
        setError('');
        await fetchTrainerProfile();
      } else {
        setError(data.message || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating trainer profile:', error);
      setError('Failed to update trainer profile');
    } finally {
      setLoading(false);
    }
  };

  const addTraining = async () => {
    const validationErrors = validateTrainingForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    try {
      setLoading(true);
      
      let payload = {
        ...trainingForm,
        timeSlot: trainingForm.trainingType === 'soft skills' ? trainingForm.timeSlots.join(', ') : ''
      };

      const response = await fetch('/api/trainings', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        setTrainings(prev => [...prev, data.data]);
        resetTrainingForm();
        setShowAddTraining(false);
        setError('');
      } else {
        setError(data.message || 'Failed to add training');
      }
    } catch (error) {
      console.error('Error adding training:', error);
      setError('Failed to add training');
    } finally {
      setLoading(false);
    }
  };

  const updateTraining = async () => {
    const validationErrors = validateTrainingForm();
    if (validationErrors.length > 0) {
      setError(validationErrors.join(', '));
      return;
    }

    try {
      setLoading(true);
      
      let payload = {
        ...trainingForm,
        timeSlot: trainingForm.trainingType === 'soft skills' ? trainingForm.timeSlots.join(', ') : ''
      };

      const response = await fetch(`/api/trainings/${editingTraining}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (data.success) {
        setTrainings(prev => prev.map(training =>
          training._id === editingTraining ? data.data : training
        ));
        setEditingTraining(null);
        resetTrainingForm();
        setError('');
      } else {
        setError(data.message || 'Failed to update training');
      }
    } catch (error) {
      console.error('Error updating training:', error);
      setError('Failed to update training');
    } finally {
      setLoading(false);
    }
  };

  const deleteTraining = async (trainingId) => {
    if (!confirm('Are you sure you want to delete this training?')) return;

    try {
      setLoading(true);
      const response = await fetch(`/api/trainings/${trainingId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      if (data.success) {
        setTrainings(prev => prev.filter(t => t._id !== trainingId));
        setError('');
      } else {
        setError(data.message || 'Failed to delete training');
      }
    } catch (error) {
      console.error('Error deleting training:', error);
      setError('Failed to delete training');
    } finally {
      setLoading(false);
    }
  };

  // Helper functions
  const resetTrainingForm = () => {
    setTrainingForm({
      title: '',
      trainingType: '',
      trainingCategory: '',
      availableSlots: '',
      startDate: '',
      startTime: '',
      venue: '',
      timeSlots: [],
      duration: '',
      price: '',
      status: 'upcoming',
      description: '',
      onlineLink: ''
    });
  };

  const startEditTraining = (training) => {
    setEditingTraining(training._id);
    setTrainingForm({
      title: training.title || '',
      trainingType: training.trainingType || '',
      trainingCategory: training.trainingCategory || '',
      availableSlots: training.availableSlots || '',
      startDate: training.startDate ? new Date(training.startDate).toISOString().split('T')[0] : '',
      startTime: training.startTime || '',
      venue: training.venue || '',
      timeSlots: training.timeSlot ? training.timeSlot.split(', ').filter(slot => slot.trim()) : [],
      duration: training.duration || '',
      price: training.price || '',
      status: training.status || 'upcoming',
      description: training.description || '',
      onlineLink: training.onlineLink || ''
    });
  };

  const startEditTrainer = () => {
    if (!trainer) return;
    
    setEditingTrainer(trainer._id);
    // FIXED: Use proper spread operator
    setTrainerForm(prev => ({
      ...prev,
      name: trainer.name || '',
      email: trainer.email || '',
      contact: trainer.contact || trainer.phone || '',
      trainerId: trainer.trainerId || '',
      password: '',
      specializationSkills: Array.isArray(trainer.specializationSkills) ? [...trainer.specializationSkills] : [],
      experiences: Array.isArray(trainer.experiences) ? [...trainer.experiences] : [],
      education: Array.isArray(trainer.education) ? [...trainer.education] : [],
      address: trainer.address || ''
    }));
    setShowPasswordField(false);
  };

  const cancelEdit = () => {
    setEditingTraining(null);
    setEditingTrainer(null);
    setShowAddTraining(false);
    resetTrainingForm();
    // FIXED: Use proper spread operator
    setTrainerForm(prev => ({
      ...prev,
      name: '',
      email: '',
      contact: '',
      trainerId: '',
      password: '',
      specializationSkills: [],
      experiences: [],
      education: [],
      address: ''
    }));
    setShowPasswordField(false);
    setError('');
  };

  // FIXED: Array management functions with proper spread operators
  const addSkill = useCallback(() => {
    if (newSkill.trim() && !trainerForm.specializationSkills.includes(newSkill.trim())) {
      setTrainerForm(prev => ({
        ...prev,
        specializationSkills: [...prev.specializationSkills, newSkill.trim()]
      }));
      setNewSkill('');
    }
  }, [newSkill, trainerForm.specializationSkills]);

  const removeSkill = useCallback((skillToRemove) => {
    setTrainerForm(prev => ({
      ...prev,
      specializationSkills: prev.specializationSkills.filter(skill => skill !== skillToRemove)
    }));
  }, []);

  const addExperience = useCallback(() => {
    if (newExperience.title.trim()) {
      setTrainerForm(prev => ({
        ...prev,
        experiences: [...prev.experiences, { ...newExperience, years: parseInt(newExperience.years) || 0 }]
      }));
      setNewExperience({ title: '', company: '', years: '', description: '' });
    }
  }, [newExperience]);

  const removeExperience = useCallback((index) => {
    setTrainerForm(prev => ({
      ...prev,
      experiences: prev.experiences.filter((_, i) => i !== index)
    }));
  }, []);

  const addEducation = useCallback(() => {
    if (newEducation.degree.trim() && newEducation.institution.trim()) {
      setTrainerForm(prev => ({
        ...prev,
        education: [...prev.education, { ...newEducation, yearOfCompletion: parseInt(newEducation.yearOfCompletion) || null }]
      }));
      setNewEducation({ degree: '', institution: '', yearOfCompletion: '' });
    }
  }, [newEducation]);

  const removeEducation = useCallback((index) => {
    setTrainerForm(prev => ({
      ...prev,
      education: prev.education.filter((_, i) => i !== index)
    }));
  }, []);

  // FIXED: Time slot management with proper spread
  const addTimeSlot = useCallback(() => {
    if (newTimeSlot.trim() && !trainingForm.timeSlots.includes(newTimeSlot.trim())) {
      setTrainingForm(prev => ({
        ...prev,
        timeSlots: [...prev.timeSlots, newTimeSlot.trim()]
      }));
      setNewTimeSlot('');
    }
  }, [newTimeSlot, trainingForm.timeSlots]);

  const removeTimeSlot = useCallback((slotToRemove) => {
    setTrainingForm(prev => ({
      ...prev,
      timeSlots: prev.timeSlots.filter(slot => slot !== slotToRemove)
    }));
  }, []);

  const getStatusBadge = (status) => {
    const colors = {
      'upcoming': 'bg-blue-100 text-blue-800',
      'active': 'bg-green-100 text-green-800',
      'completed': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  // Loading state
  if (loading && !trainer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading trainer dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Trainer Dashboard</h1>
          {trainer && (
            <p className="text-gray-600">Welcome back, {trainer.name}</p>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <p className="text-red-800">{error}</p>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('trainings')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'trainings'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <BookOpen className="inline w-4 h-4 mr-2" />
                Trainings ({trainings.length})
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'profile'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <User className="inline w-4 h-4 mr-2" />
                Profile
              </button>
            </nav>
          </div>
        </div>

        {/* Trainings Tab */}
        {activeTab === 'trainings' && (
          <div className="space-y-6">
            {/* Add Training Button */}
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold text-gray-900">
                My Trainings
              </h2>
              <button
                onClick={() => setShowAddTraining(true)}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Training</span>
              </button>
            </div>

            {/* Add Training Form */}
            {showAddTraining && (
              <div className="bg-white p-6 rounded-lg shadow border">
                <h3 className="text-lg font-semibold mb-4">Add New Training</h3>
                
                <TrainingFormFields 
                  trainingForm={trainingForm}
                  setTrainingForm={setTrainingForm}
                  newTimeSlot={newTimeSlot}
                  setNewTimeSlot={setNewTimeSlot}
                  addTimeSlot={addTimeSlot}
                  removeTimeSlot={removeTimeSlot}
                />

                {/* Form Actions */}
                <div className="flex space-x-3 mt-6">
                  <button
                    onClick={addTraining}
                    disabled={loading}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Training</span>
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            )}

            {/* Trainings List */}
            <div className="grid gap-6">
              {trainings.length === 0 ? (
                <div className="text-center py-12">
                  <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg">No trainings added yet</p>
                  <p className="text-gray-400">Click "Add Training" to get started</p>
                </div>
              ) : (
                trainings.map(training => (
                  <div key={training._id} className="bg-white p-6 rounded-lg shadow border">
                    {editingTraining === training._id ? (
                      <div>
                        <h3 className="text-lg font-semibold mb-4">Edit Training</h3>
                        
                        <TrainingFormFields 
                          trainingForm={trainingForm}
                          setTrainingForm={setTrainingForm}
                          newTimeSlot={newTimeSlot}
                          setNewTimeSlot={setNewTimeSlot}
                          addTimeSlot={addTimeSlot}
                          removeTimeSlot={removeTimeSlot}
                        />
                        
                        <div className="flex space-x-3 mt-4">
                          <button
                            onClick={updateTraining}
                            disabled={loading}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                          >
                            <Save className="w-4 h-4" />
                            <span>Update</span>
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2"
                          >
                            <X className="w-4 h-4" />
                            <span>Cancel</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex-1">
                            <div className="flex items-center space-x-3 mb-2">
                              <h3 className="text-xl font-semibold text-gray-900">{training.title}</h3>
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadge(training.status)}`}>
                                {training.status}
                              </span>
                            </div>
                            
                            <div className="flex items-center space-x-4 mb-3">
                              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                                training.trainingType === 'technical' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                              }`}>
                                {training.trainingType}
                              </span>
                              {training.trainingCategory && (
                                <span className="text-gray-600">Category: {training.trainingCategory}</span>
                              )}
                              {training.price && (
                                <span className="text-green-600 font-medium">${training.price}</span>
                              )}
                            </div>
                            
                            <p className="text-gray-600 mb-4">{training.description}</p>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                              {training.availableSlots && (
                                <div className="flex items-center space-x-2">
                                  <Users className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">Slots: {training.registeredParticipants || 0}/{training.availableSlots}</span>
                                </div>
                              )}
                              {training.startDate && (
                                <div className="flex items-center space-x-2">
                                  <Calendar className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">{new Date(training.startDate).toLocaleDateString()}</span>
                                </div>
                              )}
                              {training.startTime && (
                                <div className="flex items-center space-x-2">
                                  <Clock className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">{training.startTime}</span>
                                </div>
                              )}
                              {training.timeSlot && training.trainingType === 'soft skills' && (
                                <div className="flex items-center space-x-2 col-span-full">
                                  <Clock className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">Time Slots: {training.timeSlot}</span>
                                </div>
                              )}
                              {training.duration && (
                                <div className="flex items-center space-x-2">
                                  <Clock className="w-4 h-4 text-gray-500" />
                                  <span className="text-gray-700">Duration: {training.duration}</span>
                                </div>
                              )}
                              {training.onlineLink && (
                                <div className="flex items-center space-x-2">
                                  <Link className="w-4 h-4 text-gray-500" />
                                  <a 
                                    href={training.onlineLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-800"
                                  >
                                    Join Link
                                  </a>
                                </div>
                              )}
                            </div>
                          </div>
                          
                          <div className="flex space-x-2">
                            <button
                              onClick={() => startEditTraining(training)}
                              className="text-blue-600 hover:text-blue-800 p-2"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteTraining(training._id)}
                              className="text-red-600 hover:text-red-800 p-2"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-semibold text-gray-900">Trainer Profile</h2>
              {editingTrainer !== trainer?._id && (
                <button
                  onClick={startEditTrainer}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center space-x-2"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Profile</span>
                </button>
              )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow border">
              {editingTrainer === trainer?._id ? (
                <div>
                  <h3 className="text-lg font-semibold mb-4">Edit Profile Information</h3>
                  <div className="space-y-6">
                    {/* Basic Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                        <input
                          type="text"
                          value={trainerForm.name}
                          onChange={(e) => setTrainerForm(prev => ({...prev, name: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                        <input
                          type="email"
                          value={trainerForm.email}
                          onChange={(e) => setTrainerForm(prev => ({...prev, email: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Contact</label>
                        <input
                          type="tel"
                          value={trainerForm.contact}
                          onChange={(e) => setTrainerForm(prev => ({...prev, contact: e.target.value}))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Trainer ID</label>
                        <input
                          type="text"
                          value={trainerForm.trainerId}
                          readOnly
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50"
                          title="Trainer ID cannot be modified"
                        />
                      </div>
                    </div>

                    {/* Password Section */}
                    <div>
                      <div className="flex items-center space-x-2 mb-2">
                        <Key className="w-4 h-4 text-gray-600" />
                        <label className="block text-sm font-medium text-gray-700">Password</label>
                        <button
                          type="button"
                          onClick={() => setShowPasswordField(!showPasswordField)}
                          className="text-blue-600 hover:text-blue-800 text-sm"
                        >
                          {showPasswordField ? 'Hide' : 'Change Password'}
                        </button>
                      </div>
                      {showPasswordField && (
                        <input
                          type="password"
                          value={trainerForm.password}
                          onChange={(e) => setTrainerForm(prev => ({...prev, password: e.target.value}))}
                          placeholder="Enter new password (leave blank to keep current)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        />
                      )}
                    </div>

                    {/* Skills Management */}
                    <SkillsManager
                      skills={trainerForm.specializationSkills}
                      newSkill={newSkill}
                      setNewSkill={setNewSkill}
                      onAddSkill={addSkill}
                      onRemoveSkill={removeSkill}
                    />

                    {/* Experiences */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <Briefcase className="w-4 h-4 inline mr-1" />
                        Experiences
                      </label>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                          <input
                            type="text"
                            value={newExperience.title}
                            onChange={(e) => setNewExperience(prev => ({...prev, title: e.target.value}))}
                            placeholder="Job Title"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            value={newExperience.company}
                            onChange={(e) => setNewExperience(prev => ({...prev, company: e.target.value}))}
                            placeholder="Company"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="number"
                            value={newExperience.years}
                            onChange={(e) => setNewExperience(prev => ({...prev, years: e.target.value}))}
                            placeholder="Years"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <button
                            type="button"
                            onClick={addExperience}
                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                          >
                            Add
                          </button>
                        </div>
                        <textarea
                          value={newExperience.description}
                          onChange={(e) => setNewExperience(prev => ({...prev, description: e.target.value}))}
                          placeholder="Experience Description"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          rows="2"
                        />
                        {trainerForm.experiences && trainerForm.experiences.length > 0 && (
                          <div className="space-y-2">
                            {trainerForm.experiences.map((exp, index) => (
                              <div key={`${exp.title}-${index}`} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-gray-900">{exp.title}</h4>
                                  <p className="text-gray-600">{exp.company} • {exp.years} years</p>
                                  {exp.description && <p className="text-gray-600 text-sm mt-1">{exp.description}</p>}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeExperience(index)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Education */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        <GraduationCap className="w-4 h-4 inline mr-1" />
                        Education
                      </label>
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <input
                            type="text"
                            value={newEducation.degree}
                            onChange={(e) => setNewEducation(prev => ({...prev, degree: e.target.value}))}
                            placeholder="Degree"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <input
                            type="text"
                            value={newEducation.institution}
                            onChange={(e) => setNewEducation(prev => ({...prev, institution: e.target.value}))}
                            placeholder="Institution"
                            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex space-x-2">
                            <input
                              type="number"
                              value={newEducation.yearOfCompletion}
                              onChange={(e) => setNewEducation(prev => ({...prev, yearOfCompletion: e.target.value}))}
                              placeholder="Year"
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              type="button"
                              onClick={addEducation}
                              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
                            >
                              Add
                            </button>
                          </div>
                        </div>

                        {trainerForm.education && trainerForm.education.length > 0 && (
                          <div className="space-y-2">
                            {trainerForm.education.map((edu, index) => (
                              <div key={`${edu.degree}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div>
                                  <h4 className="font-semibold text-gray-900">{edu.degree}</h4>
                                  <p className="text-gray-600">{edu.institution} • {edu.yearOfCompletion}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeEducation(index)}
                                  className="text-red-600 hover:text-red-800"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                      <textarea
                        value={trainerForm.address}
                        onChange={(e) => setTrainerForm(prev => ({...prev, address: e.target.value}))}
                        placeholder="Full Address"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        rows="3"
                      />
                    </div>
                  </div>
                  
                  <div className="flex space-x-3 mt-6">
                    <button
                      onClick={updateTrainerProfile}
                      disabled={loading}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center space-x-2"
                    >
                      <Save className="w-4 h-4" />
                      <span>Update Profile</span>
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="bg-gray-500 text-white px-4 py-2 rounded-lg hover:bg-gray-600 flex items-center space-x-2"
                    >
                      <X className="w-4 h-4" />
                      <span>Cancel</span>
                    </button>
                  </div>
                </div>
              ) : (
                trainer && (
                  <div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex items-center space-x-3">
                          <User className="w-5 h-5 text-gray-600" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Personal Information</h4>
                            <p className="text-gray-600">Name: {trainer.name}</p>
                            <p className="text-gray-600">Email: {trainer.email}</p>
                            <p className="text-gray-600">Phone: {trainer.contact || trainer.phone || 'Not provided'}</p>
                            {trainer.address && <p className="text-gray-600">Address: {trainer.address}</p>}
                          </div>
                        </div>
                        
                        <div className="flex items-start space-x-3">
                          <Award className="w-5 h-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Trainer ID</h4>
                            <p className="text-gray-600">{trainer.trainerId || 'Not assigned'}</p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <Award className="w-5 h-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Specialization Skills</h4>
                            {trainer.specializationSkills && trainer.specializationSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {trainer.specializationSkills.map((skill, index) => (
                                  <span key={`${skill}-${index}`} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-600">No skills added yet</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-start space-x-3">
                          <Briefcase className="w-5 h-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Experience</h4>
                            {trainer.experiences && Array.isArray(trainer.experiences) && trainer.experiences.length > 0 ? (
                              <div className="space-y-2 mt-2">
                                {trainer.experiences.map((exp, index) => (
                                  <div key={`${exp.title}-${index}`} className="border-l-2 border-blue-200 pl-3">
                                    <h5 className="font-medium text-gray-900">{exp.title || 'N/A'}</h5>
                                    <p className="text-sm text-gray-600">
                                      {exp.company || 'N/A'} {exp.years && `• ${exp.years} years`}
                                    </p>
                                    {exp.description && <p className="text-sm text-gray-600 mt-1">{exp.description}</p>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-600">No experience added yet</p>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-start space-x-3">
                          <GraduationCap className="w-5 h-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Education</h4>
                            {trainer.education && trainer.education.length > 0 ? (
                              <div className="space-y-2 mt-2">
                                {trainer.education.map((edu, index) => (
                                  <div key={`${edu.degree}-${index}`} className="border-l-2 border-green-200 pl-3">
                                    <h5 className="font-medium text-gray-900">
                                      {edu?.degree || edu?.qualification || edu?.title || 'No Degree'}
                                    </h5>
                                    <p className="text-sm text-gray-600">
                                      {edu?.institution || edu?.school || edu?.university || 'No Institution'} 
                                      {(edu?.yearOfCompletion || edu?.year || edu?.graduationYear) && 
                                        ` • ${edu.yearOfCompletion || edu.year || edu.graduationYear}`}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-600">No education added yet</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <Calendar className="w-5 h-5 text-gray-600 mt-1" />
                          <div>
                            <h4 className="font-semibold text-gray-900">Join Date</h4>
                            <p className="text-gray-600">{trainer.joinDate || 'Not specified'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                      <h4 className="font-semibold text-blue-900 mb-2">Training Statistics</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-blue-800">Total Trainings: {trainings ? trainings.length : 0}</p>
                        </div>
                        <div>
                          <p className="text-blue-800">
                            Technical: {trainings ? trainings.filter(t => t.trainingType === 'technical').length : 0}
                          </p>
                        </div>
                        <div>
                          <p className="text-blue-800">
                            Soft Skills: {trainings ? trainings.filter(t => t.trainingType === 'soft skills').length : 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {trainer.rating && trainer.rating > 0 && (
                      <div className="mt-6 p-4 bg-green-50 rounded-lg">
                        <h4 className="font-semibold text-green-900 mb-2">Performance</h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <p className="text-green-800">Rating: {trainer.rating}/5</p>
                          </div>
                          <div>
                            <p className="text-green-800">Total Students: {trainer.totalStudents || 0}</p>
                          </div>
                          <div>
                            <p className="text-green-800">Total Hours: {trainer.totalHours || 0}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainerDashboard;