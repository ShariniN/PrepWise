import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Clock, Users, MapPin, DollarSign, Star,
  User, Award, BookOpen, CheckCircle, ExternalLink, Phone, Mail,
  Target, TrendingUp, MessageCircle, AlertCircle
} from 'lucide-react';
import NavBar from "../components/NavBar";

//star rating
const StarRating = ({ rating, onRatingChange, readonly = false }) => {
  return (
    <div className="flex items-center space-x-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          disabled={readonly}
          onClick={() => !readonly && onRatingChange(star)}
          className={`w-6 h-6 ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
        >
          <Star
            className={`w-full h-full ${
              star <= rating
                ? 'text-yellow-500 fill-current'
                : 'text-gray-300 hover:text-yellow-400'
            }`}
          />
        </button>
      ))}
    </div>
  );
};

const TrainingDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [training, setTraining] = useState(null);
  const [trainer, setTrainer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    rating: 0,
    comment: ''
  });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [userCanReview, setUserCanReview] = useState(false);
  const [reviewCheckLoading, setReviewCheckLoading] = useState(false);
  const [trainingReviews, setTrainingReviews] = useState([]);
  const [reviewEligibilityReason, setReviewEligibilityReason] = useState('');

  useEffect(() => {
    fetchTrainingDetails();
  }, [id]);

  useEffect(() => {
    if (trainer && training) {
      checkReviewEligibility();
      fetchTrainingReviews();
    }
  }, [trainer, training]);

  const fetchTrainingDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch training details
      const trainingResponse = await fetch(`/api/trainings/${id}`, {
        credentials: 'include'
      });
      const trainingData = await trainingResponse.json();

      console.log('Full Training Data:', trainingData);

      if (trainingData.success) {
        setTraining(trainingData.data);
        
        let trainerId = null;
        
        if (trainingData.data.trainerId) {
          if (typeof trainingData.data.trainerId === 'object') {
            trainerId = trainingData.data.trainerId._id || 
                      trainingData.data.trainerId.id || 
                      trainingData.data.trainerId.trainerId ||
                      trainingData.data.trainerId.toString();
          } else if (typeof trainingData.data.trainerId === 'string') {
            trainerId = trainingData.data.trainerId;
          }
        }
        
        if (!trainerId) {
          trainerId = trainingData.data.trainer || 
                     trainingData.data.instructor || 
                     trainingData.data.createdBy || 
                     trainingData.data.instructorId;
          
          if (typeof trainerId === 'object' && trainerId) {
            trainerId = trainerId._id || trainerId.id || trainerId.trainerId;
          }
        }
        
        console.log('Processed trainerId:', trainerId);
        
        if (trainerId) {
          try {
            console.log('Fetching trainer with ID:', trainerId);
            
            const trainerResponse = await fetch(`/api/trainer/${trainerId}`, {
              credentials: 'include'
            });
            
            if (trainerResponse.ok) {
              const trainerData = await trainerResponse.json();
              console.log('Trainer API Response:', trainerData);
              
              if (trainerData.success && trainerData.data) {
                setTrainer(trainerData.data);
                console.log('Trainer set successfully:', trainerData.data);
              } else {
                console.log('Trainer data unsuccessful or missing');
                setTrainer(null);
              }
            } else {
              console.log('Trainer API response not OK:', trainerResponse.status);
              
              // Try alternative endpoint
              try {
                const altResponse = await fetch(`/api/trainers/${trainerId}`, {
                  credentials: 'include'
                });
                
                if (altResponse.ok) {
                  const altTrainerData = await altResponse.json();
                  console.log('Alternative Trainer API Response:', altTrainerData);
                  
                  if (altTrainerData.success && altTrainerData.data) {
                    setTrainer(altTrainerData.data);
                  } else {
                    setTrainer(null);
                  }
                } else {
                  console.log('Alternative trainer endpoint also failed');
                  setTrainer(null);
                }
              } catch (altErr) {
                console.log('Alternative trainer fetch error:', altErr);
                setTrainer(null);
              }
            }
          } catch (trainerErr) {
            console.error('Error fetching trainer:', trainerErr);
            setTrainer(null);
          }
        } else {
          console.log('No valid trainer ID found');
          setTrainer(null);
        }
      } else {
        setError('Training not found');
      }
    } catch (err) {
      console.error('Error fetching training details:', err);
      setError('Failed to load training details');
    } finally {
      setLoading(false);
    }
  };

  // Check if user can review this specific training
  const checkReviewEligibility = async () => {
    if (!trainer?._id || !training?._id) return;
    
    try {
      setReviewCheckLoading(true);
      const response = await fetch(`/api/trainer/${trainer._id}/training/${training._id}/can-review`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setUserCanReview(data.success && data.canReview);
        setReviewEligibilityReason(data.reason || '');
        console.log('Review eligibility:', data);
      } else {
        setUserCanReview(false);
        setReviewEligibilityReason('Unable to check review eligibility');
      }
    } catch (error) {
      console.error('Error checking review eligibility:', error);
      setUserCanReview(false);
      setReviewEligibilityReason('Error checking review eligibility');
    } finally {
      setReviewCheckLoading(false);
    }
  };

  // // Fetch training-specific reviews
  // const fetchTrainingReviews = async () => {
  //   if (!trainer?._id || !training?._id) return;
    
  //   try {
  //     const response = await fetch(`/api/trainer/${trainer._id}/reviews?trainingId=${training._id}`, {
  //       credentials: 'include'
  //     });
      
  //     if (response.ok) {
  //       const data = await response.json();
  //       console.log('Training reviews response:', data);
  //       if (data.success) {
  //         setTrainingReviews(data.data.reviews || []);
  //       }
  //     }
  //   } catch (error) {
  //     console.error('Error fetching training reviews:', error);
  //   }
  // };

 // Updated submitReview function with enhanced debugging
const submitReview = async () => {
  console.log('=== REVIEW SUBMISSION DEBUG ===');
  console.log('Review form data:', reviewForm);
  console.log('Trainer ID:', trainer?._id);
  console.log('Training ID:', training?._id);
  console.log('User can review:', userCanReview);

  // Enhanced validation
  if (!reviewForm.rating || reviewForm.rating < 1 || reviewForm.rating > 5) {
    console.log('Rating validation failed:', reviewForm.rating);
    setError('Please select a rating between 1 and 5 stars');
    return;
  }

  if (!reviewForm.comment.trim()) {
    console.log('Comment validation failed');
    setError('Please provide a comment for your review');
    return;
  }

  if (!trainer?._id || !training?._id) {
    console.log('Missing IDs - Trainer ID:', trainer?._id, 'Training ID:', training?._id);
    setError('Missing trainer or training information');
    return;
  }

  try {
    setSubmittingReview(true);
    setError(null);

    const requestUrl = `/api/trainer/${trainer._id}/training-review`;
    const requestBody = {
      trainingId: training._id,
      rating: reviewForm.rating,
      comment: reviewForm.comment.trim()
    };

    console.log('Making request to:', requestUrl);
    console.log('Request body:', requestBody);

    const response = await fetch(requestUrl, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log('Response status:', response.status);
    console.log('Response OK:', response.ok);

    // Get response text first to handle potential parsing errors
    const responseText = await response.text();
    console.log('Raw response:', responseText);

    let data;
    try {
      data = JSON.parse(responseText);
      console.log('Parsed response data:', data);
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', parseError);
      throw new Error('Invalid response format from server');
    }

    if (data.success) {
      console.log('Review submitted successfully!');
      
      // Create new review object for immediate UI update
      const newReview = {
        _id: Date.now().toString(),
        rating: reviewForm.rating,
        comment: reviewForm.comment.trim(),
        createdAt: new Date().toISOString(),
        training: {
          _id: training._id,
          title: training.title
        },
        user: {
          name: 'You'
        }
      };
      
      console.log('Adding new review to UI:', newReview);
      setTrainingReviews(prev => [newReview, ...prev]);
      
      // Update trainer ratings if provided
      if (data.data?.ratings) {
        console.log('Updating trainer ratings:', data.data.ratings);
        setTrainer(prev => ({
          ...prev,
          ratings: {
            average: data.data.ratings.average,
            totalRatings: data.data.ratings.totalRatings
          }
        }));
      }

      // Reset form and UI
      setReviewForm({ rating: 0, comment: '' });
      setShowReviewForm(false);
      setUserCanReview(false);
      setReviewEligibilityReason('You have already reviewed this training');
      
      console.log('Review submission completed successfully');
      
      // Refresh reviews to get accurate data
      setTimeout(() => {
        console.log('Refreshing reviews...');
        fetchTrainingReviews();
      }, 1000);
      
    } else {
      console.error('Review submission failed:', data);
      setError(data.message || 'Failed to submit review');
    }
  } catch (err) {
    console.error('Error submitting review:', err);
    console.error('Error stack:', err.stack);
    
    // Provide more specific error messages
    if (err.name === 'TypeError' && err.message.includes('Failed to fetch')) {
      setError('Network error. Please check your connection and try again.');
    } else if (err.message.includes('Invalid response format')) {
      setError('Server error. Please try again later.');
    } else {
      setError(`Failed to submit review: ${err.message}`);
    }
  } finally {
    setSubmittingReview(false);
  }
};

// Also add debugging to the fetchTrainingReviews function
const fetchTrainingReviews = async () => {
  if (!trainer?._id || !training?._id) {
    console.log('Cannot fetch reviews - missing IDs');
    return;
  }
  
  try {
    console.log('Fetching training reviews...');
    const response = await fetch(`/api/trainer/${trainer._id}/reviews?trainingId=${training._id}`, {
      credentials: 'include'
    });
    
    console.log('Reviews fetch response status:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('Training reviews response:', data);
      
      if (data.success) {
        console.log('Setting reviews:', data.data.reviews);
        setTrainingReviews(data.data.reviews || []);
      } else {
        console.log('Reviews fetch unsuccessful:', data.message);
      }
    } else {
      console.log('Reviews fetch failed with status:', response.status);
    }
  } catch (error) {
    console.error('Error fetching training reviews:', error);
  }
};
  

  const handleRegister = () => {
    navigate(`/training-booking/${id}`);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <NavBar />
        <div className="flex items-center justify-center h-96 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading training details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <NavBar />
        <div className="flex items-center justify-center h-96 pt-24">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Training Not Found</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button 
              onClick={() => navigate('/trainings')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Back to Trainings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <NavBar />
      
      <div className="max-w-6xl mx-auto p-6 pt-24">
        {/* Back Button */}
        <button 
          onClick={() => navigate('/trainings')}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Trainings
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2">
            {/* Training Header */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{training.title}</h1>
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      training.trainingType === 'technical' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {training.trainingType}
                    </span>
                    {training.trainingCategory && (
                      <span className="flex items-center">
                        <Target className="w-4 h-4 mr-1" />
                        {training.trainingCategory}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-2xl font-bold text-green-600 mb-1">
                    {training.price ? `LKR ${training.price}` : 'Free'}
                  </div>
                  <div className="text-sm text-gray-500">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      training.status === 'active' ? 'bg-green-100 text-green-800' :
                      training.status === 'upcoming' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {training.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Training Info */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {training.startDate && (
                  <div className="flex items-center text-sm">
                    <Calendar className="w-4 h-4 mr-2 text-blue-500" />
                    <div>
                      <div className="font-medium">Start Date</div>
                      <div className="text-gray-600">{new Date(training.startDate).toLocaleDateString()}</div>
                    </div>
                  </div>
                )}
                
                {training.duration && (
                  <div className="flex items-center text-sm">
                    <Clock className="w-4 h-4 mr-2 text-green-500" />
                    <div>
                      <div className="font-medium">Duration</div>
                      <div className="text-gray-600">{training.duration}</div>
                    </div>
                  </div>
                )}

                {training.timeSlot && (
                  <div className="flex items-center text-sm">
                    <Clock className="w-4 h-4 mr-2 text-purple-500" />
                    <div>
                      <div className="font-medium">Time Slot</div>
                      <div className="text-gray-600">{training.timeSlot}</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center text-sm">
                  <Users className="w-4 h-4 mr-2 text-orange-500" />
                  <div>
                    <div className="font-medium">Available Spots</div>
                    <div className="text-gray-600">
                      {training.availableSpots || (training.availableSlots - training.registeredParticipants)} / {training.availableSlots}
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="border-b border-gray-200">
                <nav className="flex space-x-8">
                  {['overview', 'trainer', 'reviews'].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={`py-2 px-1 border-b-2 font-medium text-sm ${
                        activeTab === tab
                          ? 'border-blue-500 text-blue-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                      {tab === 'reviews' && trainingReviews.length > 0 && (
                        <span className="ml-1 px-2 py-0.5 bg-blue-100 text-blue-600 text-xs rounded-full">
                          {trainingReviews.length}
                        </span>
                      )}
                    </button>
                  ))}
                </nav>
              </div>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {activeTab === 'overview' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">About This Training</h3>
                  <div className="prose max-w-none text-gray-600">
                    <p>{training.description || 'No detailed description available for this training.'}</p>
                  </div>
                  
                  {training.onlineLink && (
                    <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h4 className="font-medium text-blue-900 mb-2">Training Platform</h4>
                      <p className="text-blue-700 text-sm">This training will be conducted online. The meeting link will be provided after successful registration and payment confirmation.</p>
                    </div>
                  )}

                  <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                        What You'll Learn
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Hands-on practical experience</li>
                        <li>• Industry best practices</li>
                        <li>• Real-world project examples</li>
                        <li>• Career guidance and tips</li>
                      </ul>
                    </div>
                    
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2 flex items-center">
                        <TrendingUp className="w-4 h-4 mr-2 text-blue-500" />
                        Training Format
                      </h4>
                      <ul className="text-sm text-gray-600 space-y-1">
                        <li>• Interactive sessions</li>
                        <li>• Q&A opportunities</li>
                        <li>• Practical exercises</li>
                        <li>• Certificate upon completion</li>
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'trainer' && trainer && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">About Your Instructor</h3>
                  
                  {/* Trainer Profile Header */}
                  <div className="flex items-start space-x-4 mb-6 p-4 bg-gray-50 rounded-lg">
                    <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                      <User className="w-10 h-10 text-white" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-2xl font-bold text-gray-900 mb-1">{trainer.name}</h4>
                      <p className="text-sm text-gray-600 mb-2">Trainer ID: {trainer.trainerId}</p>
                      
                      {/* Rating */}
                      <div className="flex items-center mb-3">
                        <div className="flex items-center mr-2">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={`w-4 h-4 ${
                                i < Math.floor(trainer.ratings?.average || 0) 
                                  ? 'text-yellow-500 fill-current' 
                                  : 'text-gray-300'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-sm text-gray-600">
                          {trainer.ratings?.average?.toFixed(1) || '0.0'} ({trainer.ratings?.totalRatings || 0} reviews)
                        </span>
                      </div>

                      {/* Contact Information */}
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-center text-sm text-gray-600">
                          <Mail className="w-4 h-4 mr-2 text-blue-500" />
                          <span>{trainer.email}</span>
                        </div>
                        {trainer.contact && (
                          <div className="flex items-center text-sm text-gray-600">
                            <Phone className="w-4 h-4 mr-2 text-green-500" />
                            <span>{trainer.contact}</span>
                          </div>
                        )}
                      </div>

                      {/* Account Status */}
                      <div className="mt-2">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                          trainer.isAccountVerified 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {trainer.isAccountVerified ? (
                            <>
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Verified Trainer
                            </>
                          ) : (
                            'Pending Verification'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Specialization Skills */}
                  {trainer.specializationSkills && trainer.specializationSkills.length > 0 && (
                    <div className="mb-8">
                      <h5 className="font-semibold text-gray-900 mb-4 flex items-center">
                        <Target className="w-5 h-5 mr-2 text-blue-500" />
                        Specialization Skills
                      </h5>
                      <div className="flex flex-wrap gap-2">
                        {trainer.specializationSkills.map((skill, index) => (
                          <span 
                            key={index}
                            className="px-3 py-2 bg-blue-100 text-blue-800 text-sm rounded-full font-medium hover:bg-blue-200 transition-colors"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Professional Experience */}
                  {trainer.experiences && trainer.experiences.length > 0 && (
                    <div className="mb-8">
                      <h5 className="font-semibold text-gray-900 mb-4 flex items-center">
                        <Award className="w-5 h-5 mr-2 text-purple-500" />
                        Professional Experience
                      </h5>
                      <div className="space-y-4">
                        {trainer.experiences.map((exp, index) => (
                          <div key={index} className="border-l-4 border-purple-500 pl-4 bg-purple-50 p-4 rounded-r-lg">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1">
                                <h6 className="font-semibold text-gray-900 text-lg">{exp.title}</h6>
                                {exp.company && (
                                  <p className="text-gray-700 font-medium">{exp.company}</p>
                                )}
                              </div>
                              {exp.years && (
                                <span className="px-3 py-1 bg-purple-200 text-purple-800 text-sm rounded-full font-medium">
                                  {exp.years} {exp.years === 1 ? 'year' : 'years'}
                                </span>
                              )}
                            </div>
                            {exp.description && (
                              <p className="text-gray-600 text-sm leading-relaxed mt-2">
                                {exp.description}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      
                      {/* Total Experience Summary */}
                      <div className="mt-4 p-3 bg-purple-100 rounded-lg">
                        <p className="text-sm text-purple-800 font-medium">
                          <TrendingUp className="w-4 h-4 inline mr-1" />
                          Total Experience: {trainer.experiences.reduce((sum, exp) => sum + (exp.years || 0), 0)} years
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {trainer.education && trainer.education.length > 0 && (
                    <div className="mb-8">
                      <h5 className="font-semibold text-gray-900 mb-4 flex items-center">
                        <BookOpen className="w-5 h-5 mr-2 text-green-500" />
                        Education & Qualifications
                      </h5>
                      <div className="space-y-4">
                        {trainer.education.map((edu, index) => (
                          <div key={index} className="border-l-4 border-green-500 pl-4 bg-green-50 p-4 rounded-r-lg">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h6 className="font-semibold text-gray-900 text-lg">{edu.degree}</h6>
                                <p className="text-gray-700 font-medium">{edu.institution}</p>
                              </div>
                              {edu.yearOfCompletion && (
                                <span className="px-3 py-1 bg-green-200 text-green-800 text-sm rounded-full font-medium">
                                  {edu.yearOfCompletion}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Activity Status */}
                  <div className="mt-8 p-4 bg-gray-100 rounded-lg">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center text-gray-600">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>Last Active:</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {trainer.lastActive 
                          ? new Date(trainer.lastActive).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })
                          : 'Recently'
                        }
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between text-sm mt-2">
                      <div className="flex items-center text-gray-600">
                        <User className="w-4 h-4 mr-2" />
                        <span>Member Since:</span>
                      </div>
                      <span className="font-medium text-gray-900">
                        {new Date(trainer.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long'
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Empty State Messages */}
                  {(!trainer.specializationSkills || trainer.specializationSkills.length === 0) && 
                   (!trainer.experiences || trainer.experiences.length === 0) && 
                   (!trainer.education || trainer.education.length === 0) && (
                    <div className="text-center py-8 bg-gray-50 rounded-lg">
                      <User className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">Trainer profile is being updated. Basic information is available above.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Training Reviews</h3>
                      <p className="text-sm text-gray-500">Reviews specific to "{training.title}"</p>
                    </div>
                    {trainer && userCanReview && !reviewCheckLoading && (
                      <button
                        onClick={() => setShowReviewForm(!showReviewForm)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                      >
                        Write a Review
                      </button>
                    )}
                  </div>

                  {/* Review Eligibility Status */}
                  {!reviewCheckLoading && !userCanReview && (
                    <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="flex items-center">
                        <AlertCircle className="w-5 h-5 text-yellow-600 mr-2" />
                        <div>
                          <h4 className="text-yellow-800 font-medium">Review Not Available</h4>
                          <p className="text-yellow-700 text-sm">
                            {reviewEligibilityReason || 'You need to be registered for this training to leave a review, or you may have already reviewed this training.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Loading state for review eligibility check */}
                  {reviewCheckLoading && (
                    <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                        <p className="text-blue-700 text-sm">Checking review eligibility...</p>
                      </div>
                    </div>
                  )}

                  {/* Review Form */}
                  {showReviewForm && (
                    <div className="mb-6 p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <h4 className="font-medium text-gray-900 mb-4">Share Your Experience with This Training</h4>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Your Rating *
                          </label>
                          <StarRating 
                            rating={reviewForm.rating} 
                            onRatingChange={(rating) => setReviewForm(prev => ({...prev, rating}))}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Your Review *
                          </label>
                          <textarea
                            value={reviewForm.comment}
                            onChange={(e) => setReviewForm(prev => ({...prev, comment: e.target.value}))}
                            placeholder="Share your thoughts about this specific training session, content quality, trainer effectiveness, etc..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
                            rows="4"
                            maxLength="500"
                          />
                          <div className="text-right text-xs text-gray-500 mt-1">
                            {reviewForm.comment.length}/500
                          </div>
                        </div>
                        
                        {error && (
                          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="text-red-800 text-sm">{error}</p>
                          </div>
                        )}
                        
                        <div className="flex space-x-3">
                          <button
                            onClick={submitReview}
                            disabled={submittingReview || !reviewForm.rating || !reviewForm.comment.trim()}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium flex items-center"
                          >
                            {submittingReview ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                Submitting...
                              </>
                            ) : (
                              'Submit Review'
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setShowReviewForm(false);
                              setReviewForm({ rating: 0, comment: '' });
                              setError(null);
                            }}
                            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm font-medium"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Reviews List */}
                  {trainingReviews && trainingReviews.length > 0 ? (
                    <div>
                      <div className="mb-4">
                        <h4 className="font-medium text-gray-900">
                          {trainingReviews.length} Review{trainingReviews.length !== 1 ? 's' : ''} for this Training
                        </h4>
                      </div>
                      <div className="space-y-4">
                        {trainingReviews.map((review, index) => (
                          <div key={review._id || index} className="border-b border-gray-200 pb-4 last:border-b-0">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                  <User className="w-4 h-4 text-white" />
                                </div>
                                <div>
                                  <StarRating rating={review.rating} readonly={true} />
                                  <div className="text-xs text-gray-500 mt-1">
                                    {review.user?.name ? `by ${review.user.name}` : 'Anonymous'} • {' '}
                                    {new Date(review.createdAt).toLocaleDateString('en-US', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                            <p className="text-gray-700 leading-relaxed ml-11">{review.comment}</p>
                            
                            {/* Training Context Badge */}
                            {review.training && (
                              <div className="ml-11 mt-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                  <BookOpen className="w-3 h-3 mr-1" />
                                  {review.training.title}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                      <h4 className="text-lg font-medium text-gray-900 mb-2">No Reviews Yet</h4>
                      <p className="text-gray-600 mb-4">Be the first to review this training!</p>
                      {userCanReview && !showReviewForm && (
                        <button
                          onClick={() => setShowReviewForm(true)}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                        >
                          Write the First Review
                        </button>
                      )}
                    </div>
                  )}

                  {/* Overall Trainer Rating Context */}
                  {trainer && trainer.ratings && trainer.ratings.totalRatings > 0 && (
                    <div className="mt-8 pt-6 border-t border-gray-200">
                      {/* <div className="bg-gray-50 rounded-lg p-4">
                        <h5 className="font-medium text-gray-900 mb-2">About the Trainer</h5>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center">
                            <StarRating rating={Math.round(trainer.ratings.average)} readonly={true} />
                            <span className="ml-2 text-sm text-gray-600">
                              {trainer.ratings.average.toFixed(1)} average rating
                            </span>
                          </div>
                          <span className="text-sm text-gray-500">
                            {trainer.ratings.totalRatings} total reviews across all trainings
                          </span>
                        </div>
                      </div> */}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <div className="text-center mb-6">
                <div className="text-3xl font-bold text-green-600 mb-2">
                    {training.price ? `LKR ${training.price}` : 'Free'}
                </div>
                <div className="text-sm text-gray-500">
                  {training.trainingType === 'soft skills' ? 'Individual Training' : 'Group Training'}
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Available Spots:</span>
                  <span className="font-medium">
                    {training.availableSpots || (training.availableSlots - training.registeredParticipants)}
                  </span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Training Type:</span>
                  <span className="font-medium capitalize">{training.trainingType}</span>
                </div>

                {training.startDate && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Start Date:</span>
                    <span className="font-medium">{new Date(training.startDate).toLocaleDateString()}</span>
                  </div>
                )}

                {training.duration && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">{training.duration}</span>
                  </div>
                )}

                {/* Training-specific review count */}
                {trainingReviews.length > 0 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Training Reviews:</span>
                    <span className="font-medium flex items-center">
                      <Star className="w-4 h-4 text-yellow-500 mr-1" />
                      {trainingReviews.length}
                    </span>
                  </div>
                )}
              </div>

              <button
                onClick={handleRegister}
                disabled={training.availableSpots === 0 || (training.availableSlots - training.registeredParticipants) <= 0}
                className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {training.availableSpots === 0 || (training.availableSlots - training.registeredParticipants) <= 0
                  ? 'Fully Booked'
                  : 'Register Now'
                }
              </button>

              <div className="mt-4 text-xs text-gray-500 text-center">
                <CheckCircle className="w-4 h-4 inline mr-1" />
                Secure registration with OTP verification
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingDetailsPage;