import Institution from '../models/Institution.js';

export class SeatLockBusyError extends Error {
  constructor() {
    super('Too many people are signing up right now. Try again in a moment.');
    this.name = 'SeatLockBusyError';
  }
}

export const seatLockRepo = {
  // Takes the lock only if nobody holds it or the holder's lock has run out. Resolves to the document, or null.
  acquire: (institutionId, now, until) =>
    Institution.findOneAndUpdate(
      { _id: institutionId, $or: [{ seatLockUntil: null }, { seatLockUntil: { $exists: false } }, { seatLockUntil: { $lt: now } }] },
      { $set: { seatLockUntil: until } },
      { projection: { _id: 1 } },
    ),
  // Only releases the lock this caller took, so a slow caller cannot free someone else's.
  release: (institutionId, until) =>
    Institution.updateOne({ _id: institutionId, seatLockUntil: until }, { $set: { seatLockUntil: null } }),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs fn while holding a per-institution lock that expires on its own, so a crash cannot block signups for long.
export const withSeatLock = async (institutionId, fn, { ttlMs = 5000, waitMs = 3000 } = {}) => {
  const deadline = Date.now() + waitMs;
  let until;
  for (let attempt = 0; ; attempt += 1) {
    const now = new Date();
    until = new Date(now.getTime() + ttlMs);
    if (await seatLockRepo.acquire(institutionId, now, until)) break;
    if (Date.now() >= deadline) throw new SeatLockBusyError();
    await sleep(Math.min(20 * (attempt + 1), 200));
  }
  try {
    return await fn();
  } finally {
    await seatLockRepo.release(institutionId, until);
  }
};
