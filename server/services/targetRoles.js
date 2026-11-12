// Helpers for an institution's target roles (the job roles students practise for).

export const findTargetRole = (institution, id) => {
  if (!institution || !id || !Array.isArray(institution.targetRoles)) return null;
  const wanted = String(id);
  return institution.targetRoles.find((r) => String(r._id) === wanted) || null;
};

// A role written the way a job description is, so the same scoring and question code can use it.
export const roleAsJobDescription = (role) =>
  `${role.title}\n\n${role.description}\n\nKey skills: ${(role.skills || []).join(', ')}`;
