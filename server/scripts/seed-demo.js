// Creates two fake universities for demos and tests. Fake data only, no real CVs, no AI calls.
// Usage: npm run seed:demo            (refuses to run when NODE_ENV=production)
//        npm run seed:demo -- --reset (deletes the two demo institutions and everything in them first)
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connect, isMain, run } from './_db.js';

const FIRST = ['Amara', 'Ben', 'Chloe', 'Dev', 'Elena', 'Farid', 'Grace', 'Hiro', 'Isla', 'Jonas', 'Kavya', 'Liam', 'Maya', 'Noah', 'Olu', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara'];
const LAST = ['Adams', 'Brooks', 'Chen', 'Dias', 'Evans', 'Fox', 'Gupta', 'Hughes', 'Ito', 'Jones'];

export const DEMOS = [
  { name: 'Demo University A', slug: 'demo-a', domain: 'demo-a.test', limit: 60 },
  { name: 'Demo University B', slug: 'demo-b', domain: 'demo-b.test', limit: 45 },
];

// Meets the password rule (upper case, digit, symbol). Random, demo only.
export const randomPassword = () => `Aa1!${crypto.randomBytes(6).toString('base64url')}`;

export const studentNames = (n) =>
  Array.from({ length: n }, (_, i) => ({ first: FIRST[i % FIRST.length], last: LAST[Math.floor(i / FIRST.length) % LAST.length] }));

const main = async () => {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo data: NODE_ENV is production.');
    process.exitCode = 1;
    return;
  }
  await connect();
  const [{ default: Institution }, { default: userModel }, { default: Course }, { default: Cohort }, { default: Enrollment }] = await Promise.all([
    import('../models/Institution.js'), import('../models/userModel.js'), import('../models/Course.js'),
    import('../models/Cohort.js'), import('../models/Enrollment.js'),
  ]);

  const reset = process.argv.includes('--reset');
  for (const d of DEMOS) {
    const existing = await Institution.findOne({ slug: d.slug });
    if (existing && !reset) throw new Error(`${d.slug} already exists. Re-run with --reset to replace the demo data.`);
    if (existing) {
      const id = existing._id;
      await Promise.all([userModel.deleteMany({ institutionId: id }), Course.deleteMany({ institutionId: id }),
        Cohort.deleteMany({ institutionId: id }), Enrollment.deleteMany({ institutionId: id })]);
      await Institution.deleteOne({ _id: id });
    }
  }

  for (const d of DEMOS) {
    const institution = await Institution.create({
      name: d.name, slug: d.slug, contractedStudentLimit: d.limit, allowedEmailDomains: [d.domain],
      contractStart: new Date(), contractEnd: new Date(Date.now() + 365 * 24 * 3600 * 1000),
    });
    console.log(`\n=== ${d.name} (slug ${d.slug}, student limit ${d.limit}) ===`);

    const make = async (name, email, role, password) => userModel.create({
      name, email, role, institutionId: institution._id, status: 'active', isAccountVerified: true,
      password: await bcrypt.hash(password, 10),
    });

    const staff = [];
    for (const [name, local, role] of [
      ['Dana Admin', 'admin', 'university_admin'], ['Leo Lecturer', 'lecturer1', 'lecturer'],
      ['Lena Lecturer', 'lecturer2', 'lecturer'], ['Cara Careers', 'careers', 'career_officer'],
    ]) {
      const password = randomPassword();
      staff.push(await make(name, `${local}@${d.domain}`, role, password));
      console.log(`${role.padEnd(16)} ${local}@${d.domain}  password: ${password}`);
    }

    const studentPassword = randomPassword();
    const students = [];
    for (const [i, n] of studentNames(40).entries()) {
      students.push(await make(`${n.first} ${n.last}`, `student${String(i + 1).padStart(2, '0')}@${d.domain}`, 'student', studentPassword));
    }
    console.log(`student          student01@${d.domain} .. student40@${d.domain}  password (all 40): ${studentPassword}`);

    const course = await Course.create({
      institutionId: institution._id, code: 'CS101', title: 'Introduction to Programming', ownerId: staff[1]._id,
    });
    await Enrollment.create({ institutionId: institution._id, userId: staff[2]._id, kind: 'lecturer', courseId: course._id });
    for (const [idx, name] of ['Group 1', 'Group 2'].entries()) {
      const cohort = await Cohort.create({ institutionId: institution._id, courseId: course._id, name });
      await Enrollment.insertMany(students.filter((_, i) => i % 2 === idx).map((s) => ({
        institutionId: institution._id, userId: s._id, kind: 'student', courseId: course._id, cohortId: cohort._id,
      })));
    }
    console.log(`course CS101 with cohorts "Group 1" and "Group 2" (20 students each)`);
  }
  console.log('\nDemo data only. These passwords are random and printed once.');
};

if (isMain(import.meta.url)) run(main);
