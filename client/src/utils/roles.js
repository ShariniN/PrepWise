export const ROLES = {
  STUDENT: 'student',
  LECTURER: 'lecturer',
  CAREER_OFFICER: 'career_officer',
  ADMIN: 'university_admin',
};

export const STAFF_ROLES = [ROLES.LECTURER, ROLES.CAREER_OFFICER];

// Roles that may author questions (the career officer cannot).
export const QUESTION_ROLES = [ROLES.LECTURER, ROLES.ADMIN];

// Phase 3B screens.
export const GRADING_ROLES = [ROLES.LECTURER, ROLES.ADMIN];
export const CAREER_ROLES = [ROLES.CAREER_OFFICER, ROLES.ADMIN];

// Phase 3A: assessments and the integrity review queue.
export const ASSESSMENT_ROLES = [ROLES.LECTURER, ROLES.ADMIN];
export const INTEGRITY_ROLES = [ROLES.LECTURER, ROLES.ADMIN];

export const ROLE_LABELS = {
  student: 'Student',
  lecturer: 'Lecturer',
  career_officer: 'Career officer',
  university_admin: 'University admin',
};

export const homeForRole = (role) => {
  switch (role) {
    case ROLES.ADMIN:
      return '/manage-people';
    case ROLES.LECTURER:
    case ROLES.CAREER_OFFICER:
      return '/staff';
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
