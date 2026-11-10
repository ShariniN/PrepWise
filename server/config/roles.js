// The only roles PrepWise knows. Anything else stored on a user (for example the removed 'career_officer')
// is treated as "no access": login is refused and every authenticated route answers 403.
export const ROLES = ['student', 'lecturer', 'university_admin'];

export const isKnownRole = (role) => ROLES.includes(role);
