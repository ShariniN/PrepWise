// Rules shared by accept-invite, change password and profile updates, so every path accepts the same values.

export const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;
export const PASSWORD_MESSAGE =
  'Password must be at least 6 characters long, include one uppercase letter, one number, and one special character';
export const passwordOk = (pw) => typeof pw === 'string' && PASSWORD_RULE.test(pw);

// Same as the user model: 10 to 15 digits. Spaces, dashes, dots and brackets are allowed as separators and removed.
export const PHONE_RULE = /^\d{10,15}$/;
export const PHONE_MESSAGE = 'Phone number must be 10 to 15 digits (numbers only)';

// Returns the digits-only phone, or null when the value cannot be a valid phone number.
export const normalizePhone = (value) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (!/^[\d\s\-.()]+$/.test(raw)) return null;
  const digits = raw.replace(/\D/g, '');
  return PHONE_RULE.test(digits) ? digits : null;
};
