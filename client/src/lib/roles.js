export const ROLES = {
  STUDENT: 'student',
  LECTURER: 'lecturer',
  ADMIN: 'university_admin',
};

// The dashboard (/dashboard and the student pages under it): lecturers see their groups, admins the whole university.
export const STAFF_ROLES = [ROLES.LECTURER, ROLES.ADMIN];

export const ROLE_LABELS = {
  student: 'Student',
  lecturer: 'Lecturer',
  university_admin: 'University admin',
};

export const homeForRole = (role) => {
  switch (role) {
    case ROLES.ADMIN:
      return '/manage-people';
    case ROLES.LECTURER:
      return '/dashboard';
    default:
      return '/fresher-dashboard';
  }
};

export const PASSWORD_RULES = [
  { label: 'At least 6 characters', test: (p) => p.length >= 6 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One number', test: (p) => /[0-9]/.test(p) },
  { label: 'One special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

// Same rules as the server. Returns the labels of the rules that fail.
export const passwordProblems = (pw) => PASSWORD_RULES.filter((r) => !r.test(pw)).map((r) => r.label);
