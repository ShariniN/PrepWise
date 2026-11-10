// One-off for existing prototype data: creates a "Default Institution" and attaches every user, interview,
// CV analysis and skills assessment that has no institution yet. Safe to run more than once.
// Usage: node scripts/migrate-default-institution.js [--limit 1000]
import { parseArgs } from 'node:util';
import { connect, isMain, run } from './_db.js';

const main = async () => {
  const { values } = parseArgs({ options: { limit: { type: 'string', default: '1000' } } });
  await connect();
  const [{ default: Institution }, { default: userModel }, { default: InterviewModel }, { default: CVAnalysis }, { default: SkillsAssessment }] = await Promise.all([
    import('../models/Institution.js'), import('../models/User.js'), import('../models/Interview.js'),
    import('../models/CvAnalysis.js'), import('../models/SkillsAssessment.js'),
  ]);

  let inst = await Institution.findOne({ slug: 'default' });
  if (!inst) inst = await Institution.create({ name: 'Default Institution', slug: 'default', contractedStudentLimit: Number(values.limit) });

  // Raw collection updates: the users are legacy documents that would fail validation without an institution.
  const filter = { $or: [{ institutionId: { $exists: false } }, { institutionId: null }] };
  const users = await userModel.collection.updateMany(filter, { $set: { institutionId: inst._id, role: 'student', status: 'active' } });
  const interviews = await InterviewModel.collection.updateMany(filter, { $set: { institutionId: inst._id } });
  const analyses = await CVAnalysis.collection.updateMany(filter, { $set: { institutionId: inst._id } });
  const skills = await SkillsAssessment.collection.updateMany(filter, { $set: { institutionId: inst._id } });

  console.log(`Institution "${inst.name}" (${inst._id})`);
  console.log(`Updated users: ${users.modifiedCount}, interviews: ${interviews.modifiedCount}, analyses: ${analyses.modifiedCount}, skills: ${skills.modifiedCount}`);
  console.log('Promote an administrator manually (set role to "university_admin") before inviting anyone else.');
};

if (isMain(import.meta.url)) run(main);
