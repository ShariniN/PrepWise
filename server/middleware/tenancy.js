import { AsyncLocalStorage } from 'node:async_hooks';

// Carries the caller's institution to code that has no access to req (for example the AI service).
const tenantStore = new AsyncLocalStorage();

export const runWithTenant = (institutionId, fn) => tenantStore.run({ institutionId: institutionId ? String(institutionId) : null }, fn);
export const currentInstitutionId = () => tenantStore.getStore()?.institutionId || null;

export class TenantError extends Error {
  constructor(message = 'No institution on this account') {
    super(message);
    this.name = 'TenantError';
    this.status = 403;
  }
}

// Every query for institution-owned data must start from scoped(req). It fails closed:
// a request without an institution can never produce an unscoped filter.
export const scoped = (req, extra = {}) => {
  const institutionId = req?.user?.institutionId;
  if (!institutionId) throw new TenantError();
  return { ...extra, institutionId };
};

export const institutionOf = (req) => scoped(req).institutionId;
