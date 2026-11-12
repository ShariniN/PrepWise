import Institution from '../../models/Institution.js';
import userModel from '../../models/User.js';

// Every function is keyed by the caller's institutionId. The roles live inside the institution document,
// so each role change targets one role by its _id and cannot touch another institution.
const institutionRepo = {
  getInstitution: (id) => Institution.findById(id).lean(),

  updateSettings: (id, patch) =>
    Institution.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean(),

  addTargetRole: (id, role) =>
    Institution.findByIdAndUpdate(id, { $push: { targetRoles: role } }, { new: true, runValidators: true }).lean(),

  updateTargetRole: (id, roleId, fields) => {
    const set = {};
    for (const [key, value] of Object.entries(fields)) set[`targetRoles.$.${key}`] = value;
    return Institution.findOneAndUpdate(
      { _id: id, 'targetRoles._id': roleId },
      { $set: set },
      { new: true, runValidators: true }
    ).lean();
  },

  // Null when the role does not exist or is the only one left (`targetRoles.1` exists only with two or more roles).
  // Decided in the same atomic update, so two admins cannot delete the last two roles at once.
  deleteTargetRole: (id, roleId) =>
    Institution.findOneAndUpdate(
      { _id: id, 'targetRoles._id': roleId, 'targetRoles.1': { $exists: true } },
      { $pull: { targetRoles: { _id: roleId } } },
      { new: true }
    ).lean(),

  clearTargetRole: (institutionId, roleId) =>
    userModel.updateMany({ institutionId, targetRoleId: roleId }, { $set: { targetRoleId: null } }),

  // Atomic update instead of save(): the user pre-save hook would bump lastActive, which the lecturer dashboard
  // reads as student activity.
  setStudentTargetRole: (institutionId, userId, roleId) =>
    userModel.updateOne({ _id: userId, institutionId, role: 'student' }, { $set: { targetRoleId: roleId } }),
};

export default institutionRepo;
