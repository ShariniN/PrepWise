import userModel from '../../models/User.js';
import Institution from '../../models/Institution.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PUBLIC_FIELDS = 'name email role status group assignedGroups isAccountVerified lastActive createdAt inviteExpiresAt';

// Every function that takes institutionId filters by it. Controllers must pass req.user.institutionId.
const peopleRepo = {
  getInstitution: (id) => Institution.findById(id),

  findUsers: (institutionId, { role, status, search, group } = {}, limit = 1000) => {
    const q = { institutionId };
    if (role) q.role = role;
    if (status) q.status = status;
    if (group) q.group = group;
    if (search) {
      const rx = new RegExp(escapeRegex(search), 'i');
      q.$or = [{ name: rx }, { email: rx }];
    }
    return userModel.find(q).select(PUBLIC_FIELDS).sort({ createdAt: -1 }).limit(limit).lean();
  },

  // [{ role, status, count }]
  countGroups: async (institutionId) => {
    const rows = await userModel.aggregate([
      { $match: { institutionId } },
      { $group: { _id: { role: '$role', status: '$status' }, count: { $sum: 1 } } },
    ]);
    return rows.map((r) => ({ role: r._id.role, status: r._id.status, count: r.count }));
  },

  // { active, invited } students. Both count against the contract.
  countStudentsByStatus: async (institutionId) => {
    const [active, invited] = await Promise.all([
      userModel.countDocuments({ institutionId, role: 'student', status: 'active' }),
      userModel.countDocuments({ institutionId, role: 'student', status: 'invited' }),
    ]);
    return { active, invited };
  },

  countActiveAdmins: (institutionId) =>
    userModel.countDocuments({ institutionId, role: 'university_admin', status: 'active' }),

  findUsersByIds: (institutionId, ids) =>
    userModel.find({ institutionId, _id: { $in: ids } }).select('name email role status group').lean(),

  findByEmail: (email) => userModel.findOne({ email }),
  findByIdInInstitution: (id, institutionId) => userModel.findOne({ _id: id, institutionId }),
  createUser: (data) => userModel.create(data),
  // Atomic update instead of save(): the user pre-save hook would bump lastActive, and the lecturer dashboard
  // reads lastActive as student activity, so an admin assigning groups must not make students look active.
  updateGroup: (institutionId, id, group) =>
    userModel.findOneAndUpdate({ _id: id, institutionId }, { $set: { group } }, { new: true, runValidators: true }).select(PUBLIC_FIELDS).lean(),
  // Same reason: a lecturer's activity is not changed by an admin assigning their groups. `groups` is already cleaned.
  updateAssignedGroups: (institutionId, id, groups) =>
    userModel.findOneAndUpdate({ _id: id, institutionId, role: 'lecturer' }, { $set: { assignedGroups: groups } }, { new: true, runValidators: true })
      .select(PUBLIC_FIELDS).lean(),

  // Distinct non-empty groups of the institution's students (any status), for assigning lecturers.
  distinctStudentGroups: async (institutionId) =>
    (await userModel.distinct('group', { institutionId, role: 'student' })).filter((g) => typeof g === 'string' && g.trim()),
};

export default peopleRepo;
