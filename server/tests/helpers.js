// Shared test world: two institutions held in memory. Repositories and the user model are stubbed with
// functions that honour the filters they receive, so a controller that forgets to scope a query
// returns the wrong data and the test fails. No database is used.
process.env.JWT_SECRET = 'test-secret-test-secret-1234';
process.env.NODE_ENV = 'test';
process.env.CLIENT_URL = 'http://localhost:5173';
delete process.env.JDOODLE_CLIENT_ID;
delete process.env.JDOODLE_CLIENT_SECRET;
delete process.env.GROQ_API_KEY;

import { mock } from 'node:test';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

mongoose.set('bufferCommands', false); // an unstubbed model call fails at once instead of hanging

const { default: userModel } = await import('../models/User.js');
const { default: peopleRepo } = await import('../modules/people/people.repo.js');
const { default: complianceRepo } = await import('../modules/compliance/compliance.repo.js');
const { auditRepo } = await import('../services/audit.js');
const { default: transporter } = await import('../config/nodemailer.js');

export { userModel, peopleRepo, complianceRepo, auditRepo, transporter };

export const IDS = {
  instA: 'aaaaaaaaaaaaaaaaaaaaaaaa',
  instB: 'bbbbbbbbbbbbbbbbbbbbbbbb',
};
let counter = 0;
export const newId = () => (++counter).toString(16).padStart(24, '0');

const same = (a, b) => String(a) === String(b);
const SECRET_FIELDS = ['toObject', 'save'];

export const makeWorld = () => {
  const world = {
    institutions: {
      [IDS.instA]: { _id: IDS.instA, name: 'University A', slug: 'a', contractedStudentLimit: 3, allowedEmailDomains: [], status: 'active' },
      [IDS.instB]: { _id: IDS.instB, name: 'University B', slug: 'b', contractedStudentLimit: 3, allowedEmailDomains: [], status: 'active' },
    },
    users: [],
    interviews: [],
    consents: [],
    audit: [],
    mails: [],
    saves: 0,
  };

  world.addUser = (fields) => {
    const u = {
      _id: newId(), name: 'User', status: 'active', role: 'student', isAccountVerified: true,
      password: 'hashed', createdAt: new Date(), ...fields,
      toObject() {
        const copy = { ...this };
        for (const k of SECRET_FIELDS) delete copy[k];
        copy.accountType = this.role === 'student' ? 'Fresher' : this.role;
        return copy;
      },
      async save() { world.saves += 1; return this; },
    };
    world.users.push(u);
    return u;
  };

  world.cookie = (user) => `token=${jwt.sign({ id: user._id, role: user.role, institutionId: user.institutionId }, process.env.JWT_SECRET)}`;

  const inst = (id) => world.institutions[String(id)];
  const students = (institutionId, statuses) =>
    world.users.filter((u) => same(u.institutionId, institutionId) && u.role === 'student' && statuses.includes(u.status)).length;

  world.install = () => {
    mock.method(userModel, 'findById', async (id) => world.users.find((u) => same(u._id, id)) || null);
    mock.method(userModel, 'findOne', async (q) => {
      if (q.email) return world.users.find((u) => u.email === q.email) || null;
      if (q.inviteTokenHash) return world.users.find((u) => u.inviteTokenHash === q.inviteTokenHash) || null;
      return null;
    });

    mock.method(peopleRepo, 'getInstitution', async (id) => inst(id) || null);
    mock.method(peopleRepo, 'findUsers', async (institutionId, { role, status, search, group } = {}) =>
      world.users.filter((u) => same(u.institutionId, institutionId)
        && (!role || u.role === role) && (!status || u.status === status) && (!group || (u.group || '') === group)
        && (!search || `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()))));
    mock.method(peopleRepo, 'countGroups', async (institutionId) => {
      const g = {};
      for (const u of world.users.filter((x) => same(x.institutionId, institutionId))) {
        g[`${u.role}|${u.status}`] = (g[`${u.role}|${u.status}`] || 0) + 1;
      }
      return Object.entries(g).map(([k, count]) => ({ role: k.split('|')[0], status: k.split('|')[1], count }));
    });
    mock.method(peopleRepo, 'countStudentsByStatus', async (institutionId) => ({
      active: students(institutionId, ['active']), invited: students(institutionId, ['invited']),
    }));
    mock.method(peopleRepo, 'countActiveAdmins', async (institutionId) =>
      world.users.filter((u) => same(u.institutionId, institutionId) && u.role === 'university_admin' && u.status === 'active').length);
    mock.method(peopleRepo, 'findByEmail', async (email) => world.users.find((u) => u.email === email) || null);
    mock.method(peopleRepo, 'findByIdInInstitution', async (id, institutionId) =>
      world.users.find((u) => same(u._id, id) && same(u.institutionId, institutionId)) || null);
    mock.method(peopleRepo, 'createUser', async (data) => world.addUser({ ...data, password: undefined }));
    mock.method(peopleRepo, 'deleteUnverified', async (institutionId, id) => {
      const before = world.users.length;
      world.users = world.users.filter((u) => !(same(u._id, id) && same(u.institutionId, institutionId) && u.status === 'unverified'));
      return world.users.length < before;
    });
    // Atomic update in the real repo: no save(), so no pre-save hook and no lastActive bump.
    mock.method(peopleRepo, 'updateGroup', async (institutionId, id, group) => {
      const u = world.users.find((x) => same(x._id, id) && same(x.institutionId, institutionId));
      if (!u) return null;
      u.group = group;
      return u.toObject();
    });
    mock.method(peopleRepo, 'updateAssignedGroups', async (institutionId, id, groups) => {
      const u = world.users.find((x) => same(x._id, id) && same(x.institutionId, institutionId) && x.role === 'lecturer');
      if (!u) return null;
      u.assignedGroups = groups;
      return u.toObject();
    });
    mock.method(peopleRepo, 'distinctStudentGroups', async (institutionId) =>
      [...new Set(world.users.filter((u) => same(u.institutionId, institutionId) && u.role === 'student').map((u) => u.group).filter(Boolean))]);

    mock.method(peopleRepo, 'findUsersByIds', async (institutionId, ids) =>
      world.users.filter((u) => same(u.institutionId, institutionId) && ids.some((i) => same(i, u._id))));

    mock.method(complianceRepo, 'findUser', async (id) => world.users.find((u) => same(u._id, id)) || null);
    mock.method(complianceRepo, 'collect', async (userId) => ({
      interviews: world.interviews.filter((i) => same(i.userId, userId)),
      analyses: [], skills: [],
      consents: world.consents.filter((c) => same(c.userId, userId)),
    }));
    mock.method(complianceRepo, 'deleteAll', async (userId) => {
      const before = { interviews: world.interviews.length, consents: world.consents.length };
      world.interviews = world.interviews.filter((i) => !same(i.userId, userId));
      world.consents = world.consents.filter((c) => !same(c.userId, userId));
      world.users = world.users.filter((u) => !same(u._id, userId));
      return {
        interviews: before.interviews - world.interviews.length, consents: before.consents - world.consents.length,
      };
    });
    mock.method(complianceRepo, 'addConsent', async (d) => { world.consents.push(d); return d; });

    mock.method(auditRepo, 'create', async (d) => { world.audit.push(d); });
    mock.method(transporter, 'sendMail', async (m) => { world.mails.push(m); return {}; });
  };

  return world;
};
