// Loads the seed question bank (server/seed/questions/*.json) and upserts it by slug.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SEED_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'seed', 'questions');

export const loadSeedFiles = (dir = SEED_DIR) =>
  fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));

// Seed JSON -> Question document. Seeds are global (institutionId null), published and not editable.
export const toQuestionDoc = (s) => {
  const refs = Object.entries(s.referenceSolutions || {}).map(([language, source]) => ({ language, source }));
  const doc = {
    title: s.title, statement: s.statement, type: s.type, topic: s.topic || [], difficulty: s.difficulty,
    languages: s.languages || [], starterCode: s.starterCode || {}, timeLimitMs: s.timeLimitMs || 2000,
    estimatedMinutes: s.estimatedMinutes, learningOutcome: s.learningOutcome || '',
    source: 'seed', status: 'published',
  };
  if (refs.length) { doc.referenceSolution = refs[0]; doc.altReferenceSolutions = refs.slice(1); }
  if (s.type === 'mcq') { doc.options = s.options; doc.correct = s.correct; doc.multi = !!s.multi; }
  if (s.type === 'trace') doc.traceAnswer = s.traceAnswer;
  if (s.explanation) doc.explanation = s.explanation;
  return doc;
};

// Idempotent: running it twice leaves one question per slug. `repo` is the practice repo (injected so tests need no database).
// Test cases of a seed question are replaced to match the file, so edits to the JSON reach the database.
export const upsertSeeds = async (repo, seeds) => {
  const result = { upserted: 0, tests: 0 };
  for (const s of seeds) {
    const q = await repo.upsertSeedBySlug(s.slug, toQuestionDoc(s));
    if (s.tests) {
      await repo.replaceSeedTests(q._id, s.tests);
      result.tests += s.tests.length;
    }
    result.upserted += 1;
  }
  return result;
};
