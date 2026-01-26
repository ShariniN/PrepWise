// UserProfile.jsx - Enhanced version with CV management and reorganized tabs
import React, { useState, useEffect, useContext } from 'react';
import { User, Mail, Lock, FileText, Brain, Crown, Settings, Save, Eye, EyeOff, Download, Trash2, ChevronDown, ChevronUp, Star, TrendingUp, Target, Award, Upload, File, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { AppContext } from '../context/AppContext';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import NavBar from "../components/NavBar";

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
  const generateBasicPDF = (analysis) => {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      console.error('jsPDF library not loaded');
      toast.error('PDF library not available. Please refresh the page and try again.');
      return;
    }

    const doc = new jsPDF();
    let yPos = 20;

    // Header
    doc.setFontSize(20);
    doc.setTextColor(40, 116, 166);
    doc.text('CV Analysis Report - Basic', 20, yPos);
    yPos += 15;

    // Watermark for basic users
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text('Generated with CVAnalyzer Basic Plan', 20, yPos);
    yPos += 20;

    // Analysis Overview
    doc.setFontSize(16);
    doc.setTextColor(0);
    doc.text('Analysis Overview', 20, yPos);
    yPos += 10;

    doc.setFontSize(12);
    doc.text(`Job Title: ${analysis.jobTitle}`, 20, yPos);
    yPos += 8;
    doc.text(`Company: ${analysis.company}`, 20, yPos);
    yPos += 8;
    doc.text(`Match Score: ${analysis.matchPercentage}%`, 20, yPos);
    yPos += 8;
    doc.text(`Analysis Date: ${new Date(analysis.createdAt).toLocaleDateString()}`, 20, yPos);
    yPos += 15;

    // Match Score Visualization (Simple)
    doc.setFontSize(14);
    doc.text('Match Score:', 20, yPos);
    yPos += 8;

    // Simple progress bar
    const barWidth = 100;
    const barHeight = 10;
    const fillWidth = (analysis.matchPercentage / 100) * barWidth;

    doc.setFillColor(240, 240, 240);
    doc.rect(20, yPos, barWidth, barHeight, 'F');
    
    doc.setFillColor(40, 116, 166);
    doc.rect(20, yPos, fillWidth, barHeight, 'F');
    
    doc.setTextColor(0);
    doc.text(`${analysis.matchPercentage}%`, 130, yPos + 7);
    yPos += 25;

    // Key Strengths (Limited for Basic)
    if (analysis.strengths && analysis.strengths.length > 0) {
      doc.setFontSize(14);
      doc.text('Key Strengths (Top 3):', 20, yPos);
      yPos += 10;

      doc.setFontSize(10);
      const limitedStrengths = analysis.strengths.slice(0, 3);
      limitedStrengths.forEach((strength, index) => {
        const lines = doc.splitTextToSize(`• ${strength}`, 170);
        lines.forEach(line => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, 20, yPos);
          yPos += 6;
        });
      });
      yPos += 10;
    }

    // Top Recommendations (Limited for Basic)
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      doc.setFontSize(14);
      doc.text('Improvement Suggestions (Top 3):', 20, yPos);
      yPos += 10;

      doc.setFontSize(10);
      const limitedRecs = analysis.recommendations.slice(0, 3);
      limitedRecs.forEach((rec, index) => {
        const lines = doc.splitTextToSize(`• ${rec}`, 170);
        lines.forEach(line => {
          if (yPos > 270) {
            doc.addPage();
            yPos = 20;
          }
          doc.text(line, 20, yPos);
          yPos += 6;
        });
      });
      yPos += 15;
    }

    // Upgrade Promotion for Basic Users
    if (yPos > 250) {
      doc.addPage();
      yPos = 20;
    }

    doc.setFontSize(12);
    doc.setTextColor(255, 140, 0);
    doc.text('Upgrade to Premium for Enhanced Features:', 20, yPos);
    yPos += 10;

    doc.setFontSize(10);
    doc.setTextColor(0);
    const premiumFeatures = [
      '• Detailed analysis of all job matches',
      '• Complete strengths and recommendations list',
      '• Professional formatting and branding',
      '• Multiple job comparison analysis',
      '• Advanced charts and visualizations',
      '• Interview preparation insights'
    ];

    premiumFeatures.forEach(feature => {
      doc.text(feature, 20, yPos);
      yPos += 6;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Generated by CVAnalyzer - www.cvanalyzer.com', 20, 285);
    doc.text(`Report ID: ${analysis.id.slice(-8)} | Basic Plan`, 140, 285);

    return doc;
  };

  const generatePremiumPDF = (analysis) => {
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
    doc.text('Premium Detailed Analysis', 20, 25);
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
    doc.text('🎯 Premium Insights & Recommendations:', 20, yPos);
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
    doc.text('Generated by CVAnalyzer Premium - Professional CV Analysis Platform', 20, 285);
    doc.text(`Report ID: ${analysis.id.slice(-8)} | Premium Plan | ${new Date().toLocaleDateString()}`, 140, 285);

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
      const isPremium = localUser?.accountPlan === 'premium';
      const doc = isPremium ? generatePremiumPDF(analysis) : generateBasicPDF(analysis);
      
      if (doc) {
        const fileName = `CV_Analysis_${analysis.jobTitle.replace(/[^a-zA-Z0-9]/g, '_')}_${analysis.id.slice(-6)}.pdf`;
        doc.save(fileName);
        
        toast.success(
          isPremium 
            ? 'Premium PDF report downloaded successfully!' 
            : 'Basic PDF report downloaded. Upgrade to Premium for enhanced features!'
        );
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error('Failed to generate PDF. Please try again.');
    } finally {
      setDownloadingAnalysis(null);
    }
  };

  const updateProfile = async () => {
    setLoading(true);
    try {
      const { data } = await axios.put(backendUrl + '/api/user/profile', {
        name: localUser.name,
        phoneNumber: localUser.phoneNumber,
        accountType: localUser.accountType
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
    
    if (passwords.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
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

  const upgradeToPremium = async () => {
    setLoading(true);
    try {
      const { data } = await axios.put(backendUrl + '/api/user/upgrade-premium');

      if (data.success) {
        setLocalUser(prev => ({ ...prev, accountPlan: 'premium' }));
        // Update context
        await getUserData();
        toast.success('Account upgraded to Premium!');
      } else {
        toast.error(data.message || 'Failed to upgrade account');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to upgrade account';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const downgradeToBasic = async () => {
    setLoading(true);
    try {
      const { data } = await axios.put(backendUrl + '/api/user/downgrade-basic');

      if (data.success) {
        setLocalUser(prev => ({ ...prev, accountPlan: 'basic' }));
        // Update context
        await getUserData();
        toast.success('Account downgraded to Basic');
      } else {
        toast.error(data.message || 'Failed to downgrade account');
      }
    } catch (error) {
      const msg = error.response?.data?.message || error.message || 'Failed to downgrade account';
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
    if (percentage >= 80) return 'text-green-800 bg-green-100';
    if (percentage >= 60) return 'text-yellow-800 bg-yellow-100';
    if (percentage >= 40) return 'text-orange-800 bg-orange-100';
    return 'text-red-800 bg-red-100';
  };

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-800 bg-green-100';
    if (score >= 70) return 'text-blue-800 bg-blue-100';
    if (score >= 50) return 'text-yellow-800 bg-yellow-100';
    return 'text-red-800 bg-red-100';
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const renderProfileTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <User className="mr-2" size={20} />
          Profile Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={localUser.name || ''}
              onChange={(e) => setLocalUser(prev => ({ ...prev, name: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
            <input
              type="text"
              value={localUser.phoneNumber || ''}
              onChange={(e) => setLocalUser(prev => ({ ...prev, phoneNumber: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={localUser.email || ''}
              disabled
              className="w-full p-2 border border-gray-300 rounded-md bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
            <select
              value={localUser.accountType || ''}
              onChange={(e) => setLocalUser(prev => ({ ...prev, accountType: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="Fresher">Fresher</option>
              <option value="Trainer">Trainer</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
            <div className="flex items-center">
              <span className={`px-2 py-1 rounded-full text-xs ${localUser.isAccountVerified ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {localUser.isAccountVerified ? 'Verified' : 'Unverified'}
              </span>
            </div>
          </div>
        </div>
        <button 
          onClick={updateProfile}
          disabled={loading}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
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
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Lock className="mr-2" size={20} />
          Change Password
        </h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={passwords.currentPassword}
                onChange={(e) => setPasswords(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwords.newPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, newPassword: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input
              type={showPassword ? 'text' : 'password'}
              value={passwords.confirmPassword}
              onChange={(e) => setPasswords(prev => ({ ...prev, confirmPassword: e.target.value }))}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <button
            onClick={handlePasswordChange}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
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
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <FileText className="mr-2" size={20} />
        CV Management
      </h3>
      
      {cvLoading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading CV information...</span>
        </div>
      ) : cvData ? (
        // CV exists - show details and management options
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <CheckCircle className="text-green-600" size={24} />
                <div>
                  <h4 className="text-lg font-medium text-green-800">CV Uploaded Successfully</h4>
                  <p className="text-sm text-green-600">Your CV is ready for analysis</p>
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={refreshCV}
                  className="p-2 text-gray-600 hover:bg-gray-100 rounded-md"
                  title="Refresh CV Info"
                >
                  <RefreshCw size={16} />
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <h5 className="font-medium text-gray-800 mb-3">CV Details</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">File Name:</span>
                  <span className="font-medium">{cvData.fileName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">File Size:</span>
                  <span className="font-medium">{formatFileSize(cvData.fileSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Uploaded:</span>
                  <span className="font-medium">
                    {new Date(cvData.uploadedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className="font-medium text-green-600">
                    {cvData.hasText ? 'Ready for Analysis' : 'Processing...'}
                  </span>
                </div>
                {cvData.textLength && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">Text Length:</span>
                    <span className="font-medium">{cvData.textLength} characters</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-blue-50 rounded-lg p-4">
              <h5 className="font-medium text-blue-800 mb-3">Quick Actions</h5>
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/cv-analyzer')}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center"
                >
                  <Target className="mr-2" size={16} />
                  Analyze CV Against Jobs
                </button>
                <button
                  onClick={() => navigate('/swot')}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center"
                >
                  <Brain className="mr-2" size={16} />
                  Skills Assessment
                </button>
              </div>
            </div>
          </div>

          {/* Update/Replace CV Section */}
          <div className="border-t pt-4">
            <h5 className="font-medium text-gray-800 mb-3">Update CV</h5>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <input
                  type="file"
                  id="cv-update"
                  accept=".pdf"
                  onChange={handleFileSelect}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {selectedFile && (
                  <p className="text-sm text-gray-600 mt-1">
                    Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={uploadCV}
                  disabled={!selectedFile || uploadingCV}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center"
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
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center"
                >
                  <Trash2 className="mr-2" size={16} />
                  Delete CV
                </button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Updating will replace your current CV. Only PDF files are supported. Maximum file size: 10MB
            </p>
          </div>
        </div>
      ) : (
        // No CV uploaded - show upload form
        <div className="text-center py-8">
          <div className="bg-blue-50 border-2 border-dashed border-blue-200 rounded-lg p-8">
            <File className="mx-auto h-16 w-16 text-blue-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2">No CV Uploaded</h4>
            <p className="text-gray-600 mb-6">Upload your CV to start analyzing it against job descriptions</p>
            
            <div className="max-w-md mx-auto">
              <input
                type="file"
                id="cv-upload"
                accept=".pdf"
                onChange={handleFileSelect}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              />
              {selectedFile && (
                <p className="text-sm text-gray-600 mb-4">
                  Selected: {selectedFile.name} ({formatFileSize(selectedFile.size)})
                </p>
              )}
              <button
                onClick={uploadCV}
                disabled={!selectedFile || uploadingCV}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center"
              >
                {uploadingCV ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                ) : (
                  <Upload className="mr-2" size={20} />
                )}
                {uploadingCV ? 'Uploading CV...' : 'Upload CV'}
              </button>
              <p className="text-xs text-gray-500 mt-2">
                Only PDF files are supported. Maximum file size: 10MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* CV Usage Information */}
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
      <h4 className="text-lg font-semibold text-blue-800 mb-3">How Your CV is Used</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h5 className="font-medium text-gray-900 mb-2">CV Analyzer</h5>
          <p className="text-gray-600">Your CV text is compared against job descriptions to identify matches, gaps, and improvement opportunities.</p>
        </div>
        <div className="bg-white rounded-lg p-4 shadow-sm">
          <h5 className="font-medium text-gray-900 mb-2">Skills Assessment</h5>
          <p className="text-gray-600">The system extracts your skills and experience to provide personalized technology proficiency assessments.</p>
        </div>
      </div>
      <div className="mt-4 p-3 bg-blue-100 rounded-lg">
        <p className="text-xs text-blue-800">
          <strong>Privacy:</strong> Your CV data is stored securely and only used for analysis purposes. 
          You can delete your CV at any time, and it will be permanently removed from our servers.
        </p>
      </div>
    </div>
  </div>
);

  const renderSkillsTab = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Brain className="mr-2" size={20} />
        Skills Assessment Results ({skillsAssessments.length})
      </h3>
      {skillsAssessments.length === 0 ? (
        <div className="text-center py-8">
          <Brain className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <p className="text-gray-600 mb-2">No skills assessments completed yet.</p>
          <p className="text-sm text-gray-500">Complete a SWOT analysis to see your technology proficiency results here.</p>
          <button 
            onClick={() => navigate('/swot')}
            className="mt-3 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Start Skills Assessment
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {skillsAssessments.map((assessment) => (
            <div key={assessment.id} className="border border-gray-200 rounded-lg">
              <div className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      <h4 className="font-medium text-lg text-gray-900">{assessment.assessmentType}</h4>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        assessment.level === 'Expert' ? 'bg-purple-100 text-purple-800' :
                        assessment.level === 'Advanced' ? 'bg-blue-100 text-blue-800' :
                        assessment.level === 'Intermediate' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {assessment.level}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                      <div className="text-center">
                        <div className={`text-lg font-bold px-2 py-1 rounded ${getScoreColor(assessment.score)}`}>
                          {assessment.score}/100
                        </div>
                        <div className="text-xs text-gray-500">Overall Score</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-gray-900">{assessment.totalTechnologies}</div>
                        <div className="text-xs text-gray-500">Technologies</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-green-600">{assessment.expertCount}</div>
                        <div className="text-xs text-gray-500">Expert Level</div>
                      </div>
                      <div className="text-center">
                        <div className="text-lg font-bold text-blue-600">{assessment.proficientCount}</div>
                        <div className="text-xs text-gray-500">Proficient</div>
                      </div>
                    </div>

                    <p className="text-sm text-gray-500 mb-3">
                      Completed on {new Date(assessment.completedAt).toLocaleDateString()}
                      {assessment.isRecent && (
                        <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Recent
                        </span>
                      )}
                    </p>

                    {/* Top Technologies Preview */}
                    {assessment.topTechnologies && assessment.topTechnologies.length > 0 && (
                      <div className="mb-3">
                        <p className="text-sm font-medium text-gray-700 mb-2">Top Skills:</p>
                        <div className="flex flex-wrap gap-2">
                          {assessment.topTechnologies.slice(0, 5).map((tech, idx) => (
                            <div key={`tech-preview-${assessment.id}-${idx}-${tech.name}`} className="flex items-center space-x-1 bg-gray-100 rounded-full px-3 py-1">
                              <span className="text-sm font-medium">{tech.name}</span>
                              <div className="flex">
                                {[...Array(10)].map((_, i) => (
                                  <Star 
                                    key={`star-preview-${assessment.id}-${tech.name}-${i}`}
                                    size={10} 
                                    className={i < tech.confidence ? 'text-yellow-400 fill-current' : 'text-gray-300'} 
                                  />
                                ))}
                              </div>
                              <span className="text-xs text-gray-600">{tech.confidence}/10</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex space-x-2 ml-4">
                    <button 
                      onClick={() => setExpandedAssessment(expandedAssessment === assessment.id ? null : assessment.id)}
                      className="p-2 text-gray-600 hover:bg-gray-50 rounded-md"
                      title="View Details"
                    >
                      {expandedAssessment === assessment.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button 
                      onClick={() => downloadAnalysis(assessment.id)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-md"
                      title="Download Report"
                    >
                      <Download size={16} />
                    </button>
                    <button 
                      onClick={() => deleteAssessment(assessment.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                      title="Delete Assessment"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Assessment Details */}
              {expandedAssessment === assessment.id && (
                <div className="border-t border-gray-200 p-4 bg-gray-50">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Confidence Distribution */}
                    <div>
                      <h5 className="font-medium text-gray-800 mb-3 flex items-center">
                        <TrendingUp className="mr-2" size={16} />
                        Confidence Distribution
                      </h5>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Expert (8-10)</span>
                          <span className="font-medium text-purple-600">{assessment.expertCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Proficient (6-7)</span>
                          <span className="font-medium text-blue-600">{assessment.proficientCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Learning (1-5)</span>
                          <span className="font-medium text-green-600">{assessment.learningCount} skills</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t">
                          <span className="text-sm font-medium text-gray-700">Average Confidence</span>
                          <span className="font-bold text-gray-900">{assessment.averageConfidence.toFixed(1)}/10</span>
                        </div>
                      </div>
                    </div>

                    {/* All Technologies */}
                    {assessment.topTechnologies && assessment.topTechnologies.length > 0 && (
                      <div>
                        <h5 className="font-medium text-gray-800 mb-3 flex items-center">
                          <Award className="mr-2" size={16} />
                          All Technologies ({assessment.totalTechnologies})
                        </h5>
                        <div className="max-h-48 overflow-y-auto space-y-2">
                          {assessment.topTechnologies.map((tech, idx) => (
                            <div key={`all-tech-${assessment.id}-${idx}-${tech.name}`} className="flex items-center justify-between p-2 bg-white rounded border">
                              <div className="flex-1">
                                <span className="text-sm font-medium">{tech.name}</span>
                                {tech.category && (
                                  <span className="text-xs text-gray-500 ml-2">({tech.category})</span>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <div className="flex">
                                  {[...Array(10)].map((_, i) => (
                                    <Star 
                                      key={`detail-star-${assessment.id}-${tech.name}-${i}`}
                                      size={12} 
                                      className={i < tech.confidence ? 'text-yellow-400 fill-current' : 'text-gray-300'} 
                                    />
                                  ))}
                                </div>
                                <span className="text-xs text-gray-600 min-w-[30px]">{tech.confidence}/10</span>
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
                        <h5 className="font-medium text-gray-800 mb-3 flex items-center">
                          <Target className="mr-2" size={16} />
                          SWOT Analysis Details
                        </h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {assessment.strengths?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-green-700 mb-2">Strengths</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.strengths.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-strength-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-green-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.weaknesses?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-red-700 mb-2">Weaknesses</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.weaknesses.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-weakness-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-red-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.opportunities?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-blue-700 mb-2">Opportunities</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.opportunities.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-opportunity-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {assessment.threats?.length > 0 && (
                            <div>
                              <h6 className="font-medium text-orange-700 mb-2">Threats</h6>
                              <ul className="text-sm space-y-1">
                                {assessment.threats.slice(0, 3).map((item, idx) => (
                                  <li key={`swot-threat-${assessment.id}-${idx}`} className="flex items-start">
                                    <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
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
                  <div className="mt-4 pt-4 border-t border-gray-300">
                    <div className="flex items-center justify-between text-sm text-gray-600">
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

  const renderSubscriptionTab = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 flex items-center">
          <Crown className="mr-2" size={20} />
          Subscription Plan
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className={`border-2 rounded-lg p-6 ${localUser.accountPlan === 'basic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
            <div className="text-center">
              <h4 className="text-xl font-semibold">Basic Plan</h4>
              <p className="text-3xl font-bold text-gray-900 mt-2">Free</p>
              <ul className="mt-4 space-y-2 text-sm text-left">
                <li key="basic-feature-1">✓ 5 CV analyses per month</li>
                <li key="basic-feature-2">✓ 1 job description per analysis</li>
                <li key="basic-feature-3">✓ Basic skills assessment</li>
                <li key="basic-feature-4">✓ Standard support</li>
                <li key="basic-feature-5">✓ Basic PDF reports</li>
                <li key="basic-feature-6">✗ Multiple job comparison</li>
                <li key="basic-feature-7">✗ Advanced analytics</li>
                <li key="basic-feature-8">✗ Premium PDF reports</li>
                <li key="basic-feature-9">✗ Priority support</li>
              </ul>
              {localUser.accountPlan === 'basic' ? (
                <div className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md">
                  Current Plan
                </div>
              ) : (
                <button 
                  onClick={downgradeToBasic}
                  disabled={loading}
                  className="mt-4 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Downgrade'}
                </button>
              )}
            </div>
          </div>

          <div className={`border-2 rounded-lg p-6 ${localUser.accountPlan === 'premium' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200'}`}>
            <div className="text-center">
              <h4 className="text-xl font-semibold">Premium Plan</h4>
              <p className="text-3xl font-bold text-gray-900 mt-2">LKR 2,500<span className="text-sm font-normal">/month</span></p>
              <ul className="mt-4 space-y-2 text-sm text-left">
                <li key="premium-feature-1">✓ Unlimited CV analyses</li>
                <li key="premium-feature-2">✓ Compare against 5 job descriptions</li>
                <li key="premium-feature-3">✓ Advanced skills assessment</li>
                <li key="premium-feature-4">✓ Detailed analytics & insights</li>
                <li key="premium-feature-5">✓ Priority support</li>
                <li key="premium-feature-6">✓ Professional PDF reports</li>
                <li key="premium-feature-7">✓ Complete analysis details</li>
                <li key="premium-feature-8">✓ Job matching recommendations</li>
                <li key="premium-feature-9">✓ Interview preparation tips</li>
              </ul>
              {localUser.accountPlan === 'premium' ? (
                <div className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-md">
                  Current Plan
                </div>
              ) : (
                <button 
                  onClick={upgradeToPremium}
                  disabled={loading}
                  className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : 'Upgrade Now'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* PDF Report Comparison */}
        <div className="mt-6 bg-gradient-to-r from-blue-50 to-yellow-50 border border-blue-200 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-blue-800 mb-3">PDF Report Features Comparison</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-blue-500">
              <h5 className="font-medium text-gray-900 mb-2">Basic PDF Reports</h5>
              <ul className="space-y-1 text-gray-600">
                <li>• Summary of top 3 strengths</li>
                <li>• Top 3 improvement suggestions</li>
                <li>• Basic match score visualization</li>
                <li>• Simple formatting</li>
                <li>• Upgrade promotion included</li>
              </ul>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm border-l-4 border-yellow-500">
              <h5 className="font-medium text-gray-900 mb-2">Premium PDF Reports</h5>
              <ul className="space-y-1 text-gray-600">
                <li>• Complete strengths analysis</li>
                <li>• All improvement recommendations</li>
                <li>• Professional formatting & branding</li>
                <li>• Multi-job analysis details</li>
                <li>• Advanced insights & tips</li>
                <li>• Interview preparation guidance</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Premium Features Highlight */}
        <div className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-yellow-800 mb-3">Premium Feature Highlight</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h5 className="font-medium text-gray-900 mb-2">Multi-Job Analysis</h5>
              <p className="text-gray-600">Upload your CV once and compare it against up to 5 different job descriptions simultaneously. Get match percentages and tailored recommendations for each position.</p>
            </div>
            <div className="bg-white rounded-lg p-4 shadow-sm">
              <h5 className="font-medium text-gray-900 mb-2">Professional PDF Reports</h5>
              <p className="text-gray-600">Get comprehensive, professionally formatted PDF reports with complete analysis, advanced insights, and actionable recommendations to improve your candidacy.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderSettingsTab = () => (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4 flex items-center">
        <Settings className="mr-2" size={20} />
        Account Settings
      </h3>
      
      <div className="space-y-6">
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">Account Actions</h4>
          <p className="text-sm text-gray-600 mb-4">Manage your account access and session.</p>
          <button 
            onClick={handleLogout}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Logout
          </button>
        </div>

        {/* PDF Download Information */}
        <div className="border border-gray-200 rounded-lg p-4">
          <h4 className="font-medium text-gray-900 mb-2">PDF Download Information</h4>
          <div className="text-sm text-gray-600 space-y-2">
            <p><strong>Current Plan:</strong> {localUser?.accountPlan === 'premium' ? 'Premium' : 'Basic'}</p>
            <p><strong>PDF Features Available:</strong></p>
            <ul className="ml-4 space-y-1">
              {localUser?.accountPlan === 'premium' ? (
                <>
                  <li>✓ Professional formatting and branding</li>
                  <li>✓ Complete analysis with all strengths</li>
                  <li>✓ All improvement recommendations</li>
                  <li>✓ Multi-job analysis details</li>
                  <li>✓ Advanced insights and tips</li>
                  <li>✓ Interview preparation guidance</li>
                </>
              ) : (
                <>
                  <li>✓ Basic PDF report generation</li>
                  <li>✓ Top 3 strengths and recommendations</li>
                  <li>✓ Match score visualization</li>
                  <li>⚠ Limited to essential information</li>
                  <li>💡 Upgrade to Premium for enhanced features</li>
                </>
              )}
            </ul>
          </div>
        </div>    
      </div>
    </div>
  );

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'cv', label: 'CV Management', icon: FileText }, // NEW: CV Management tab
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'skills', label: 'Skills Assessment', icon: Brain },
    { id: 'subscription', label: 'Subscription', icon: Crown },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
          <NavBar />
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {localUser.name ? localUser.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : 'U'}
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{localUser.name}</h1>
                <p className="text-gray-600">{localUser.email}</p>
                <div className="flex items-center space-x-2 mt-1">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    localUser.accountPlan === 'premium' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {localUser.accountPlan ? localUser.accountPlan.charAt(0).toUpperCase() + localUser.accountPlan.slice(1) : 'Basic'} Plan
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    localUser.accountType === 'Trainer' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {localUser.accountType}
                  </span>
                  {/* NEW: CV Status indicator */}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    cvData ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                  }`}>
                    {cvData ? 'CV Uploaded ✓' : 'No CV'}
                  </span>
                  {localUser.accountPlan === 'premium' && (
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                      Premium PDF ✓
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Quick Actions */}
            <div className="flex space-x-2">
              {cvData ? (
                <>
                  <button 
                    onClick={() => navigate('/cv-analyzer')}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    CV Analyzer
                  </button>
                  <button 
                    onClick={() => navigate('/swot')}
                    className="px-3 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700"
                  >
                    Skills Assessment
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setActiveTab('cv')}
                  className="px-3 py-2 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 flex items-center"
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
            <nav className="bg-white rounded-lg shadow p-4">
              <ul className="space-y-2">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  return (
                    <li key={tab.id}>
                      <button
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full text-left px-3 py-2 rounded-md flex items-center space-x-3 transition-colors ${
                          activeTab === tab.id 
                            ? 'bg-blue-100 text-blue-700 border-r-2 border-blue-700' 
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        <Icon size={18} />
                        <span>{tab.label}</span>
                        {/* NEW: Add indicator badges */}
                        {tab.id === 'cv' && !cvData && (
                          <AlertCircle className="text-orange-500" size={14} />
                        )}
                        {tab.id === 'cv' && savedAnalyses.length > 0 && (
                          <span className="bg-blue-100 text-blue-800 text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                            {savedAnalyses.length}
                          </span>
                        )}
                        {tab.id === 'skills' && skillsAssessments.length > 0 && (
                          <span className="bg-green-100 text-green-800 text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
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
            {activeTab === 'subscription' && renderSubscriptionTab()}
            {activeTab === 'settings' && renderSettingsTab()}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
};

export default UserProfile;