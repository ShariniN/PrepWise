import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CheckCircle, Calendar, Clock, Mail, ExternalLink, 
  Download, ArrowRight, Home, BookOpen
} from 'lucide-react';
import NavBar from "../components/NavBar";

const TrainingSuccessPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  const { training, registrationData, paymentConfirmed } = location.state || {};

  useEffect(() => {
    // Redirect if no data
    if (!training || !registrationData || !paymentConfirmed) {
      navigate('/trainings');
    }
  }, [training, registrationData, paymentConfirmed, navigate]);

  const handleDownloadReceipt = () => {
    // Generate and download receipt
    const receiptData = {
      confirmationCode: `TRN${Date.now()}`,
      training: training.title,
      participant: registrationData.participantInfo.name,
      email: registrationData.participantInfo.email,
      amount: training.price || 'Free',
      date: new Date().toLocaleDateString()
    };

    const receiptContent = `
TRAINING REGISTRATION RECEIPT
============================

Confirmation Code: ${receiptData.confirmationCode}
Date: ${receiptData.date}

PARTICIPANT DETAILS:
Name: ${receiptData.participant}
Email: ${receiptData.email}

TRAINING DETAILS:
Training: ${receiptData.training}
Type: ${training.trainingType}
${training.startDate ? `Date: ${new Date(training.startDate).toLocaleDateString()}` : ''}
${training.duration ? `Duration: ${training.duration}` : ''}
Amount Paid: ${receiptData.amount}

Thank you for your registration!
`;

    const blob = new Blob([receiptContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-receipt-${receiptData.confirmationCode}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Redirect if no data
  if (!training || !registrationData || !paymentConfirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white">
        <NavBar />
        <div className="flex items-center justify-center h-96 pt-24">
          <div className="text-center">
            <div className="text-red-500 text-6xl mb-4">⚠</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Invalid Access</h2>
            <p className="text-gray-600 mb-4">No registration data found</p>
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-white">
      <NavBar />
      
      <div className="max-w-4xl mx-auto p-6 pt-24">
        {/* Success Header */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-12 h-12 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Registration Successful!</h1>
          <p className="text-lg text-gray-600">
            Your training registration has been confirmed and payment processed successfully.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Registration Details */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Registration Details</h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Confirmation Code:</span>
                <span className="font-mono font-bold text-green-600">TRN{Date.now().toString().slice(-8)}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Participant:</span>
                <span className="font-medium">{registrationData.participantInfo.name}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Email:</span>
                <span className="font-medium text-sm">{registrationData.participantInfo.email}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Contact:</span>
                <span className="font-medium">{registrationData.participantInfo.contact}</span>
              </div>
              
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Affiliation:</span>
                <span className="font-medium capitalize">{registrationData.participantInfo.affiliation}</span>
              </div>

              {registrationData.selectedSlot && (
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Selected Slot:</span>
                  <span className="font-medium text-sm">{registrationData.selectedSlot}</span>
                </div>
              )}
              
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-600">Registration Date:</span>
                <span className="font-medium">{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* Training Information */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Training Information</h2>
            
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg text-gray-900">{training.title}</h3>
                <p className="text-sm text-gray-600 capitalize">{training.trainingType} Training</p>
              </div>

              {training.trainingCategory && (
                <div className="flex items-center text-sm">
                  <BookOpen className="w-4 h-4 mr-2 text-blue-500" />
                  <span className="text-gray-600">Category:</span>
                  <span className="ml-1 font-medium">{training.trainingCategory}</span>
                </div>
              )}

              {training.startDate && (
                <div className="flex items-center text-sm">
                  <Calendar className="w-4 h-4 mr-2 text-green-500" />
                  <span className="text-gray-600">Start Date:</span>
                  <span className="ml-1 font-medium">{new Date(training.startDate).toLocaleDateString()}</span>
                </div>
              )}

              {training.duration && (
                <div className="flex items-center text-sm">
                  <Clock className="w-4 h-4 mr-2 text-purple-500" />
                  <span className="text-gray-600">Duration:</span>
                  <span className="ml-1 font-medium">{training.duration}</span>
                </div>
              )}

              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-green-900 mb-2">Amount Paid</h4>
                <span className="text-2xl font-bold text-green-600">
                  {training.price || 'Free'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Important Information */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-4">Important Information</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-start mb-3">
                <Mail className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Training Link Sent</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    The virtual training link has been sent to your registered email address.
                  </p>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-start mb-3">
                <Clock className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-900">Join Instructions</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Please join the training session 5 minutes before the scheduled time.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> If you don't receive the training link within 15 minutes, 
              please check your spam folder or contact support.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleDownloadReceipt}
            className="flex items-center justify-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4 mr-2" />
            Download Receipt
          </button>
          
          <button
            onClick={() => navigate('/user/my-registrations')}
            className="flex items-center justify-center px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <BookOpen className="w-4 h-4 mr-2" />
            My Registrations
          </button>
          
          <button
            onClick={() => navigate('/trainings')}
            className="flex items-center justify-center px-6 py-3 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
          >
            <ArrowRight className="w-4 h-4 mr-2" />
            Browse More Trainings
          </button>
          
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Home className="w-4 h-4 mr-2" />
            Go to Dashboard
          </button>
        </div>

        {/* Contact Information */}
        <div className="mt-12 text-center p-6 bg-gray-50 rounded-xl">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-gray-600 mb-4">
            If you have any questions about your training or need support, please contact us.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center text-sm">
            <span className="text-gray-600">
              Email: <a href="mailto:support@trainingplatform.com" className="text-blue-600 hover:underline">support@trainingplatform.com</a>
            </span>
            <span className="text-gray-600">
              Phone: <a href="tel:+1234567890" className="text-blue-600 hover:underline">+123 456 7890</a>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TrainingSuccessPage;