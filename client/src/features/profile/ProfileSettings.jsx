import React, { useState, useEffect, useContext } from 'react';
import { User, Lock, FileText, Brain, Settings, Save, Eye, EyeOff, Download, Trash2, ChevronDown, ChevronUp, Star, TrendingUp, Target, Award, Upload, File, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { AppContext } from '../../app/AppContext';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AppShell from "../../components/AppShell";
import PrivacyTab from "./components/PrivacyTab";
import { PASSWORD_RULES, passwordProblems } from "../../lib/roles";

const PHONE_OK = (v) => /^[\d\s\-.()]+$/.test(String(v).trim()) && /^\d{10,15}$/.test(String(v).replace(/\D/g, ''));

const ProfileSettings = () => {
  const navigate = useNavigate();
  const { backendUrl, userData, getUserData, isLoggedin, setIsLoggedin, setUserData } = useContext(AppContext);

  const [activeTab, setActiveTab] = useState('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savedAnalyses, setSavedAnalyses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);

  // CV management
  const [cvData, setCvData] = useState(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [uploadingCV, setUploadingCV] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Local user state for editing
  const [localUser, setLocalUser] = useState(null);

  // Setup axios interceptor for authentication
  useEffect(() => {
    // Add request interceptor to include credentials
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        // Ensure credentials are included
        config.withCredentials = true;

        // Add token from localStorage if it exists
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor to handle auth errors
    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          // Clear auth state on 401
          setIsLoggedin(false);
          setUserData(null);
          localStorage.removeItem('token');

          // Only show toast if not already on login page
          if (window.location.pathname !== '/login') {
            toast.error('Please log in to continue');
            navigate('/login');
          }
        }
        return Promise.reject(error);
      }
    );

    // Cleanup interceptors on unmount
    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [setIsLoggedin, setUserData, navigate]);

  useEffect(() => {
    // Check if user is logged in
    if (!isLoggedin) {
      navigate('/login');
      return;
    }

    const initializeProfile = async () => {
      setPageLoading(true);
      try {
        // If no userData in context, fetch it
        if (!userData) {
          await getUserData();
        } else {
          setLocalUser({ ...userData });
        }

        // Fetch additional data
        await Promise.all([
          fetchSavedAnalyses(),
          fetchCurrentCV()
        ]);
      } catch (error) {
        console.error('Error initializing profile:', error);
        toast.error('Failed to load profile data');
      } finally {
        setPageLoading(false);
      }
    };

    initializeProfile();
  }, [isLoggedin, userData]);

  // Update local user when context userData changes
  useEffect(() => {
    if (userData) {
      setLocalUser({ ...userData });
    }
  }, [userData]);

  const fetchSavedAnalyses = async () => {
    try {
      const { data } = await axios.get(`${backendUrl}/api/user/saved-analyses`);

      if (data.success) {
        const analyses = data.data || [];

        // Transform the data to match what the UI expects
        const formattedAnalyses = analyses.map((analysis) => {
          const results = analysis.results || [];
          const softwareRoles = results.filter(r => !r.isNonTechRole);

          // Calculate average match percentage using actual field names from model
          const avgMatch = softwareRoles.length > 0
            ? Math.round(softwareRoles.reduce((sum, r) => sum + (r.matchPercentage || 0), 0) / softwareRoles.length)
            : 0;

          // Get the best matching job (highest percentage)
          const bestMatch = softwareRoles.length > 0
            ? softwareRoles.reduce((best, current) =>
                (current.matchPercentage || 0) > (best.matchPercentage || 0) ? current : best,
                { matchPercentage: 0 }
              )
            : { matchPercentage: 0 };

          // Extract job title and company from best match or use defaults
          let jobTitle = bestMatch.jobTitle || 'Software Engineering Position';
          let company = bestMatch.company || 'Company';

          // Combine all recommendations from the model structure
          const allRecommendations = [
            ...(bestMatch.contentRecommendations || []),
            ...(bestMatch.structureRecommendations || [])
          ].slice(0, 5);

          return {
            id: analysis._id,
            jobTitle,
            company,
            matchPercentage: avgMatch,
            totalJobs: results.length,
            softwareJobs: softwareRoles.length,
            createdAt: analysis.createdAt,
            updatedAt: analysis.updatedAt,
            strengths: bestMatch.strengths || [],
            recommendations: allRecommendations,
            hasMultipleJobs: results.length > 1,
            isSaved: analysis.isSaved !== false,
            // Store full analysis data for PDF generation
            fullAnalysis: analysis
          };
        });

        setSavedAnalyses(formattedAnalyses);
      } else {
        setSavedAnalyses([]);
      }
    } catch (error) {
      // 404: none saved yet, a normal state. 401 is handled by the interceptor.
      if (error.response?.status === 404) {
        setSavedAnalyses([]);
      } else if (error.response?.status !== 401) {
        console.error('Error fetching saved analyses:', error);
        toast.error('Failed to fetch saved analyses');
        setSavedAnalyses([]);
      }
    }
  };

  const fetchCurrentCV = async () => {
    try {
      setCvLoading(true);
      const { data } = await axios.get(`${backendUrl}/api/user/cv`);
      setCvData(data.success ? data.data : null);
    } catch (error) {
      // 404: no CV uploaded yet, a normal state. 401 is handled by the interceptor.
      if (error.response?.status === 404) {
        setCvData(null);
      } else if (error.response?.status !== 401) {
        console.error('Error fetching CV:', error);
        toast.error('Failed to fetch CV information');
      }
    } finally {
      setCvLoading(false);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Only PDF files are allowed');
        return;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB
        toast.error('File size must be less than 10MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadCV = async () => {
    if (!selectedFile) {
      toast.error('Please select a CV file first');
      return;
    }

    try {
      setUploadingCV(true);

      const formData = new FormData();
      formData.append('cv', selectedFile);

      const { data } = await axios.put(`${backendUrl}/api/user/upload-cv`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      if (data.success) {
        toast.success('CV uploaded successfully');
        setCvData(data.data);
        setSelectedFile(null);
        // Clear file input
        const fileInput = document.getElementById('cv-upload');
        if (fileInput) fileInput.value = '';

        // Refresh user data to update hasCV status
        await getUserData();
      } else {
        toast.error(data.message || 'Failed to upload CV');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to upload CV';
      toast.error(msg);
    } finally {
      setUploadingCV(false);
    }
  };

  const deleteCV = async () => {
    if (!window.confirm('Are you sure you want to delete your CV? This action cannot be undone.')) {
      return;
    }

    try {
      setCvLoading(true);

      const { data } = await axios.delete(`${backendUrl}/api/user/cv`);

      if (data.success) {
        toast.success('CV deleted successfully');
        setCvData(null);
        // Refresh user data to update hasCV status
        await getUserData();
      } else {
        toast.error(data.message || 'Failed to delete CV');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to delete CV';
      toast.error(msg);
    } finally {
      setCvLoading(false);
    }
  };

  const refreshCV = async () => {
    await fetchCurrentCV();
  };

  const updateProfile = async () => {
    const name = (localUser.name || '').trim();
    // Optional; an empty box clears it. Same rule as the server: 10 to 15 digits, separators ignored.
    const phone = (localUser.phoneNumber || '').trim();
    if (!name) {
      toast.error('Please enter your name');
      return;
    }
    if (phone && !PHONE_OK(phone)) {
      toast.error('Phone number must be 10 to 15 digits (numbers only)');
      return;
    }
    setLoading(true);
    try {
      const { data } = await axios.put(backendUrl + '/api/user/profile', {
        name,
        phoneNumber: phone
      });

      if (data.success) {
        // Update context with new data
        setUserData(data.data);
        toast.success('Profile updated successfully');
      } else {
        toast.error(data.message || 'Failed to update profile');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to update profile';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (passwords.newPassword !== passwords.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    const problems = passwordProblems(passwords.newPassword);
    if (problems.length) {
      toast.error('New password needs: ' + problems.join(', ').toLowerCase());
      return;
    }

    setLoading(true);
    try {
      const { data } = await axios.put(backendUrl + '/api/user/change-password', {
        currentPassword: passwords.currentPassword,
        newPassword: passwords.newPassword
      });

      if (data.success) {
        toast.success('Password updated successfully');
        setPasswords({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        toast.error(data.message || 'Failed to update password');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to update password';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await axios.post(backendUrl + '/api/auth/logout');
      setIsLoggedin(false);
      setUserData(null);
      localStorage.removeItem('token'); // Clear token
      navigate('/login');
      toast.success('Logged out successfully');
    } catch (error) {
      console.error('Logout error:', error);
      // Force logout even if request fails
      setIsLoggedin(false);
      setUserData(null);
      localStorage.removeItem('token'); // Clear token
      navigate('/login');
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Show loading spinner while page is loading
  if (pageLoading || !localUser) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="bg-surface p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <User className="mr-2" size={20} />
          Profile Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Name</label>
            <input
              type="text"
              value={localUser.name || ''}
              onChange={(e) => setLocalUser(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <div>
            <label htmlFor="ps-phone" className="block text-sm font-medium text-ink-2 mb-1">Phone Number (optional)</label>
            <input
              id="ps-phone"
              type="tel"
              inputMode="tel"
              value={localUser.phoneNumber || ''}
              onChange={(e) => setLocalUser(prev => ({ ...prev, phoneNumber: e.target.value }))}
              aria-describedby="ps-phone-hint"
              className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p id="ps-phone-hint" className={`mt-1 text-xs ${localUser.phoneNumber && !PHONE_OK(localUser.phoneNumber) ? 'text-danger-700' : 'text-ink-muted'}`}>
              10 to 15 digits. Leave empty to remove it.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Email</label>
            <input
              type="email"
              value={localUser.email || ''}
              disabled
              className="w-full p-2 border border-line rounded-xl bg-sand"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Account Status</label>
            <div className="flex items-center">
              <span className={`px-2 py-1 rounded-full text-xs ${localUser.isAccountVerified ? 'bg-success-100 text-success-700' : 'bg-danger-100 text-danger-700'}`}>
                {localUser.isAccountVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={updateProfile}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 flex items-center"
        >
          <Save className="mr-2" size={16} />
          {loading ? 'Updating...' : 'Update Profile'}
        </button>
      </div>
    </div>
  );

  const renderSecurityTab = () => (
    <div className="space-y-6">
      {/* Change Password */}
      <div className="bg-surface p-6 rounded-xl shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Lock className="mr-2" size={20} />
          Change Password
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwords.currentPassword}
                onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-ink-muted hover:text-ink-2"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
              aria-describedby="ps-pw-rules"
              className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <ul id="ps-pw-rules" className="mt-2 text-xs space-y-0.5">
              {PASSWORD_RULES.map((r) => (
                <li key={r.label} className={r.test(passwords.newPassword) ? 'text-success-700' : 'text-ink-muted'}>
                  {r.test(passwords.newPassword) ? '✓' : '-'} {r.label}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink-2 mb-1">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={loading}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </div>
      </div>
    </div>
  );

const renderCVTab = () => (
  <div className="space-y-6">
    {/* CV Upload/Management Section */}
    <div className="bg-surface p-6 rounded-xl shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <FileText className="mr-2" size={20} />
        CV Management
      </h3>

      {cvLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          <span className="ml-2 text-ink-2">Loading CV information...</span>
        </div>
      ) : cvData ? (
        // CV exists - show details and management options
        <div className="space-y-4">
          <div className="bg-success-50 border border-success-100 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle className="text-success-600" size={24} />
                <div>
                  <h4 className="text-lg font-medium text-success-700">CV Uploaded Successfully</h4>
                  <p className="text-sm text-success-600">Your CV is ready for analysis</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={refreshCV}
                  className="p-2 text-ink-2 hover:bg-sand rounded-xl"
                  title="Refresh CV Info"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-sand rounded-xl p-4">
              <h5 className="font-medium text-ink mb-3">CV Details</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-ink-2">File Name:</span>
                  <span className="font-medium">{cvData.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">File Size:</span>
                  <span className="font-medium">{formatFileSize(cvData.fileSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Uploaded:</span>
                  <span className="font-medium">
                    {new Date(cvData.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-ink-2">Status:</span>
                  <span className="font-medium text-success-600">
                    {cvData.hasText ? 'Ready for Analysis' : 'Processing...'}
                  </span>
                </div>
                {cvData.textLength && (
                  <div className="flex justify-between">
                    <span className="text-ink-2">Text Length:</span>
                    <span className="font-medium">{cvData.textLength} characters</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-primary-50 rounded-xl p-4">
              <h5 className="font-medium text-primary-800 mb-3">Quick Actions</h5>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/cv-analyzer')}
                  className="w-full px-4 py-2 bg-primary-600 text-white rounded-full hover:bg-primary-700 flex items-center justify-center"
                >
                  <Target className="mr-2" size={16} />
                  Analyze CV Against Jobs
                </button>
              </div>
            </div>
          </div>

          {/* Update/Replace CV Section */}
          <div className="border-t pt-4">
            <h5 className="font-medium text-ink mb-3">Update CV</h5>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="file"
                  id="cv-update"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {selectedFile && (
                  <p className="text-sm text-ink-2 mt-1">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={uploadCV}
                  disabled={!selectedFile || uploadingCV}
                  className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 flex items-center"
                >
                  {uploadingCV ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Upload className="mr-2" size={16} />
                  )}
                  {uploadingCV ? 'Uploading...' : 'Update CV'}
                </button>
                <button
                  onClick={deleteCV}
                  disabled={cvLoading}
                  className="px-4 py-2 bg-danger-600 text-white rounded-xl hover:bg-danger-700 disabled:opacity-50 flex items-center"
                >
                  <Trash2 className="mr-2" size={16} />
                  Delete CV
                </button>
              </div>
            </div>
            <p className="text-xs text-ink-muted mt-2">
              Updating will replace your current CV. Only PDF files are supported. Maximum file size: 10MB
            </p>
          </div>
        </div>
      ) : (
        // No CV uploaded - show upload form
        <div className="text-center py-8">
          <div className="bg-primary-50 border-2 border-dashed border-primary-200 rounded-xl p-8">
            <File className="mx-auto h-16 w-16 text-primary-400 mb-4" />
            <h4 className="text-lg font-medium text-ink mb-2">No CV Uploaded</h4>
            <p className="text-ink-2 mb-6">Upload your CV to start analyzing it against job descriptions</p>

            <div className="max-w-md mx-auto">
              <input
                type="file"
                id="cv-upload"
                accept=".pdf"
                onChange={handleFileSelect}
                className="w-full p-2 border border-line rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent mb-4"
              />
              {selectedFile && (
                <p className="text-sm text-ink-2 mb-4">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
              <button
                onClick={uploadCV}
                disabled={!selectedFile || uploadingCV}
                className="w-full px-6 py-3 bg-primary-600 text-white rounded-full hover:bg-primary-700 disabled:opacity-50 flex items-center justify-center"
              >
                {uploadingCV ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : (
                  <Upload className="mr-2" size={20} />
                )}
                {uploadingCV ? 'Uploading CV...' : 'Upload CV'}
              </button>
              <p className="text-xs text-ink-muted mt-2">
                Only PDF files are supported. Maximum file size: 10MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* CV Usage Information */}
    <div className="bg-primary-50 border border-primary-200 rounded-xl p-6">
      <h4 className="text-lg font-semibold text-primary-800 mb-3">How Your CV is Used</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="bg-surface rounded-xl p-4 shadow-sm">
          <h5 className="font-medium text-ink mb-2">CV Analyzer</h5>
          <p className="text-ink-2">Your CV text is compared against job descriptions to identify matches, gaps, and improvement opportunities.</p>
        </div>
      </div>
      <div className="mt-4 p-3 bg-primary-100 rounded-xl">
        <p className="text-xs text-primary-800">
          <strong>Privacy:</strong> Your CV data is stored securely and only used for analysis purposes.
          You can delete your CV at any time, and it will be permanently removed from our servers.
        </p>
      </div>
    </div>
  </div>
);

  const renderSettingsTab = () => (
    <div className="bg-surface p-6 rounded-xl shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Settings className="mr-2" size={20} />
        Account Settings
      </h3>

      <div className="space-y-6">
        <div className="border border-line rounded-xl p-4">
          <h4 className="font-medium text-ink mb-2">Account Actions</h4>
          <p className="text-sm text-ink-2 mb-4">Manage your account access and session.</p>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700"
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'cv', label: 'CV Management', icon: FileText },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'privacy', label: 'Privacy & data', icon: Lock }
  ];

  return (
    <AppShell title="Profile settings" subtitle="Manage your profile, CV and privacy.">
    <div>
      <div>
        {/* Header */}
        <div className="bg-surface rounded-xl shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center text-white text-2xl font-semibold">
                {localUser.name ? localUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U'}
              </div>
              <div>
                <h2 className="font-display text-2xl font-semibold text-ink">{localUser.name}</h2>
                <p className="text-ink-2">{localUser.email}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    cvData ? 'bg-success-100 text-success-700' : 'bg-sun-100 text-sun-700'
                  }`}>
                    {cvData ? 'CV Uploaded ✓' : 'No CV'}
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex space-x-2">
              {cvData ? (
                <>
                  <button
                    onClick={() => navigate('/cv-analyzer')}
                    className="px-3 py-2 text-sm bg-primary-600 text-white rounded-xl hover:bg-primary-700"
                  >
                    CV Analyzer
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setActiveTab('cv')}
                  className="px-3 py-2 text-sm bg-sun-600 text-white rounded-xl hover:bg-sun-700 flex items-center"
                >
                  <Upload className="mr-1" size={16} />
                  Upload CV
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <div className="lg:col-span-1">
            <nav className="bg-surface rounded-xl shadow p-4">
              <ul className="space-y-2">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <li key={tab.id}>
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-4 py-2.5 rounded-full flex items-center space-x-3 transition-colors ${
                          activeTab === tab.id
                            ? 'bg-primary-100 text-primary-800 font-semibold'
                            : 'text-ink-2 hover:bg-sand'
                        }`}
                      >
                        <Icon size={18} />
                        <span>{tab.label}</span>
                        {tab.id === 'cv' && !cvData && (
                          <AlertCircle className="text-sun-500" size={14} />
                        )}
                        {tab.id === 'cv' && savedAnalyses.length > 0 && (
                          <span className="bg-primary-100 text-primary-800 text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {savedAnalyses.length}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>


          {/* Main Content */}
          <div className="lg:col-span-3">
            {activeTab === 'profile' && renderProfileTab()}
            {activeTab === 'cv' && renderCVTab()}
            {activeTab === 'security' && renderSecurityTab()}
            {activeTab === 'settings' && renderSettingsTab()}
            {activeTab === 'privacy' && <PrivacyTab />}
          </div>
        </div>
      </div>
    </div>
  </AppShell>
  );
};

export default ProfileSettings;