import { useState, useRef, useCallback } from 'react';

export const useAudioRecording = () => {
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
  // Exact length of the last recording in seconds (for speaking pace), null before the first one.
  const [recordingDuration, setRecordingDuration] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);

  const initializeAudio = useCallback(async () => {
    try {
      
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
      
      return stream;
    } catch (err) {
      const error = `Microphone access failed: ${err.message}`;
      setAudioError(error);
      setAudioPermission(false);
      throw new Error(error);
    }
  }, []);

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

      const result = await response.json().catch(() => ({}));

      // Voice answers are off (no key) or the speech service failed: the server's message says to type instead.
      if (result.code === 'TRANSCRIPTION_UNAVAILABLE') {
        setTranscriptionError(result.message);
        return;
      }
      if (result.success && result.text && result.text.trim()) {
        setTranscription(result.text);
      } else if (result.success) {
        throw new Error('No speech was detected. Check your microphone and try again, or type your answer below.');
      } else {
        throw new Error(result.message || result.error || 'Transcription failed');
      }
      
    } catch (err) {
      const error = `Transcription failed: ${err.message}`;
      setTranscriptionError(error);
    } finally {
      setIsTranscribing(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setAudioError('');
      setTranscriptionError('');
      
      let stream = audioStream;
      if (!stream) {
        stream = await initializeAudio();
      }

      setAudioBlob(null);
      audioChunksRef.current = [];
      setRecordingTime(0);
      setRecordingDuration(null);
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
        transcribeAudio(blob);
      };

      mediaRecorder.onerror = (event) => {
        const error = `Recording error: ${event.error.message}`;
        setAudioError(error);
      };

      mediaRecorder.start(250);
      recordingStartedAtRef.current = performance.now();
      setIsRecording(true);

      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (err) {
      setAudioError(err.message);
    }
  }, [audioStream, initializeAudio, transcribeAudio]);

  const stopRecording = useCallback(() => {
    try {
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setRecordingDuration((performance.now() - recordingStartedAtRef.current) / 1000);
        
        if (recordingTimerRef.current) {
          clearInterval(recordingTimerRef.current);
        }
      }
    } catch {
      setAudioError('Failed to stop recording');
    }
  }, [isRecording]);


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
    } catch {
      setAudioError('Failed to play recording');
    }
  }, [audioBlob, isPlaying]);

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
    recordingDuration,
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
