import React, { useState, useEffect } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  ArrowLeft, CreditCard, Shield, CheckCircle, AlertCircle,
  Clock, Mail, Phone, User, DollarSign, Lock, Send
} from 'lucide-react';
import NavBar from "../components/NavBar";

const TrainingPaymentPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get data from booking page or window state for testing
  const getLocationState = () => {
    // Check for test state first
    if (typeof window !== 'undefined' && window.__testState) {
      return window.__testState;
    }
    // Check React Router location state
    if (location?.state) {
      return location.state;
    }
    // Check window.location.state for testing compatibility
    if (typeof window !== 'undefined' && window.location?.state) {
      return window.location.state;
    }
    // Check history state
    if (typeof window !== 'undefined' && window.history?.state) {
      return window.history.state;
    }
    return {};
  };

  const { registrationData, training, selectedSlot } = getLocationState();
  
  // States
  const [paymentStep, setPaymentStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentDetails, setPaymentDetails] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    bankAccount: '',
    mobileNumber: ''
  });
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpTimer, setOtpTimer] = useState(300); // 5 minutes
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Redirect if no registration data
    if (!registrationData || !training) {
      navigate('/trainings');
      return;
    }

    // Start OTP timer if OTP is sent
    if (otpSent && otpTimer > 0) {
      const timer = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [registrationData, training, navigate, otpSent, otpTimer]);

  // Listen for popstate events for testing
  useEffect(() => {
    const handlePopState = (event) => {
      if (event.state) {
        // Force re-render when state changes
        window.dispatchEvent(new Event('statechange'));
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePaymentMethodSelect = (method) => {
    setPaymentMethod(method);
    setError('');
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Format card number and expiry date
    if (name === 'cardNumber') {
      const formatted = value.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();
      if (formatted.length <= 19) {
        setPaymentDetails(prev => ({ ...prev, [name]: formatted }));
      }
    } else if (name === 'expiryDate') {
      const formatted = value.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1/$2');
      if (formatted.length <= 5) {
        setPaymentDetails(prev => ({ ...prev, [name]: formatted }));
      }
    } else if (name === 'cvv') {
      const formatted = value.replace(/\D/g, '');
      if (formatted.length <= 4) {
        setPaymentDetails(prev => ({ ...prev, [name]: formatted }));
      }
    } else {
      setPaymentDetails(prev => ({ ...prev, [name]: value }));
    }
  };

  const validatePaymentDetails = () => {
    if (!paymentMethod) {
      setError('Please select a payment method');
      return false;
    }

    if (paymentMethod === 'card') {
      if (!paymentDetails.cardNumber || paymentDetails.cardNumber.replace(/\s/g, '').length < 16) {
        setError('Please enter a valid card number');
        return false;
      }
      if (!paymentDetails.expiryDate || paymentDetails.expiryDate.length < 5) {
        setError('Please enter a valid expiry date');
        return false;
      }
      if (!paymentDetails.cvv || paymentDetails.cvv.length < 3) {
        setError('Please enter a valid CVV');
        return false;
      }
      if (!paymentDetails.cardholderName.trim()) {
        setError('Please enter the cardholder name');
        return false;
      }
    } else if (paymentMethod === 'bank') {
      if (!paymentDetails.bankAccount.trim()) {
        setError('Please enter your bank account number');
        return false;
      }
    } else if (paymentMethod === 'mobile') {
      if (!paymentDetails.mobileNumber.trim()) {
        setError('Please enter your mobile number');
        return false;
      }
    }
    return true;
  };

  const sendOTP = async () => {
    setProcessing(true);
    setError('');
    
    try {
      const response = await fetch('/api/trainings/send-payment-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: registrationData.participantInfo.email,
          trainingId: id,
          amount: training.price || 'Free'
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        // Success - move to OTP step
        setOtpSent(true);
        setPaymentStep(2);
        setOtpTimer(300); // Reset timer
        setError('');
        toast.success('Verification code sent to your email!');
      } else {
        // Handle error response
        setError(data.message || 'Failed to send verification code');
      }
    } catch (err) {
      console.error('Send OTP error:', err);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setProcessing(false);
    }
  };

  const handleProceedToOTP = () => {
    if (!paymentMethod) {
      setError('Please select a payment method');
      return;
    }

    if (!validatePaymentDetails()) {
      return;
    }

    // Send OTP and move to step 2
    sendOTP();
  };

  const resendOTP = async () => {
    if (processing) return;
    
    setProcessing(true);
    setError('');
    
    try {
      const response = await fetch('/api/trainings/send-payment-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          email: registrationData.participantInfo.email,
          trainingId: id,
          amount: training.price || 'Free'
        })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setOtpTimer(300); // Reset timer
        setOtp(''); // Clear OTP input
        setError('');
        toast.success('Verification code resent!');
      } else {
        setError(data.message || 'Failed to resend verification code');
      }
    } catch (err) {
      console.error('Resend OTP error:', err);
      setError('Failed to resend verification code');
    } finally {
      setProcessing(false);
    }
  };

  const handlePaymentConfirmation = async () => {
    if (otp.length !== 6) {
      setError('Please enter the complete 6-digit verification code');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const response = await fetch('/api/trainings/verify-payment-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          trainingId: id,
          registrationData,
          paymentDetails: {
            method: paymentMethod,
            ...paymentDetails
          },
          otp,
          selectedSlot
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
        toast.success('Payment confirmed successfully!');
        
        // Navigate to success page after a short delay
        setTimeout(() => {
          navigate('/training-success', {
            state: {
              training,
              registrationData,
              paymentConfirmed: true,
              trainingLink: data.trainingLink
            }
          });
        }, 2000);
      } else {
        setError(data.message || 'Payment verification failed');
      }
    } catch (err) {
      console.error('Payment confirmation error:', err);
      setError('Payment verification failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  // Handle OTP input with proper validation for tests
  const handleOtpChange = (e) => {
    const value = e.target.value.replace(/\D/g, ''); // Only digits
    if (value.length <= 6) {
      setOtp(value);
      setError('');
    }
  };

  // Redirect if no data
  if (!registrationData || !training) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-6xl mb-4">⚠</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Session Expired</h2>
          <p className="text-gray-600 mb-4">Please restart the booking process</p>
          <button 
            onClick={() => navigate('/trainings')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Trainings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">      
      <div className="max-w-4xl mx-auto p-6 pt-24">
        {/* Back Button */}
        <button 
          onClick={() => navigate(`/training-booking/${id}`)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Booking
        </button>

        {success ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment Confirmed!</h2>
            <p className="text-gray-600 mb-4">
              Your registration has been successfully completed. The training link has been sent to your email.
            </p>
            <div className="animate-pulse text-sm text-gray-500">
              Redirecting to confirmation page...
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Payment Form */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {paymentStep === 1 && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Payment Details</h2>
                    
                    {/* Payment Method Selection */}
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-4">
                        Select Payment Method
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div
                          onClick={() => handlePaymentMethodSelect('card')}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            paymentMethod === 'card'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-center">
                            <CreditCard className="w-8 h-8 mx-auto mb-2 text-blue-600" />
                            <span className="text-sm font-medium">Credit/Debit Card</span>
                          </div>
                        </div>
                        
                        <div
                          onClick={() => handlePaymentMethodSelect('bank')}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            paymentMethod === 'bank'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-center">
                            <DollarSign className="w-8 h-8 mx-auto mb-2 text-green-600" />
                            <span className="text-sm font-medium">Bank Transfer</span>
                          </div>
                        </div>
                        
                        <div
                          onClick={() => handlePaymentMethodSelect('mobile')}
                          className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                            paymentMethod === 'mobile'
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-center">
                            <Phone className="w-8 h-8 mx-auto mb-2 text-purple-600" />
                            <span className="text-sm font-medium">Mobile Payment</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Payment Details Forms */}
                    {paymentMethod === 'card' && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Card Number
                          </label>
                          <input
                            type="text"
                            name="cardNumber"
                            value={paymentDetails.cardNumber}
                            onChange={handleInputChange}
                            placeholder="1234 5678 9012 3456"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Expiry Date
                            </label>
                            <input
                              type="text"
                              name="expiryDate"
                              value={paymentDetails.expiryDate}
                              onChange={handleInputChange}
                              placeholder="MM/YY"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              CVV
                            </label>
                            <input
                              type="text"
                              name="cvv"
                              value={paymentDetails.cvv}
                              onChange={handleInputChange}
                              placeholder="123"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Cardholder Name
                          </label>
                          <input
                            type="text"
                            name="cardholderName"
                            value={paymentDetails.cardholderName}
                            onChange={handleInputChange}
                            placeholder="John Doe"
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                      </div>
                    )}

                    {paymentMethod === 'bank' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Bank Account Number
                        </label>
                        <input
                          type="text"
                          name="bankAccount"
                          value={paymentDetails.bankAccount}
                          onChange={handleInputChange}
                          placeholder="Enter your account number"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {paymentMethod === 'mobile' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Mobile Number
                        </label>
                        <input
                          type="tel"
                          name="mobileNumber"
                          value={paymentDetails.mobileNumber}
                          onChange={handleInputChange}
                          placeholder="Enter your mobile number"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                      </div>
                    )}

                    {error && (
                      <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center">
                          <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                          <span className="text-sm text-red-700">{error}</span>
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end mt-6">
                      <button
                        onClick={handleProceedToOTP}
                        disabled={processing}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                      >
                        {processing ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send OTP
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

                {paymentStep === 2 && (
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-6">OTP Verification</h2>
                    
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Mail className="w-8 h-8 text-blue-600" />
                      </div>
                      <p className="text-gray-600 mb-2">
                        We've sent a 6-digit verification code to
                      </p>
                      <p className="font-medium text-gray-900">{registrationData.participantInfo.email}</p>
                    </div>

                    <div className="max-w-md mx-auto">
                      <label className="block text-sm font-medium text-gray-700 mb-2 text-center">
                        Enter OTP Code
                      </label>
                      <input
                        type="text"
                        value={otp}
                        onChange={handleOtpChange}
                        placeholder="000000"
                        className="w-full px-4 py-3 text-center text-xl font-mono border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        maxLength={6}
                      />

                      {otpTimer > 0 && (
                        <div className="text-center mt-4">
                          <div className="flex items-center justify-center text-sm text-gray-600">
                            <Clock className="w-4 h-4 mr-1" />
                            OTP expires in {formatTimer(otpTimer)}
                          </div>
                        </div>
                      )}

                      {otpTimer === 0 && (
                        <div className="text-center mt-4">
                          <button
                            onClick={resendOTP}
                            disabled={processing}
                            className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
                          >
                            {processing ? 'Sending...' : 'Resend OTP'}
                          </button>
                        </div>
                      )}

                      {error && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                          <div className="flex items-center">
                            <AlertCircle className="w-4 h-4 text-red-600 mr-2" />
                            <span className="text-sm text-red-700">{error}</span>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-center mt-6">
                        <button
                          onClick={handlePaymentConfirmation}
                          disabled={otp.length !== 6 || processing}
                          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
                        >
                          {processing ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Confirming...
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4 mr-2" />
                              Confirm Payment
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Order Summary Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-24">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
                
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 text-sm">{training.title}</h4>
                    <p className="text-xs text-gray-500 mt-1 capitalize">{training.trainingType} Training</p>
                  </div>

                  <div className="text-sm space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Participant:</span>
                      <span className="font-medium">{registrationData.participantInfo.name}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium text-xs">{registrationData.participantInfo.email}</span>
                    </div>

                    {selectedSlot && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Time Slot:</span>
                        <span className="font-medium text-xs">{selectedSlot}</span>
                      </div>
                    )}
                  </div>

                  <hr className="border-gray-200" />

                  <div className="flex items-center justify-between">
                    <span className="text-gray-900 font-semibold">Total Amount:</span>
                    <span className="text-2xl font-bold text-green-600">
                      {training.price || 'Free'}
                    </span>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-start">
                    <Shield className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-green-900">Secure Payment</h4>
                      <p className="text-xs text-green-700 mt-1">
                        Your payment is secured with 256-bit SSL encryption and OTP verification.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingPaymentPage;