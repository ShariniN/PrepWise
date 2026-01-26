import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Clock, Users, DollarSign, User, Mail, Phone,
  MapPin, CheckCircle, AlertCircle, CreditCard, Shield
} from 'lucide-react';
import NavBar from "../components/NavBar";

const TrainingBookingPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  // States
  const [training, setTraining] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [bookingStep, setBookingStep] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    contact: '',
    affiliation: ''
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  // Available time slots for soft skills training
  const timeSlots = [
    '9:00 AM - 10:00 AM',
    '10:00 AM - 11:00 AM', 
    '11:00 AM - 12:00 PM',
    '2:00 PM - 3:00 PM',
    '3:00 PM - 4:00 PM',
    '4:00 PM - 5:00 PM'
  ];

  useEffect(() => {
    fetchTrainingDetails();
  }, [id]);

  const fetchTrainingDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/trainings/${id}`, {
        credentials: 'include'
      });
      const data = await response.json();

      if (data.success) {
        setTraining(data.data);
        // Pre-fill form with user data if available
        fetchUserProfile();
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

  const fetchUserProfile = async () => {
    try {
      const response = await fetch('/api/user/profile', {
        credentials: 'include'
      });
      const data = await response.json();
      
      if (data.success) {
        setFormData(prevData => ({
          ...prevData,
          name: data.data.name || '',
          email: data.data.email || '',
          contact: data.data.contact || data.data.phone || ''
        }));
      }
    } catch (err) {
      console.log('Could not fetch user profile:', err);
      // Continue without pre-filling
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email';
    }
    
    if (!formData.contact.trim()) {
      errors.contact = 'Contact number is required';
    }
    
    if (!formData.affiliation) {
      errors.affiliation = 'Please select your affiliation';
    }
    
    // For soft skills training, slot selection is required
    if (training?.trainingType === 'soft skills' && !selectedSlot) {
      errors.slot = 'Please select a time slot';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear validation error when user types
    if (validationErrors[name]) {
      setValidationErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const handleNextStep = () => {
    if (validateForm()) {
      setBookingStep(2);
    }
  };

  const handleRegister = async () => {
    if (!validateForm()) return;
    
    setSubmitting(true);
    try {
      const registrationData = {
        trainingId: id,
        participantInfo: {
          name: formData.name,
          email: formData.email,
          contact: formData.contact,
          affiliation: formData.affiliation
        },
        selectedSlot: training.trainingType === 'soft skills' ? selectedSlot : null
      };

      const response = await fetch(`/api/trainings/${id}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(registrationData)
      });

      const data = await response.json();
      
      if (data.success) {
        // Navigate to payment page
        navigate(`/training-payment/${id}`, {
          state: { 
            registrationData,
            training,
            selectedSlot
          }
        });
      } else {
        setError(data.message || 'Failed to register');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Failed to register. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <NavBar />
        <div className="flex items-center justify-center h-96 pt-24">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading booking form...</p>
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
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Unavailable</h2>
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

  const availableSpots = training.availableSlots - training.registeredParticipants;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
      <NavBar />
      
      <div className="max-w-4xl mx-auto p-6 pt-24">
        {/* Back Button */}
        <button 
          onClick={() => navigate(`/training-details/${id}`)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Training Details
        </button>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div 
              role="button"
              className={`flex items-center justify-center w-8 h-8 rounded-full ${
                bookingStep >= 1 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}
            >
              1
            </div>
            <div className={`h-1 w-16 ${bookingStep >= 2 ? 'bg-blue-600' : 'bg-gray-300'}`}></div>
            <div 
              role="button"
              className={`flex items-center justify-center w-8 h-8 rounded-full ${
                bookingStep >= 2 ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}
            >
              2
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {bookingStep === 1 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Registration Details</h2>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                      </label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleInputChange}
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            validationErrors.name ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your full name"
                        />
                      </div>
                      {validationErrors.name && (
                        <p className="mt-1 text-sm text-red-600">{validationErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                      </label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleInputChange}
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            validationErrors.email ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your email"
                        />
                      </div>
                      {validationErrors.email && (
                        <p className="mt-1 text-sm text-red-600">{validationErrors.email}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Contact Number *
                      </label>
                      <div className="relative">
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="tel"
                          name="contact"
                          value={formData.contact}
                          onChange={handleInputChange}
                          className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                            validationErrors.contact ? 'border-red-500' : 'border-gray-300'
                          }`}
                          placeholder="Enter your phone number"
                        />
                      </div>
                      {validationErrors.contact && (
                        <p className="mt-1 text-sm text-red-600">{validationErrors.contact}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Affiliation *
                      </label>
                      <select
                        name="affiliation"
                        value={formData.affiliation}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                          validationErrors.affiliation ? 'border-red-500' : 'border-gray-300'
                        }`}
                      >
                        <option value="">Select your affiliation</option>
                        <option value="undergraduate">Undergraduate Student</option>
                        <option value="intern">Intern</option>
                        <option value="postgraduate">Postgraduate Student</option>
                        <option value="professional">Working Professional</option>
                        <option value="other">Other</option>
                      </select>
                      {validationErrors.affiliation && (
                        <p className="mt-1 text-sm text-red-600">{validationErrors.affiliation}</p>
                      )}
                    </div>
                  </div>

                  {/* Time Slot Selection for Soft Skills */}
                  {training.trainingType === 'soft skills' && (
                    <div className="mt-6">
                      <label className="block text-sm font-medium text-gray-700 mb-4">
                        Select Time Slot *
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {timeSlots.map((slot) => (
                          <div
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                              selectedSlot === slot
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                            data-testid={`time-slot-${slot}`}
                          >
                            <div className="flex items-center">
                              <Clock className="w-4 h-4 mr-2" />
                              <span className="font-medium">{slot}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {validationErrors.slot && (
                        <p className="mt-2 text-sm text-red-600">{validationErrors.slot}</p>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end mt-8">
                    <button
                      onClick={handleNextStep}
                      className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Continue to Review
                    </button>
                  </div>
                </div>
              )}

              {bookingStep === 2 && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">Review & Confirm</h2>
                  
                  <div className="space-y-6">
                    {/* Personal Details Summary */}
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Personal Information</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Name:</span>
                          <span className="ml-2 font-medium">{formData.name}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Email:</span>
                          <span className="ml-2 font-medium">{formData.email}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Contact:</span>
                          <span className="ml-2 font-medium">{formData.contact}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Affiliation:</span>
                          <span className="ml-2 font-medium capitalize">{formData.affiliation}</span>
                        </div>
                      </div>
                    </div>

                    {/* Selected Slot for Soft Skills */}
                    {training.trainingType === 'soft skills' && selectedSlot && (
                      <div className="bg-blue-50 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-900 mb-3">Selected Time Slot</h3>
                        <div className="flex items-center text-blue-700">
                          <Clock className="w-4 h-4 mr-2" />
                          <span className="font-medium">{selectedSlot}</span>
                        </div>
                      </div>
                    )}

                    {/* Terms and Conditions */}
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-2">Important Notes</h3>
                      <ul className="text-sm text-gray-700 space-y-1">
                        <li>• Payment confirmation required via OTP verification</li>
                        <li>• Virtual training link will be sent to your registered email</li>
                        <li>• Registration is non-refundable once confirmed</li>
                        <li>• Please join 5 minutes before the scheduled time</li>
                      </ul>
                    </div>
                  </div>

                  <div className="flex justify-between mt-8">
                    <button
                      onClick={() => setBookingStep(1)}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Back to Edit
                    </button>
                    <button
                      onClick={handleRegister}
                      disabled={submitting}
                      className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                    >
                      {submitting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="w-4 h-4 mr-2" />
                          Proceed to Payment
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Training Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Training Summary</h3>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-medium text-gray-900 text-sm">{training.title}</h4>
                  <p className="text-xs text-gray-500 mt-1 capitalize">{training.trainingType} Training</p>
                </div>

                {training.trainingCategory && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Category:</span>
                    <span className="font-medium">{training.trainingCategory}</span>
                  </div>
                )}

                {training.startDate && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Date:</span>
                    <span className="font-medium">{new Date(training.startDate).toLocaleDateString()}</span>
                  </div>
                )}

                {training.duration && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Duration:</span>
                    <span className="font-medium">{training.duration}</span>
                  </div>
                )}

                {training.trainingType === 'soft skills' && selectedSlot && bookingStep === 2 && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Time Slot:</span>
                    <span className="font-medium text-xs">{selectedSlot}</span>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Available Spots:</span>
                  <span className="font-medium" data-testid="available-spots">{availableSpots}</span>
                </div>

                <hr className="border-gray-200" />

                <div className="flex items-center justify-between">
                  <span className="text-gray-900 font-semibold">Total Amount:</span>
                  <span className="text-2xl font-bold text-green-600">
                    {training.price || 'Free'}
                  </span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-start">
                  <Shield className="w-5 h-5 text-blue-600 mr-2 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-900">Secure Registration</h4>
                    <p className="text-xs text-blue-700 mt-1">
                      Your registration is protected with OTP verification and secure payment processing.
                    </p>
                  </div>
                </div>
              </div>

              {availableSpots <= 3 && availableSpots > 0 && (
                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 text-orange-600 mr-2" />
                    <span className="text-sm text-orange-700 font-medium">
                      Only {availableSpots} spot{availableSpots !== 1 ? 's' : ''} left!
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg">
            <div className="flex items-center">
              <AlertCircle className="w-4 h-4 mr-2" />
              <span className="text-sm">{error}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingBookingPage;