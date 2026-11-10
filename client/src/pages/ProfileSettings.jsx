// UserProfile.jsx - Enhanced version with CV management and reorganized tabs
import React, { useState, useEffect, useContext } from 'react';
import { User, Mail, Lock, FileText, Brain, Settings, Save, Eye, EyeOff, Download, Trash2, ChevronDown, ChevronUp, Star, TrendingUp, Target, Award, Upload, File, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AppShell from "../components/AppShell";
import PrivacyTab from "../components/PrivacyTab";
import { PASSWORD_RULES, passwordProblems } from "../utils/roles";

const PHONE_OK = (v) => /^[\d\s\-.()]+$/.test(String(v).trim()) && /^\d{10,15}$/.test(String(v).replace(/\D/g, ''));

const UserProfile = () => {
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
  const [skillsAssessments, setSkillsAssessments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [expandedAnalysis, setExpandedAnalysis] = useState(null);
  const [expandedAssessment, setExpandedAssessment] = useState(null);
  const [downloadingAnalysis, setDownloadingAnalysis] = useState(null);

  // NEW: CV Management State
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
          fetchSkillsAssessments(),
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
      console.log('🔍 Fetching saved analyses from:', `${backendUrl}/api/user/saved-analyses`);
      
      const { data } = await axios.get(`${backendUrl}/api/user/saved-analyses`);
      
      console.log('📊 Raw response data:', data);
      
      if (data.success) {
        const analyses = data.data || [];
        console.log('📊 Analyses count:', analyses.length);
        
        // Transform the data to match what the UI expects
        const formattedAnalyses = analyses.map((analysis) => {
          console.log('📊 Processing analysis:', {
            id: analysis._id,
            results: analysis.results?.length || 0,
            jobDescriptions: analysis.jobDescriptions?.length || 0,
            createdAt: analysis.createdAt
          });
          
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

          const formatted = {
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
          
          console.log(`📊 Formatted analysis:`, formatted);
          return formatted;
        });
        
        console.log('📊 Final formatted analyses:', formattedAnalyses);
        setSavedAnalyses(formattedAnalyses);
      } else {
        console.log('❌ API returned success: false', data.message);
        setSavedAnalyses([]);
      }
    } catch (error) {
      console.error('❌ Error fetching saved analyses:', error);
      
      if (error.response?.status === 404) {
        console.log('📊 No saved analyses found (404)');
        setSavedAnalyses([]);
      } else if (error.response?.status !== 401) {
        toast.error('Failed to fetch saved analyses');
        setSavedAnalyses([]);
      }
    }
  };

  const fetchSkillsAssessments = async () => {
    try {
      console.log('🧠 Fetching skills assessments from:', `${backendUrl}/api/user/skills-assessments`);
      
      const { data } = await axios.get(`${backendUrl}/api/user/skills-assessments`);
      
      console.log('🧠 Raw skills response:', data);
      
      if (data.success) {
        const assessments = data.data || [];
        console.log('🧠 Assessments count:', assessments.length);
        
        // Transform the data to match what your UI expects
        const formattedAssessments = assessments.map((assessment) => {
          console.log('🧠 Processing assessment:', {
            id: assessment._id,
            skills: assessment.skills?.length || 0,
            assessmentType: assessment.assessmentType,
            overallScore: assessment.overallScore
          });
          
          // Your model uses 'skills' array with 'proficiencyLevel' field
          const skills = assessment.skills || [];
          
          // Calculate overall metrics
          const totalTechnologies = skills.length;
          const avgConfidence = totalTechnologies > 0 
            ? skills.reduce((sum, skill) => sum + (skill.proficiencyLevel || 0), 0) / totalTechnologies
            : 0;
          
          // Count by proficiency levels based on model structure
          const expertCount = skills.filter(s => (s.proficiencyLevel || 0) >= 8).length;
          const proficientCount = skills.filter(s => {
            const level = s.proficiencyLevel || 0;
            return level >= 6 && level < 8;
          }).length;
          const learningCount = skills.filter(s => (s.proficiencyLevel || 0) < 6).length;

          const score = assessment.overallScore || Math.round((avgConfidence / 10) * 100);
          let assessmentType = assessment.assessmentType || 'SWOT Analysis';
          
          let level = 'Beginner';
          if (avgConfidence >= 8) level = 'Expert';
          else if (avgConfidence >= 6) level = 'Advanced';
          else if (avgConfidence >= 4) level = 'Intermediate';

          const formatted = {
            id: assessment._id,
            assessmentType,
            level,
            score,
            totalTechnologies,
            averageConfidence: avgConfidence,
            expertCount,
            proficientCount,
            learningCount,
            completedAt: assessment.completedAt || assessment.updatedAt,
            createdAt: assessment.createdAt,
            topTechnologies: skills
              .sort((a, b) => (b.proficiencyLevel || 0) - (a.proficiencyLevel || 0))
              .slice(0, 10)
              .map(skill => ({ 
                name: skill.name, 
                confidence: skill.proficiencyLevel || 0,
                category: skill.category || 'General'
              })),
            isRecent: assessment.isRecent || false,
            isSaved: assessment.isSaved !== false,
            overallScore: score,
            strengths: assessment.strengths || [],
            weaknesses: assessment.weaknesses || [],
            opportunities: assessment.opportunities || [],
            threats: assessment.threats || [],
            recommendations: assessment.recommendations || []
          };
          
          console.log(`🧠 Formatted assessment:`, formatted);
          return formatted;
        });
        
        console.log('🧠 Final formatted assessments:', formattedAssessments);
        setSkillsAssessments(formattedAssessments);
      } else {
        console.log('❌ Skills API returned success: false', data.message);
        setSkillsAssessments([]);
      }
    } catch (error) {
      console.error('❌ Error fetching skills assessments:', error);
      
      if (error.response?.status === 404) {
        console.log('🧠 No assessments found (404)');
        setSkillsAssessments([]);
      } else if (error.response?.status !== 401) {
        // Don't show error for 401 as it's handled by interceptor
        toast.error('Failed to fetch skills assessments');
        setSkillsAssessments([]);
      }
    }
  };

  // NEW: CV Management Functions
  const fetchCurrentCV = async () => {
    try {
      setCvLoading(true);
      console.log('📄 Fetching current CV from:', `${backendUrl}/api/user/cv`);
      
      const { data } = await axios.get(`${backendUrl}/api/user/cv`);
      
      if (data.success) {
        setCvData(data.data);
        console.log('📄 CV data loaded:', data.data);
      } else {
        setCvData(null);
        console.log('📄 No CV found:', data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching CV:', error);
      if (error.response?.status === 404) {
        setCvData(null); // No CV uploaded yet
      } else if (error.response?.status !== 401) {
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

      console.log('📄 Uploading CV:', selectedFile.name);
      
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
      console.error('❌ CV upload error:', error);
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
      console.error('❌ CV delete error:', error);
      const msg = error.response?.data?.message || error.message || 'Failed to delete CV';
      toast.error(msg);
    } finally {
      setCvLoading(false);
    }
  };

  const refreshCV = async () => {
    await fetchCurrentCV();
  };

  // PDF Generation Functions (keeping existing code)
  const generateAnalysisPDF = (analysis) => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      console.error('jsPDF library not loaded');
      toast.error('PDF library not available. Please refresh the page and try again.');
      return;
    }

    const doc = new jsPDF();
    let yPos = 20;

    // Premium Header with Logo Space
    doc.setFillColor(40, 116, 166);
    doc.rect(0, 0, 210, 30, 'F');
    
    doc.setTextColor(255);
    doc.setFontSize(24);
    doc.text('CV Analysis Report', 20, 20);
    
    doc.setFontSize(12);
    doc.text('Detailed Analysis', 20, 25);
    yPos = 45;

    // Professional Analysis Summary Box
    doc.setFillColor(245, 248, 251);
    doc.rect(15, yPos - 5, 180, 35, 'F');
    doc.setLineWidth(0.5);
    doc.setDrawColor(40, 116, 166);
    doc.rect(15, yPos - 5, 180, 35);

    doc.setTextColor(0);
    doc.setFontSize(16);
    doc.text('Analysis Summary', 20, yPos + 5);

    doc.setFontSize(12);
    doc.text(`Position: ${analysis.jobTitle}`, 20, yPos + 15);
    doc.text(`Company: ${analysis.company}`, 20, yPos + 22);
    doc.text(`Overall Match: ${analysis.matchPercentage}%`, 120, yPos + 15);
    doc.text(`Analysis Date: ${new Date(analysis.createdAt).toLocaleDateString()}`, 120, yPos + 22);
    yPos += 50;

    // Enhanced Match Score with Color Coding
    doc.setFontSize(14);
    doc.text('Match Score Analysis:', 20, yPos);
    yPos += 10;

    // Professional progress bar with gradient effect
    const barWidth = 150;
    const barHeight = 15;
    const fillWidth = (analysis.matchPercentage / 100) * barWidth;

    // Background
    doc.setFillColor(230, 230, 230);
    doc.rect(20, yPos, barWidth, barHeight, 'F');

    // Fill color based on score
    if (analysis.matchPercentage >= 80) {
      doc.setFillColor(34, 197, 94); // Green
    } else if (analysis.matchPercentage >= 60) {
      doc.setFillColor(59, 130, 246); // Blue
    } else if (analysis.matchPercentage >= 40) {
      doc.setFillColor(251, 191, 36); // Yellow
    } else {
      doc.setFillColor(239, 68, 68); // Red
    }
    
    doc.rect(20, yPos, fillWidth, barHeight, 'F');
    
    // Score text
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`${analysis.matchPercentage}%`, 175, yPos + 10);
    yPos += 25;

    // Multiple Jobs Analysis (Premium Feature)
    if (analysis.hasMultipleJobs) {
      doc.setFontSize(14);
      doc.text(`Multi-Job Analysis Results (${analysis.totalJobs} positions analyzed):`, 20, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.text(`• Software Engineering Roles: ${analysis.softwareJobs}`, 25, yPos);
      yPos += 6;
      doc.text(`• Average Match Score: ${analysis.matchPercentage}%`, 25, yPos);
      yPos += 6;
      doc.text(`• Best Match: ${analysis.jobTitle} at ${analysis.company}`, 25, yPos);
      yPos += 15;
    }

    // Complete Strengths Section
    if (analysis.strengths && analysis.strengths.length > 0) {
      doc.setFontSize(14);
      doc.setTextColor(34, 197, 94);
      doc.text('✓ Key Strengths & Qualifications:', 20, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(0);
      analysis.strengths.forEach((strength, index) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        const lines = doc.splitTextToSize(`${index + 1}. ${strength}`, 170);
        lines.forEach(line => {
          doc.text(line, 25, yPos);
          yPos += 6;
        });
        yPos += 2;
      });
      yPos += 10;
    }

    // Complete Recommendations Section
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(14);
      doc.setTextColor(239, 68, 68);
      doc.text('⚠ Areas for Improvement:', 20, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(0);
      analysis.recommendations.forEach((rec, index) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        const lines = doc.splitTextToSize(`${index + 1}. ${rec}`, 170);
        lines.forEach(line => {
          doc.text(line, 25, yPos);
          yPos += 6;
        });
        yPos += 2;
      });
      yPos += 15;
    }

    // Premium Insights Section
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(14);
    doc.setTextColor(40, 116, 166);
    doc.text('🎯 Insights & Recommendations:', 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setTextColor(0);

    const premiumInsights = [
      `Your CV shows a ${analysis.matchPercentage}% compatibility with this role.`,
      'Focus on highlighting the strengths mentioned above in your application.',
      'Address the improvement areas to increase your match score.',
      analysis.hasMultipleJobs ? 
        `Out of ${analysis.totalJobs} positions analyzed, ${analysis.softwareJobs} are software roles.` :
        'Consider analyzing your CV against multiple similar positions for better insights.',
      'Tailor your CV keywords to better match the job requirements.',
      'Consider preparing specific examples that demonstrate your key strengths.'
    ];

    premiumInsights.forEach((insight, index) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      
      const lines = doc.splitTextToSize(`• ${insight}`, 170);
      lines.forEach(line => {
        doc.text(line, 25, yPos);
        yPos += 6;
      });
    });

    // Professional Footer
    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setTextColor(40, 116, 166);
    doc.text('About This Analysis', 20, yPos);
    yPos += 15;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const aboutText = [
      'This comprehensive CV analysis was generated using advanced AI algorithms that compare your',
      'resume content against specific job requirements. The analysis includes:',
      '',
      '• Keyword matching and relevance scoring',
      '• Skills gap identification',
      '• Content optimization recommendations',
      '• Structure and formatting suggestions',
      '',
      'For best results, ensure your CV is updated with your latest experience and achievements.',
      'Consider conducting regular analyses as you apply to different positions.',
      '',
      'This report is confidential and intended solely for the recipient\'s use in job applications.'
    ];

    aboutText.forEach(line => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }
      doc.text(line, 20, yPos);
      yPos += 6;
    });

    // Premium Footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Generated by PrepWise - CV Analysis', 20, 285);
    doc.text(`Report ID: ${analysis.id.slice(-8)} | ${new Date().toLocaleDateString()}`, 140, 285);

    return doc;
  };

  const downloadAnalysis = async (analysisId) => {
    try {
      setDownloadingAnalysis(analysisId);
      
      // Find the analysis data
      const analysis = savedAnalyses.find(a => a.id === analysisId);
      if (!analysis) {
        toast.error('Analysis data not found');
        return;
      }

      // Check if jsPDF is available (load it if not)
      if (!window.jspdf) {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        script.onload = () => {
          generateAndDownloadPDF(analysis);
        };
        script.onerror = () => {
          toast.error('Failed to load PDF library');
          setDownloadingAnalysis(null);
        };
        document.head.appendChild(script);
      } else {
        generateAndDownloadPDF(analysis);
      }
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Failed to generate PDF report');
      setDownloadingAnalysis(null);
    }
  };

  const generateAndDownloadPDF = (analysis) => {
    try {
      const doc = generateAnalysisPDF(analysis);
      
      if (doc) {
        const fileName = `CV_Analysis_${analysis.jobTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${analysis.id.slice(-6)}.pdf`;
        doc.save(fileName);
        
        toast.success('PDF report downloaded successfully!');
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingAnalysis(null);
    }
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

  const deleteAnalysis = async (id) => {
    if (!window.confirm('Are you sure you want to delete this CV analysis?')) {
      return;
    }

    try {
      const { data } = await axios.delete(`${backendUrl}/api/user/analysis/${id}`);

      if (data.success) {
        setSavedAnalyses(prev => prev.filter(analysis => analysis.id !== id));
        toast.success('Analysis deleted successfully');
      } else {
        toast.error(data.message || 'Failed to delete analysis');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to delete analysis';
      toast.error(msg);
    }
  };

  const deleteAssessment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this skills assessment?')) {
      return;
    }

    try {
      const { data } = await axios.delete(`${backendUrl}/api/user/assessment/${id}`);

      if (data.success) {
        setSkillsAssessments(prev => prev.filter(assessment => assessment.id !== id));
        toast.success('Assessment deleted successfully');
      } else {
        toast.error(data.message || 'Failed to delete assessment');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to delete assessment';
      toast.error(msg);
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

  const getMatchScoreColor = (percentage) => {
    if (percentage >= 80) return 'text-success-700 bg-success-100';
    if (percentage >= 60) return 'text-sun-700 bg-sun-100';
    if (percentage >= 40) return 'text-sun-700 bg-sun-100';
    return 'text-danger-700 bg-danger-100';
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-success-700 bg-success-100';
    if (score >= 70) return 'text-primary-800 bg-primary-100';
    if (score >= 50) return 'text-sun-700 bg-sun-100';
    return 'text-danger-700 bg-danger-100';
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

  // NEW: CV Management Tab
  // Simplified CV Management Tab - Replace the renderCVTab() function in your UserProfile.jsx
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
                <button
                  onClick={() => navigate('/swot')}
                  className="w-full px-4 py-2 bg-success-600 text-white rounded-full hover:bg-success-700 flex items-center justify-center"
                >
                  <Brain className="mr-2" size={16} />
                  Skills Assessment
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
        <div className="bg-surface rounded-xl p-4 shadow-sm">
          <h5 className="font-medium text-ink mb-2">Skills Assessment</h5>
          <p className="text-ink-2">The system extracts your skills and experience to provide personalized technology proficiency assessments.</p>
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

  const renderSkillsTab = () => (
    <div className="bg-surface p-6 rounded-xl shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Brain className="mr-2" size={20} />
        Skills Assessment Results ({skillsAssessments.length})
      </h3>
      {skillsAssessments.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="mx-auto h-12 w-12 text-ink-muted mb-4" />
          <p className="text-ink-2 mb-2">No skills assessments completed yet.</p>
          <p className="text-sm text-ink-muted">Complete a SWOT analysis to see your technology proficiency results here.</p>
          <button 
            onClick={() => navigate('/swot')}
            className="mt-3 px-4 py-2 bg-success-600 text-white rounded-full hover:bg-success-700"
          >
            Start Skills Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {skillsAssessments.map((assessment) => (
            <div key={assessment.id} className="border border-line rounded-xl">
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-medium text-lg text-ink">{assessment.assessmentType}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        assessment.level === 'Expert' ? 'bg-primary-100 text-primary-800' :
                        assessment.level === 'Advanced' ? 'bg-primary-100 text-primary-800' :
                        assessment.level === 'Intermediate' ? 'bg-success-100 text-success-700' :
                        'bg-sand text-ink'
                      }`}>
                        {assessment.level}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div className="text-center">
                        <div className={`text-lg font-semibold px-2 py-1 rounded ${getScoreColor(assessment.score)}`}>
                          {assessment.score}/100
                        </div>
                        <div className="text-xs text-ink-muted">Overall Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-ink">{assessment.totalTechnologies}</div>
                        <div className="text-xs text-ink-muted">Technologies</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-success-600">{assessment.expertCount}</div>
                        <div className="text-xs text-ink-muted">Expert Level</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-semibold text-primary-600">{assessment.proficientCount}</div>
                        <div className="text-xs text-ink-muted">Proficient</div>
                      </div>
                    </div>

                    <p className="text-sm text-ink-muted mb-3">
                      Completed on {new Date(assessment.completedAt).toLocaleDateString()}
                      {assessment.isRecent && (
                        <span className="ml-2 px-2 py-1 bg-success-100 text-success-700 text-xs rounded-full">
                          Recent
                        </span>
                      )}
                    </p>

                    {/* Top Technologies Preview */}
                    {assessment.topTechnologies && assessment.topTechnologies.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-ink-2 mb-2">Top Skills:</p>
                        <div className="flex flex-wrap gap-2">
                          {assessment.topTechnologies.slice(0, 5).map((tech, idx) => (
                            <div key={`tech-preview-${assessment.id}-${idx}-${tech.name}`} className="flex items-center space-x-1 bg-sand rounded-full px-3 py-1">
                              <span className="text-sm font-medium">{tech.name}</span>
                              <div className="flex">
                                {[...Array(10)].map((_, i) => (
                                  <Star 
                                    key={`star-preview-${assessment.id}-${tech.name}-${i}`}
                                    size={10} 
                                    className={i < tech.confidence ? 'text-sun-400 fill-current' : 'text-ink-muted'} 
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-ink-2">{tech.confidence}/10</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <button 
                      onClick={() => setExpandedAssessment(expandedAssessment === assessment.id ? null : assessment.id)}
                      className="p-2 text-ink-2 hover:bg-sand rounded-xl"
                      title="View Details"
                    >
                      {expandedAssessment === assessment.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button 
                      onClick={() => downloadAnalysis(assessment.id)}
                      className="p-2 text-primary-600 hover:bg-primary-50 rounded-xl"
                      title="Download Report"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      onClick={() => deleteAssessment(assessment.id)}
                      className="p-2 text-danger-600 hover:bg-danger-50 rounded-xl"
                      title="Delete Assessment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Assessment Details */}
              {expandedAssessment === assessment.id && (
                <div className="border-t border-line p-4 bg-sand">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Confidence Distribution */}
                    <div>
                      <h5 className="font-medium text-ink mb-3 flex items-center">
                        <TrendingUp className="mr-2" size={16} />
                        Confidence Distribution
                      </h5>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-ink-2">Expert (8-10)</span>
                          <span className="font-medium text-primary-600">{assessment.expertCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-ink-2">Proficient (6-7)</span>
                          <span className="font-medium text-primary-600">{assessment.proficientCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-ink-2">Learning (1-5)</span>
                          <span className="font-medium text-success-600">{assessment.learningCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t">
                          <span className="text-sm font-medium text-ink-2">Average Confidence</span>
                          <span className="font-semibold text-ink">{assessment.averageConfidence.toFixed(1)}/10</span>
                        </div>
                      </div>
                    </div>

                    {/* All Technologies */}
                    {assessment.topTechnologies && assessment.topTechnologies.length > 0 && (
                      <div>
                        <h5 className="font-medium text-ink mb-3 flex items-center">
                          <Award className="mr-2" size={16} />
                          All Technologies ({assessment.totalTechnologies})
                        </h5>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {assessment.topTechnologies.map((tech, idx) => (
                            <div key={`all-tech-${assessment.id}-${idx}-${tech.name}`} className="flex items-center justify-between p-2 bg-surface rounded border">
                              <div className="flex-1">
                                <span className="text-sm font-medium">{tech.name}</span>
                                {tech.category && (
                                  <span className="text-xs text-ink-muted ml-2">({tech.category})</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="flex">
                                  {[...Array(10)].map((_, i) => (
                                    <Star 
                                      key={`detail-star-${assessment.id}-${tech.name}-${i}`}
                                      size={12} 
                                      className={i < tech.confidence ? 'text-sun-400 fill-current' : 'text-ink-muted'} 
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-ink-2 min-w-[30px]">{tech.confidence}/10</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* SWOT Analysis Details if available */}
                    {(assessment.strengths?.length > 0 || assessment.weaknesses?.length > 0 || 
                      assessment.opportunities?.length > 0 || assessment.threats?.length > 0) && (
                      <div className="col-span-2">
                        <h5 className="font-medium text-ink mb-3 flex items-center">
                          <Target className="mr-2" size={16} />
                          SWOT Analysis Details
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {assessment.strengths?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-success-700 mb-2">Strengths</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.strengths.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-strength-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-success-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.weaknesses?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-danger-700 mb-2">Weaknesses</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.weaknesses.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-weakness-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-danger-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.opportunities?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-primary-700 mb-2">Opportunities</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.opportunities.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-opportunity-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-primary-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.threats?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-sun-700 mb-2">Threats</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.threats.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-threat-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-sun-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Assessment Stats */}
                  <div className="mt-4 pt-4 border-t border-line">
                    <div className="flex items-center justify-between text-sm text-ink-2">
                      <span>Assessment ID: {assessment.id.slice(-8)}</span>
                      <span>Overall Proficiency: {assessment.level}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
    { id: 'cv', label: 'CV Management', icon: FileText }, // NEW: CV Management tab
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'skills', label: 'Skills Assessment', icon: Brain },
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
                  {/* NEW: CV Status indicator */}
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
                  <button 
                    onClick={() => navigate('/swot')}
                    className="px-3 py-2 text-sm bg-success-600 text-white rounded-xl hover:bg-success-700"
                  >
                    Skills Assessment
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
                        {/* NEW: Add indicator badges */}
                        {tab.id === 'cv' && !cvData && (
                          <AlertCircle className="text-sun-500" size={14} />
                        )}
                        {tab.id === 'cv' && savedAnalyses.length > 0 && (
                          <span className="bg-primary-100 text-primary-800 text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {savedAnalyses.length}
                          </span>
                        )}
                        {tab.id === 'skills' && skillsAssessments.length > 0 && (
                          <span className="bg-success-100 text-success-700 text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {skillsAssessments.length}
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
            {activeTab === 'cv' && renderCVTab()} {/* NEW: CV Management tab */}
            {activeTab === 'security' && renderSecurityTab()}
            {activeTab === 'skills' && renderSkillsTab()}
            {activeTab === 'settings' && renderSettingsTab()}
            {activeTab === 'privacy' && <PrivacyTab />}
          </div>
        </div>
      </div>
    </div>
  </AppShell>
  );
};

export default UserProfile;