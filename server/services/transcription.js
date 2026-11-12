// Speech to text for spoken interview answers: Groq's Whisper model through its OpenAI-compatible API, with the
// same GROQ_API_KEY as the AI chat calls. The audio is held in memory only and never written to disk.
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const TRANSCRIPTION_MODEL = 'whisper-large-v3-turbo';
// Whisper drops "um" and "uh" unless the prompt shows them; camera coaching counts filler words in the transcript.
export const FILLER_PROMPT = 'Um, uh, so, like, you know, I mean.';

export class TranscriptionUnavailableError extends Error {
  constructor(reason) {
    super(`Transcription unavailable: ${reason}`);
    this.name = 'TranscriptionUnavailableError';
  }
}

// Read when the call happens, so a key added later is picked up and tests can unset it.
const groqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  return apiKey ? new OpenAI({ apiKey, baseURL: GROQ_BASE_URL }) : null;
};

export const transcribe = async (buffer, { filename = 'answer.webm', mimetype = 'audio/webm' } = {}, { client } = {}) => {
  const api = client || groqClient();
  if (!api) throw new TranscriptionUnavailableError('GROQ_API_KEY is not set');
  try {
    const file = await toFile(buffer, filename, { type: mimetype });
    const result = await api.audio.transcriptions.create({
      model: TRANSCRIPTION_MODEL, file, response_format: 'verbose_json', prompt: FILLER_PROMPT,
    });
    return {
      text: String(result?.text ?? '').trim(),
      durationSec: typeof result?.duration === 'number' && Number.isFinite(result.duration) ? result.duration : null,
    };
  } catch (error) {
    throw new TranscriptionUnavailableError(`${error?.status ?? 'error'} ${String(error?.message || error).slice(0, 200)}`);
  }
};

// The route calls through this object so tests can stub the provider call.
export const transcriptionService = { transcribe };
