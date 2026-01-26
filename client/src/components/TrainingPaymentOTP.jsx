// TrainingPaymentOTP.jsx
import React, { useState, useContext, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AppContext } from '../context/AppContext';
import { toast } from 'react-toastify';
import axios from 'axios';
import { ArrowLeft, Mail, Clock, Shield, Send } from 'lucide-react';

const TrainingPaymentOTP = () => {
  // Ensure credentials are included in requests
  axios.defaults.withCredentials = true;

  const { backendUrl } = useContext(AppContext);
  const navigate = useNavigate();
  const location = useLocation();

  // Get data from payment page
  const { 
    registrationData, 
    training, 
    selectedSlot, 
    paymentDetails 
  } = location.state || {};

  // States
  const [otp, setOtp] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [otpTimer, setOtpTimer] = useState(300); // 5 minutes
  const [canResend, setCanResend] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Refs for OTP inputs
  const inputRefs = useRef([]);

  // Redirect if no data
//   useEffect(() => {
//     if (!registrationData || !training || !paymentDetails) {
//       toast.error('Session expired. Please restart the payment process.');
//       navigate('/trainings');
//     }
//   }, [registrationData, training, paymentDetails, navigate]);

 // Add debug logs
  useEffect(() => {
    console.log('TrainingPaymentOTP mounted with location.state:', location.state);
    console.log('registrationData:', registrationData);
    console.log('training:', training);
    console.log('paymentDetails:', paymentDetails);
  }, []);

  // Timer countdown
  useEffect(() => {
    if (otpTimer > 0) {
      const timer = setTimeout(() => setOtpTimer(otpTimer - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setCanResend(true);
    }
  }, [otpTimer]);

  // Auto-focus next input
  const handleInput = (e, index) => {
    const value = e.target.value;
    if (value.length > 0 && index < inputRefs.current.length - 1) {
      inputRefs.current[index + 1].focus();
    }
  };

  // Handle backspace
  const handleKeyDown = (e, index) => {
    if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
      inputRefs.current[index - 1].focus();
    }
  };

  // Handle paste
  const handlePaste = (e, index) => {
    e.preventDefault();
    const paste = e.clipboardData.getData('text').replace(/\D/g, '');
    const pasteArray = paste.split('').slice(0, 6);
    
    pasteArray.forEach((char, i) => {
      if (inputRefs.current[i]) {
        inputRefs.current[i].value = char;
      }
    });
    
    // Focus on the next empty input or last input
    const nextIndex = Math.min(pasteArray.length, 5);
    inputRefs.current[nextIndex]?.focus();
  };

  // Format timer
  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Submit OTP verification
  const handleSubmitOTP = async (e) => {
    e.preventDefault();
    
    // Collect OTP from inputs
    const otpArray = inputRefs.current.map(input => input.value || '');
    const otpString = otpArray.join('');

    if (otpString.length !== 6) {
      toast.error('Please enter complete 6-digit OTP');
      return;
    }

    setIsSubmitting(true);
    
    try {
      const response = await axios.post(`${backendUrl}/api/trainings/verify-payment-otp`, {
        trainingId: training._id,
        registrationData,
        paymentDetails,
        otp: otpString,
        selectedSlot
      });

      const { data } = response;

      if (data.success) {
        toast.success('Payment confirmed successfully!');
        
        // Navigate to success page
        navigate('/training-success', {
          state: {
            training,
            registrationData,
            paymentConfirmed: true,
            trainingLink: data.trainingLink
          }
        });
      } else {
        toast.error(data.message || 'OTP verification failed');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      toast.error(error.response?.data?.message || 'Verification failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Resend OTP
  const handleResendOTP = async () => {
    if (!canResend || isResending) return;

    setIsResending(true);
    
    try {
      const response = await axios.post(`${backendUrl}/api/trainings/send-payment-otp`, {
        email: registrationData.participantInfo.email,
        trainingId: training._id,
        amount: training.price || 'Free'
      });

      const { data } = response;

      if (data.success) {
        toast.success('OTP sent successfully!');
        setOtpTimer(300); // Reset timer
        setCanResend(false);
        
        // Clear existing OTP inputs
        inputRefs.current.forEach(input => {
          if (input) input.value = '';
        });
        inputRefs.current[0]?.focus();
      } else {
        toast.error(data.message || 'Failed to resend OTP');
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast.error(error.response?.data?.message || 'Failed to resend OTP');
    } finally {
      setIsResending(false);
    }
  };

  // Don't render if no data
  if (!registrationData || !training) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Back Button */}
        <button 
          onClick={() => navigate(-1)}
          className="flex items-center text-gray-600 hover:text-gray-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Payment
        </button>

        {/* Main Form */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Mail className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              Payment Verification
            </h1>
            <p className="text-gray-600 mb-2">
              Enter the 6-digit OTP sent to
            </p>
            <p className="font-semibold text-gray-900">
              {registrationData.participantInfo.email}
            </p>
          </div>

          {/* OTP Form */}
          <form onSubmit={handleSubmitOTP}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-4 text-center">
                Enter Verification Code
              </label>
              <div className="flex justify-center space-x-3" onPaste={(e) => handlePaste(e, 0)}>
                {Array(6).fill(0).map((_, index) => (
                  <input
                    key={index}
                    type="text"
                    className="w-12 h-12 text-center text-xl font-bold border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    maxLength="1"
                    required
                    ref={el => inputRefs.current[index] = el}
                    onInput={(e) => handleInput(e, index)}
                    onKeyDown={(e) => handleKeyDown(e, index)}
                  />
                ))}
              </div>
            </div>

            {/* Timer */}
            {otpTimer > 0 && (
              <div className="text-center mb-6">
                <div className="flex items-center justify-center text-sm text-gray-600">
                  <Clock className="w-4 h-4 mr-2" />
                  OTP expires in {formatTimer(otpTimer)}
                </div>
              </div>
            )}

            {/* Resend OTP */}
            {canResend && (
              <div className="text-center mb-6">
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={isResending}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium disabled:opacity-50"
                >
                  {isResending ? 'Sending...' : 'Resend OTP'}
                </button>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Verifying...
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4 mr-2" />
                  Confirm Payment
                </>
              )}
            </button>
          </form>

          {/* Training Info */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Training Details:</h3>
            <div className="text-sm text-gray-600 space-y-1">
              <p><strong>Title:</strong> {training.title}</p>
              <p><strong>Type:</strong> {training.trainingType}</p>
              {selectedSlot && (
                <p><strong>Time Slot:</strong> {selectedSlot}</p>
              )}
              <p><strong>Amount:</strong> {training.price || 'Free'}</p>
            </div>
          </div>

          {/* Security Note */}
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start">
              <Shield className="w-5 h-5 text-green-600 mr-2 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-green-900">Secure Payment</h4>
                <p className="text-xs text-green-700 mt-1">
                  Your payment is secured with OTP verification and encrypted data transmission.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingPaymentOTP;