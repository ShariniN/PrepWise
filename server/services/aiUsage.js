import AiUsage from '../models/AiUsage.js';
import Institution from '../models/Institution.js';
import { currentInstitutionId } from '../middleware/tenancy.js';

export const DEFAULT_MONTHLY_CAP = 20000;

export class AiLimitError extends Error {
  constructor(cap) {
    super('Your university has reached its monthly AI usage limit. Practice feedback will use the basic scoring until next month.');
    this.name = 'AiLimitError';
    this.code = 'AI_MONTHLY_CAP';
    this.status = 429;
    this.cap = cap;
  }
}

export const usageRepo = {
  // Atomic: one upsert with $inc, then the caller compares the returned count with the cap.
  increment: (institutionId, month) =>
    AiUsage.findOneAndUpdate({ institutionId, month }, { $inc: { calls: 1 } }, { upsert: true, new: true }).lean(),
  getCap: async (institutionId) => (await Institution.findById(institutionId).select('monthlyAiCallCap').lean())?.monthlyAiCallCap,
  getCalls: async (institutionId, month) => (await AiUsage.findOne({ institutionId, month }).lean())?.calls || 0,
};

export const currentMonth = (now = new Date()) => now.toISOString().slice(0, 7);

const capCache = new Map(); // institutionId -> { cap, at }
const CAP_TTL_MS = 60 * 1000;
export const resetAiCapCache = () => capCache.clear();

const capFor = async (institutionId) => {
  const hit = capCache.get(institutionId);
  if (hit && Date.now() - hit.at < CAP_TTL_MS) return hit.cap;
  const cap = (await usageRepo.getCap(institutionId)) ?? DEFAULT_MONTHLY_CAP;
  capCache.set(institutionId, { cap, at: Date.now() });
  return cap;
};

/**
 * Counts one AI call against the institution's monthly cap and throws AiLimitError once it is exceeded.
 * With no institution (scripts, unauthenticated code paths) nothing is metered.
 * If the usage store itself fails the call is allowed and the failure is logged.
 */
export const consumeAi = async (institutionId = currentInstitutionId()) => {
  if (!institutionId) return;
  const id = String(institutionId);
  let calls;
  let cap;
  try {
    cap = await capFor(id);
    calls = (await usageRepo.increment(id, currentMonth())).calls;
  } catch (error) {
    console.error('AI usage metering failed, allowing the call:', error.message);
    return;
  }
  if (calls > cap) throw new AiLimitError(cap);
};
