import { useState, useCallback, useRef } from 'react';

export const useCV = (addDebugLog) => {
  const [cvMode, setCvMode] = useState('profile');
  const [profileCV, setProfileCV] = useState(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvError, setCvError] = useState('');
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  const loadProfileCV = useCallback(async () => {
    try {
      setCvLoading(true);
      setCvError('');
      addDebugLog('Loading profile CV...');
      
      const response = await fetch('/api/user/cv', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      const result = await response.json();
      
      if (result.success && result.data?.hasText && result.data?.textLength > 0) {
        await loadCVText(result.data);
      } else {
        addDebugLog('No CV found, switching to upload mode');
        setCvMode('upload');
        setProfileCV(null);
      }
      
    } catch (err) {
      setCvError(err.message);
      setCvMode('upload');
      addDebugLog(`Failed to load CV: ${err.message}`, 'error');
    } finally {
      setCvLoading(false);
    }
  }, [addDebugLog]);

  const loadCVText = useCallback(async (cvMetadata) => {
    try {
      const response = await fetch('/api/user/cv/text', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.text) {
          const cvData = {
            text: result.text,
            fileName: cvMetadata.fileName,
            fileSize: cvMetadata.fileSize,
            uploadedAt: cvMetadata.uploadedAt,
            age: cvMetadata.uploadedAt 
              ? Math.floor((Date.now() - new Date(cvMetadata.uploadedAt)) / (1000 * 60 * 60 * 24)) + ' days' 
              : null
          };
          setProfileCV(cvData);
          setCvMode('profile');
          addDebugLog(`Profile CV loaded: ${cvData.text.length} characters`);
          return cvData;
        }
      }

      throw new Error('Could not load CV text');
    } catch (err) {
      addDebugLog(`Failed to load CV text: ${err.message}`, 'error');
      setCvError('Could not load CV text. Please upload a new file.');
      setCvMode('upload');
      return null;
    }
  }, [addDebugLog]);

  const handleFileUpload = useCallback(async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const validTypes = [
      'application/pdf', 
      'text/plain', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword'
    ];
    
    if (!validTypes.includes(file.type)) {
      setCvError('Please upload a PDF, TXT, DOC, or DOCX file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setCvError('File size must be less than 5MB');
      return;
    }

    setUploadedFile(file);
    setCvLoading(true);
    setCvError('');
    addDebugLog(`Processing file: ${file.name}`);

    try {
      const formData = new FormData();
      formData.append('cv', file);

      const response = await fetch('/api/interviews/process-cv', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: formData
      });

      const result = await response.json();

      if (!result.success || !result.data?.text) {
        throw new Error(result.error || 'Failed to process CV');
      }

      addDebugLog(`CV processed: ${result.data.text.length} characters`);
      return result.data.text;
      
    } catch (err) {
      setCvError(`Failed to process CV: ${err.message}`);
      setUploadedFile(null);
      addDebugLog(`CV processing failed: ${err.message}`, 'error');
      return null;
    } finally {
      setCvLoading(false);
    }
  }, [addDebugLog]);

  const changeCvMode = useCallback((mode, setInterviewData) => {
    setCvMode(mode);
    setCvError('');
    
    if (mode === 'profile' && profileCV) {
      setInterviewData(prev => ({ ...prev, resumeText: profileCV.text }));
      setUploadedFile(null);
    } else if (mode === 'upload' && !uploadedFile) {
      setInterviewData(prev => ({ ...prev, resumeText: '' }));
    } else if (mode === 'manual') {
      setInterviewData(prev => ({ ...prev, resumeText: '' }));
      setUploadedFile(null);
    }
  }, [profileCV, uploadedFile]);

  return {
    cvMode,
    profileCV,
    cvLoading,
    cvError,
    uploadedFile,
    fileInputRef,
    setCvError,
    setUploadedFile,
    loadProfileCV,
    handleFileUpload,
    changeCvMode
  };
};
