import Class from '../models/Class.js';

const classLockQueues = new Map();

/**
 * Serializes async operations per class identity key so concurrent requests
 * cannot race into creating duplicate active class documents.
 */
export async function withClassLock(lockKey, fn) {
  const previous = classLockQueues.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const chained = previous.then(() => current);
  classLockQueues.set(lockKey, chained);

  try {
    await previous;
    return await fn();
  } finally {
    release();
    if (classLockQueues.get(lockKey) === chained) {
      classLockQueues.delete(lockKey);
    }
  }
}

export function stripRomanPrefix(rawName = '') {
  return String(rawName)
    .replace(/^(I|II|III|IV)[\s\-_]+/i, '')
    .trim();
}

export function normalizeSectionKey(rawName = '') {
  return stripRomanPrefix(rawName)
    .toUpperCase()
    .replace(/[\s\-_]+/g, '');
}

export function buildCanonicalClassNameRegex(rawName = '') {
  const cleanSection = stripRomanPrefix(rawName);
  const parts = cleanSection.split(/[\s\-_]+/).filter(Boolean);
  const pattern = parts
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[\\s\\-_]*');
  return new RegExp(`^((I|II|III|IV)[\\s\\-_]+)?${pattern}$`, 'i');
}

export function buildClassLockKey({ departmentId, semester, name }) {
  const deptKey = departmentId ? String(departmentId) : 'any';
  const semKey = Number(semester) || 1;
  return `${deptKey}:${semKey}:${normalizeSectionKey(name)}`;
}

/**
 * Finds an active non-master class matching canonical section name, semester, and optional department.
 */
export async function findActiveMatchingClass({ name, semester, departmentId, excludeClassId, session } = {}) {
  if (!name || !String(name).trim()) return null;

  const query = {
    name: buildCanonicalClassNameRegex(name),
    semester: Number(semester) || 1,
    isMaster: { $ne: true },
    isActive: true,
  };
  if (departmentId) query.departmentId = departmentId;
  if (excludeClassId) query._id = { $ne: excludeClassId };

  const q = Class.findOne(query);
  if (session) q.session(session);
  return q;
}

