// One place for Gemini model names. Google retires model names over time (gemini-2.5-flash,
// gemini-2.5-pro and gemini-2.0-flash all return 404 for new keys), so never hard-code them elsewhere.
import { parseModelList } from '../services/geminiClient.js';

// Fast general-purpose model (interviews, skill extraction). Override with GEMINI_MODEL.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

// CV scoring and feedback, best first. Chosen by tools/cv-model-bench.mjs: the 3.x Flash models
// rank CVs correctly and are stricter on vague or keyword-stuffed CVs; flash-lite is the fast,
// reliable fallback when the free quota for the others runs out (429) or they are overloaded (503).
// Override with GEMINI_CV_MODELS="model-a,model-b".
export const CV_MODELS = parseModelList(process.env.GEMINI_CV_MODELS, ['gemini-3.6-flash', 'gemini-3.5-flash', GEMINI_MODEL]);
