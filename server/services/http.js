// Small request helpers shared by controllers.
export const isId = (v) => /^[a-f\d]{24}$/i.test(String(v));
export const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });

export const intParam = (v, def, min, max) => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.floor(n)));
};
