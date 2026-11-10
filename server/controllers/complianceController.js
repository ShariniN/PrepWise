import bcrypt from 'bcryptjs';
import complianceRepo from '../repositories/complianceRepo.js';
import peopleRepo from '../repositories/peopleRepo.js';
import { CONSENT_TYPES } from '../models/ConsentRecord.js';
import { audit } from '../services/audit.js';

const profileOf = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  phoneNumber: u.phoneNumber || null,
  role: u.role,
  status: u.status,
  institutionId: String(u.institutionId),
  isAccountVerified: !!u.isAccountVerified,
  createdAt: u.createdAt || null,
  lastActive: u.lastActive || null,
  currentCV: u.currentCV
    ? { fileName: u.currentCV.fileName || '', uploadedAt: u.currentCV.uploadedAt || null, text: u.currentCV.text || '' }
    : null,
});

// Own data only. The profile is built from a whitelist so password, OTPs and invite tokens never leave.
export const exportMyData = async (req, res) => {
  const user = await complianceRepo.findUser(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const data = await complianceRepo.collect(user._id);
  await audit({ actor: user._id, action: 'user.export', target: user._id, institutionId: user.institutionId });
  res.setHeader('Content-Disposition', 'attachment; filename="prepwise-my-data.json"');
  res.json({ exportedAt: new Date().toISOString(), profile: profileOf(user), ...data });
};

export const deleteMyAccount = async (req, res) => {
  const password = req.body?.password;
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ success: false, message: 'Password confirmation is required' });
  }
  const user = await complianceRepo.findUser(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  if (!user.password || !(await bcrypt.compare(password, user.password))) {
    return res.status(403).json({ success: false, message: 'Password is incorrect' });
  }
  if (user.role === 'university_admin' && (await peopleRepo.countActiveAdmins(user.institutionId)) <= 1) {
    return res.status(409).json({ success: false, message: 'You are the only administrator. Invite another administrator before deleting your account.' });
  }

  // Written first, and it holds ids only, so it survives the deletion without keeping personal data.
  await audit({ actor: user._id, action: 'user.delete', target: user._id, institutionId: user.institutionId, meta: { role: user.role } });
  const deleted = await complianceRepo.deleteAll(user._id);
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
  });
  res.json({ success: true, message: 'Your account and data have been deleted', deleted });
};

export const recordConsent = async (req, res) => {
  const { type, version } = req.body || {};
  if (!CONSENT_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `type must be one of: ${CONSENT_TYPES.join(', ')}` });
  }
  if (typeof version !== 'string' || !version.trim() || version.length > 40) {
    return res.status(400).json({ success: false, message: 'version is required' });
  }
  const record = await complianceRepo.addConsent({
    userId: req.user.id, institutionId: req.user.institutionId, type, version: version.trim(), acceptedAt: new Date(),
  });
  res.status(201).json({ success: true, consent: { type: record.type, version: record.version, acceptedAt: record.acceptedAt } });
};

// Static, and deliberately honest: 'in_use' means the code in this repository calls it today.
export const SUBPROCESSORS = [
  { name: 'MongoDB Atlas', purpose: 'Database for all accounts and results', status: 'in_use', data: 'All application data', note: 'Region must be chosen to match the university contract' },
  { name: 'Google Gemini API', purpose: 'AI interview questions, feedback and CV analysis', status: 'in_use', data: 'CV text, job descriptions, interview answers and code' },
  { name: 'Google (Gmail SMTP)', purpose: 'Sending invitations and verification emails', status: 'in_use', data: 'Email address, name' },
  { name: 'JDoodle', purpose: 'Running candidate code', status: 'in_use', data: 'Submitted code' },
  { name: 'Judge0', purpose: 'Running candidate code (replaces JDoodle in Phase 2)', status: 'planned', data: 'Submitted code' },
  { name: 'AssemblyAI', purpose: 'Speech-to-text for spoken interview answers', status: 'in_use', data: 'Audio recordings; only when the student uses voice answers and a key is configured' },
  { name: 'Vercel', purpose: 'Hosting the web app and API', status: 'planned', data: 'All traffic', note: 'Not deployed from this repository yet' },
  { name: 'Cloudflare', purpose: 'DNS', status: 'planned', data: 'Traffic metadata', note: 'Not used by the code yet' },
];

export const subprocessors = (req, res) => {
  res.json({ success: true, updated: '2026-11-07', subprocessors: SUBPROCESSORS });
};
