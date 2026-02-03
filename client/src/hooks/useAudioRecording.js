import { useState, useRef, useCallback } from 'react';

export const useAudioRecording = (addDebugLog) => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioStream, setAudioStream] = useState(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioPermission, setAudioPermission] = useState(false);
  const [audioError, setAudioError] = useState('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [transcriptionError, setTranscriptionError] = useState('');

  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const audioChunksRef = useRef([]);

  const initializeAudio = useCallback(async () => {
    try {
      addDebugLog('Initializing audio...');
      
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Media recording not supported');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100
        }
      });

      setAudioStream(stream);
      audioStreamRef.current = stream;
      setAudioPermission(true);
      setAudioError('');
      
      addDebugLog('Audio initialized successfully');
      return stream;
    } catch (err) {
      const error = `Microphone access failed: ${err.message}`;
      setAudioError(error);
      setAudioPermission(false);
      addDebugLog(error, 'error');
      throw new Error(error);
    }
  }, [addDebugLog]);

  const startRecording = useCallback(async () => {
    try {
      addDebugLog('Starting recording...');
      setAudioError('');
      setTranscriptionError('');
      
      let stream = audioStream;
      if (!stream) {
        stream = await initializeAudio();
      }

      setAudioBlob(null);
      audioChunksRef.current = [];
      setRecordingTime(0);
      setTranscription('');

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioBlob(blob);
        addDebugLog(`Recording stopped, size: ${blob.size} bytes`);
      };

      mediaRecorder.onerror = (event) => {
        const error = `Recording error: ${event.error.message}`;
        setAudioError(error);
        addDebugLog(error, 'error');
      };

      mediaRecorder.start(250);
      setIsRecording(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setAudioError(err.message);
      addDebugLog(`Start recording failed: ${err.message}`, 'error');
    }
  }, [audioStream, initializeAudio, addDebugLog]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      }
    } catch (err) {
      setAudioError('Failed to stop recording');
      addDebugLog(`Stop recording failed: ${err.message}`, 'error');
    }
  }, [isRecording, addDebugLog]);

  const transcribeAudio = useCallback(async (blob) => {
    try {
      setIsTranscribing(true);
      setTranscriptionError('');
      
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const response = await fetch('/api/interviews/transcribe', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: formData
      });

      const result = await response.json();

      if (result.success && result.text) {
        setTranscription(result.text);
        addDebugLog('Transcription successful');
      } else {
        throw new Error(result.error || 'Transcription failed');
      }
      
    } catch (err) {
      const error = `Transcription failed: ${err.message}`;
      setTranscriptionError(error);
      addDebugLog(error, 'error');
    } finally {
      setIsTranscribing(false);
    }
  }, [addDebugLog]);

  const playRecording = useCallback(async () => {
    if (!audioBlob || !audioPlaybackRef.current) return;

    try {
      if (isPlaying) {
        audioPlaybackRef.current.pause();
        setIsPlaying(false);
        return;
      }

      const url = URL.createObjectURL(audioBlob);
      audioPlaybackRef.current.src = url;
      
      audioPlaybackRef.current.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(url);
      };
      
      await audioPlaybackRef.current.play();
      setIsPlaying(true);
    } catch (err) {
      setAudioError('Failed to play recording');
      addDebugLog(`Playback failed: ${err.message}`, 'error');
    }
  }, [audioBlob, isPlaying, addDebugLog]);

  const cleanup = useCallback(() => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
    }
  }, []);

  return {
    isRecording,
    audioBlob,
    recordingTime,
    isPlaying,
    audioPermission,
    audioError,
    isTranscribing,
    transcription,
    transcriptionError,
    audioPlaybackRef,
    setTranscription,
    initializeAudio,
    startRecording,
    stopRecording,
    transcribeAudio,
    playRecording,
    cleanup
  };
};
