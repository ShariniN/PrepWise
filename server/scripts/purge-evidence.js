// Deletes integrity evidence older than each university's retentionDays. Safe to run daily.
// Usage: npm run purge:evidence
import { connect, isMain, run } from './_db.js';

const main = async () => {
  await connect();
  const { purgeExpiredEvidence } = await import('../services/integrity/retention.js');
  const rows = await purgeExpiredEvidence(new Date());
  for (const r of rows) {
    console.log(`${r.institutionId}: retention ${r.retentionDays} days (before ${r.cutoff.toISOString()}) -> `
      + `${r.integrityEvents} integrity events, ${r.editEventBatches} edit-event batches, ${r.similarityPairs} similarity pairs, ${r.closedCases} closed cases deleted`);
  }
  if (!rows.length) console.log('No institutions found.');
};

if (isMain(import.meta.url)) await run(main);
