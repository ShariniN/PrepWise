// Usage: npm run owner:usage-report            (table)
//        npm run owner:usage-report -- --csv   (CSV, for invoicing)
import { connect, isMain, run } from './_db.js';

const COLUMNS = ['institution', 'slug', 'status', 'activeStudents', 'invitedStudents', 'studentLimit', 'aiCallsThisMonth', 'aiCallCap', 'contractEnd'];

export const toCsv = (rows) => {
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => cell(r[c])).join(','))].join('\n');
};

const main = async () => {
  await connect();
  const [{ default: Institution }, { default: peopleRepo }, { usageRepo, currentMonth }] = await Promise.all([
    import('../models/Institution.js'), import('../modules/people/people.repo.js'), import('../services/aiUsage.js'),
  ]);
  const month = currentMonth();
  const rows = [];
  for (const inst of await Institution.find().sort({ name: 1 }).lean()) {
    const { active, invited } = await peopleRepo.countStudentsByStatus(inst._id);
    rows.push({
      institution: inst.name, slug: inst.slug, status: inst.status,
      activeStudents: active, invitedStudents: invited, studentLimit: inst.contractedStudentLimit,
      aiCallsThisMonth: await usageRepo.getCalls(inst._id, month), aiCallCap: inst.monthlyAiCallCap,
      contractEnd: inst.contractEnd ? inst.contractEnd.toISOString().slice(0, 10) : '',
    });
  }
  if (process.argv.includes('--csv')) console.log(toCsv(rows));
  else { console.log(`Usage for ${month}`); console.table(rows); }
};

if (isMain(import.meta.url)) run(main);
