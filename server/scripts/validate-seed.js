// Runs every seed reference solution against its tests through the configured execution provider
// (EXECUTION_PROVIDER / JUDGE0_URL / JDOODLE_*) and prints a table. Needs a working sandbox; no database.
// Usage: npm run validate:seed [-- --only slug-substring]
import 'dotenv/config';
import { isMain } from './_db.js';
import { loadSeedFiles } from '../services/seedQuestions.js';
import { gradeTests } from '../services/grading.js';
import { getProvider, ExecutionUnavailableError } from '../services/execution/index.js';

const main = async () => {
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
  const provider = getProvider();
  if (provider.name === 'unavailable') {
    console.error(`No execution provider is configured (${provider.reason}). Set EXECUTION_PROVIDER and its variables in server/.env.`);
    process.exitCode = 2;
    return;
  }
  console.log(`Provider: ${provider.name}\n`);
  const rows = [];
  let failures = 0;
  for (const q of loadSeedFiles().filter((s) => s.type === 'coding' && s.slug.includes(only))) {
    const tests = q.tests.map((t, i) => ({ ...t, _id: String(i) }));
    for (const [language, source] of Object.entries(q.referenceSolutions)) {
      try {
        const g = await gradeTests({ language, source, tests, limits: { timeMs: q.timeLimitMs } });
        const passed = g.perTest.filter((t) => t.passed).length;
        if (passed !== tests.length) failures += 1;
        rows.push({ slug: q.slug, language, tests: tests.length, passed, verdict: g.verdict });
      } catch (error) {
        if (error instanceof ExecutionUnavailableError) {
          console.error(`Execution unavailable (${error.message}). Stopping.`);
          process.exitCode = 3;
          console.table(rows);
          return;
        }
        throw error;
      }
    }
  }
  console.table(rows);
  console.log(failures ? `${failures} reference solution(s) failed.` : 'All reference solutions pass all their tests.');
  if (failures) process.exitCode = 1;
};

if (isMain(import.meta.url)) await main();
