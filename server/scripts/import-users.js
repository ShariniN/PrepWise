// Usage: npm run owner:import-users -- --institution example-university --file students.csv
// CSV columns: email,name,role   (role defaults to student). Stops adding students at the contract limit.
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { connect, isMain, run } from './_db.js';

const main = async () => {
  const { values } = parseArgs({ options: { institution: { type: 'string' }, file: { type: 'string' } } });
  if (!values.institution || !values.file) throw new Error('Usage: --institution <slug> --file <path.csv>');
  const csvText = fs.readFileSync(values.file, 'utf8');

  await connect();
  const [{ default: Institution }, { importUsers }] = await Promise.all([
    import('../models/Institution.js'), import('../services/peopleService.js'),
  ]);
  const institution = await Institution.findOne({ slug: values.institution.toLowerCase() });
  if (!institution) throw new Error(`No institution with slug "${values.institution}"`);

  const out = await importUsers({ institution, actor: null, csvText });
  for (const r of out.results) {
    console.log(`line ${r.line}\t${r.status}\t${r.email}\t${r.reason || ''}${r.inviteLink ? '\t' + r.inviteLink : ''}`);
  }
  console.log('Summary:', out.summary);
  if (out.limitReached) console.log(`Student limit of ${institution.contractedStudentLimit} reached; remaining student rows were not added.`);
  if (out.warning) console.log('Warning:', out.warning);
};

if (isMain(import.meta.url)) run(main);
