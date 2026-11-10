// Usage: npm run owner:create-institution -- --name "Example University" --limit 200 \
//          --domains example.edu,students.example.edu --admin-email admin@example.edu --admin-name "Ada Admin"
// Optional: --slug, --ai-cap (monthly AI calls, default 20000), --contract-start/--contract-end (YYYY-MM-DD)
import { parseArgs } from 'node:util';
import { connect, isMain, run, slugify } from './_db.js';

export const parseCreateArgs = (argv) => {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string' }, slug: { type: 'string' }, limit: { type: 'string' }, domains: { type: 'string' },
      'admin-email': { type: 'string' }, 'admin-name': { type: 'string' }, 'ai-cap': { type: 'string' },
      'contract-start': { type: 'string' }, 'contract-end': { type: 'string' },
    },
  });
  const missing = ['name', 'limit', 'admin-email', 'admin-name'].filter((k) => !values[k]);
  if (missing.length) throw new Error(`Missing: ${missing.map((m) => '--' + m).join(', ')}`);
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit < 0) throw new Error('--limit must be a whole number');
  const domains = (values.domains || '').split(',').map((d) => d.trim().toLowerCase().replace(/^@/, '')).filter(Boolean);
  return {
    name: values.name.trim(),
    slug: values.slug ? slugify(values.slug) : slugify(values.name),
    contractedStudentLimit: limit,
    allowedEmailDomains: domains,
    monthlyAiCallCap: values['ai-cap'] ? Number(values['ai-cap']) : undefined,
    contractStart: values['contract-start'] ? new Date(values['contract-start']) : null,
    contractEnd: values['contract-end'] ? new Date(values['contract-end']) : null,
    adminEmail: values['admin-email'].trim().toLowerCase(),
    adminName: values['admin-name'].trim(),
  };
};

const main = async () => {
  const args = parseCreateArgs(process.argv.slice(2));
  await connect();
  const [{ default: Institution }, { default: userModel }, { audit }, tokens, { sendInviteEmail }] = await Promise.all([
    import('../models/Institution.js'), import('../models/User.js'), import('../services/audit.js'),
    import('../services/inviteTokens.js'), import('../modules/people/people.service.js'),
  ]);

  if (await Institution.findOne({ slug: args.slug })) throw new Error(`An institution with slug "${args.slug}" already exists`);
  if (await userModel.findOne({ email: args.adminEmail })) throw new Error('That admin email is already registered');
  if (args.allowedEmailDomains.length && !args.allowedEmailDomains.includes(args.adminEmail.split('@')[1])) {
    throw new Error('The admin email is not on one of the allowed domains');
  }

  const { adminEmail, adminName, ...institutionFields } = args;
  if (institutionFields.monthlyAiCallCap === undefined) delete institutionFields.monthlyAiCallCap;
  const institution = await Institution.create(institutionFields);

  const invite = tokens.createInviteToken();
  const admin = await userModel.create({
    name: adminName, email: adminEmail, role: 'university_admin', institutionId: institution._id,
    status: 'invited', inviteTokenHash: invite.hash, inviteExpiresAt: invite.expiresAt,
  });
  const link = tokens.buildInviteLink(invite.token);
  await audit({ actor: 'owner-script', action: 'institution.create', target: institution._id, institutionId: institution._id, meta: { slug: institution.slug, limit: args.contractedStudentLimit } });
  const emailSent = await sendInviteEmail(institution, admin, link);

  console.log(`Created institution "${institution.name}" (slug: ${institution.slug}, student limit: ${institution.contractedStudentLimit})`);
  console.log(`Administrator: ${admin.name} <${admin.email}>  (invite email ${emailSent ? 'sent' : 'NOT sent, give them the link'})`);
  console.log(`Admin invite link (valid 7 days):\n${link}`);
};

if (isMain(import.meta.url)) run(main);
