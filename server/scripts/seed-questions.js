// Loads the global seed question bank. Safe to run repeatedly: questions are upserted by slug.
// Usage: npm run seed:questions
import { connect, isMain, run } from './_db.js';
import { loadSeedFiles, upsertSeeds } from '../services/seedQuestions.js';

export const main = async () => {
  const seeds = loadSeedFiles();
  await connect();
  const { default: questionRepo } = await import('../repositories/questionRepo.js');
  const result = await upsertSeeds(questionRepo, seeds);
  console.log(`Seeded ${result.upserted} questions and ${result.tests} test cases (global bank, institutionId null).`);
};

if (isMain(import.meta.url)) await run(main);
