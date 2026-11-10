// Creates two fake universities for demos and tests. Fake data only, no real CVs, no AI calls.
// University A also gets fake mock interviews and CV analyses for 25 of its 40 students (see demoActivity.js),
// so the lecturer dashboard has data. Students are split into 'Group 1' and 'Group 2'.
// Usage: npm run seed:demo            (refuses to run when NODE_ENV=production)
//        npm run seed:demo -- --reset (deletes the two demo institutions and everything in them first)
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connect, isMain, run } from './_db.js';
import { demoPlan, buildDemoActivity } from './demoActivity.js';

// Which demo universities get fake interview and CV activity.
export const ACTIVITY_SLUGS = ['demo-a'];

const FIRST = ['Amara', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Kavya', 'Liam', 'Maya', 'Noah', 'Olu', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara'];
const LAST = ['Adams', 'Brooks', 'Chen', 'Dias', 'Evans', 'Fox', 'Gupta', 'Hughes', 'Ito', 'Jones'];

// University A uses short, memorable logins on email.com so demos are easy to run.
// Demo only: never use these passwords for anything real.
export const DEMOS = [
  { name: 'Demo University A', slug: 'demo-a', domain: 'demo-a.test', loginDomain: 'email.com', limit: 60 },
  { name: 'Demo University B', slug: 'demo-b', domain: 'demo-b.test', loginDomain: 'demo-b.test', limit: 45 },
];

export const DEMO_PASSWORDS = {
  university_admin: 'admin@123',
  lecturer: 'lecturer@123',
  student: 'student@123',
};

// Meets the password rule (upper case, digit, symbol). Random, demo only.
export const randomPassword = () => `Aa1!${crypto.randomBytes(6).toString('base64url')}`;

export const studentNames = (n) =>
  Array.from({ length: n }, (_, i) => ({ first: FIRST[i % FIRST.length], last: LAST[Math.floor(i / FIRST.length) % LAST.length] }));

export const main = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data: NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }
  await connect();
  const [{ default: Institution }, { default: userModel }, { default: Interview }, { default: CVAnalysis }, { default: SkillsAssessment }, { default: Attempt }] = await Promise.all([
    import('../models/Institution.js'), import('../models/userModel.js'), import('../models/InterviewModel.js'),
    import('../models/CVAnalysisModel.js'), import('../models/SkillAssessorModel.js'), import('../models/Attempt.js'),
  ]);

  const reset = process.argv.includes('--reset');
  for (const d of DEMOS) {
    const existing = await Institution.findOne({ slug: d.slug });
    if (existing && !reset) throw new Error(`${d.slug} already exists. Re-run with --reset to replace the demo data.`);
    if (existing) {
      const id = existing._id;
      const ids = (await userModel.find({ institutionId: id }).select('_id').lean()).map((u) => u._id);
      await Promise.all([
        Interview.deleteMany({ $or: [{ institutionId: id }, { userId: { $in: ids } }] }),
        CVAnalysis.deleteMany({ $or: [{ institutionId: id }, { userId: { $in: ids } }] }),
        SkillsAssessment.deleteMany({ $or: [{ institutionId: id }, { userId: { $in: ids } }] }),
        Attempt.deleteMany({ institutionId: id }),
      ]);
      await userModel.deleteMany({ institutionId: id });
      await Institution.deleteOne({ _id: id });
    }
  }

  for (const d of DEMOS) {
    const institution = await Institution.create({
      name: d.name, slug: d.slug, contractedStudentLimit: d.limit,
      allowedEmailDomains: [...new Set([d.domain, d.loginDomain])],
      contractStart: new Date(), contractEnd: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });
    console.log(`\n=== ${d.name} (slug ${d.slug}, student limit ${d.limit}) ===`);

    const make = async (name, email, role, password, extra = {}) => userModel.create({
      name, email, role, institutionId: institution._id, status: 'active', isAccountVerified: true,
      password: await bcrypt.hash(password, 10), ...extra,
    });

    const staff = [];
    for (const [name, email, role] of [
      ['Dana Admin', `admin@${d.loginDomain}`, 'university_admin'],
      ['Leo Lecturer', `lecturer@${d.loginDomain}`, 'lecturer'],
      ['Lena Lecturer', `lecturer2@${d.domain}`, 'lecturer'],
    ]) {
      const password = DEMO_PASSWORDS[role];
      staff.push(await make(name, email, role, password));
      console.log(`${role.padEnd(16)} ${email}  password: ${password}`);
    }

    // The first student gets the short login; the other 39 fill the two groups so dashboards have data.
    const studentPassword = DEMO_PASSWORDS.student;
    const now = new Date();
    const plan = demoPlan({ count: 40 });
    const planned = studentNames(40).map((n, i) => ({
      _id: new mongoose.Types.ObjectId(), name: `${n.first} ${n.last}`, group: plan[i].group,
      email: i === 0 ? `student@${d.loginDomain}` : `student${String(i + 1).padStart(2, '0')}@${d.domain}`,
    }));
    const withActivity = ACTIVITY_SLUGS.includes(d.slug);
    const activity = withActivity ? buildDemoActivity({ students: planned, institutionId: institution._id, now, plan }) : null;
    for (const [i, s] of planned.entries()) {
      await make(s.name, s.email, 'student', studentPassword, { _id: s._id, group: s.group, lastActive: activity ? activity.lastActive[i] : now });
    }
    console.log(`student          student@${d.loginDomain}  password: ${studentPassword}`);
    console.log(`student          student02@${d.domain} .. student40@${d.domain}  password (all 39): ${studentPassword}`);
    console.log('students are split into "Group 1" and "Group 2" (20 each)');

    if (activity) {
      // Checked against the Interview schema, then written through the driver so fields the schema in this
      // branch does not declare yet (responses[].deliveryMetrics) are kept.
      for (const doc of activity.interviews) {
        const err = new Interview(doc).validateSync();
        if (err) throw new Error(`Demo interview is invalid: ${err.message}`);
      }
      await Interview.collection.insertMany(activity.interviews);
      // Also through the driver: Mongoose timestamps would set updatedAt to now, and the dashboard reads
      // updatedAt as "last analysed", which would make every seeded student look active today.
      for (const doc of activity.cvAnalyses) {
        const err = new CVAnalysis(doc).validateSync();
        if (err) throw new Error(`Demo CV analysis is invalid: ${err.message}`);
      }
      await CVAnalysis.collection.insertMany(activity.cvAnalyses);
      const people = new Set(activity.interviews.map((x) => String(x.userId))).size;
      console.log(`demo activity: ${activity.interviews.length} completed mock interviews and ${activity.cvAnalyses.length} CV analyses for ${people} students (marked "Demo data"); ${planned.length - people} students have none`);
    }
  }
  console.log('\nDemo data only. These logins are fixed and public: never use them outside local demos.');
};

if (isMain(import.meta.url)) run(main);
