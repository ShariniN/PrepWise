// One place for AI model names. Providers retire model names over time (gemini-2.5-flash,
// gemini-2.5-pro and gemini-2.0-flash all return 404 for new keys), so never hard-code them elsewhere.
// Names are Gemini models; "groq:<model>" goes to Groq (needs GROQ_API_KEY; skipped when it is not set).
import { parseModelList } from '../services/geminiClient.js';

// Fast Gemini model, also the last fallback. Override with GEMINI_MODEL.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// Chosen with tools/cv-model-bench.mjs on six CVs of known quality: groq:openai/gpt-oss-120b ranked
// them as well as gemini-3.6-flash, with near-identical scores, ~9x faster, no failures, and a much
// larger free allowance (1,000 requests/day vs 20 per Gemini model). Gemini models follow as fallbacks.
const GROQ_DEFAULT = 'groq:openai/gpt-oss-120b';

// CV scoring and written CV feedback. Override with AI_CV_MODELS="model-a,model-b".
export const CV_MODELS = parseModelList(
  process.env.AI_CV_MODELS || process.env.GEMINI_CV_MODELS,
  [GROQ_DEFAULT, 'gemini-3.6-flash', 'gemini-3.5-flash', GEMINI_MODEL],
);

// Everything else: interview questions and feedback, skill extraction, question drafts, grading
// suggestions. Override with AI_MODELS="model-a,model-b".
export const AI_MODELS = parseModelList(process.env.AI_MODELS, [GROQ_DEFAULT, GEMINI_MODEL, 'gemini-3.5-flash']);
