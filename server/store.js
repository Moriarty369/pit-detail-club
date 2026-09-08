import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createState } from '../src/domain.js';

export function openStore(filename = ':memory:') {
  if (filename !== ':memory:') mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer','admin')), password_hash TEXT NOT NULL,
      member TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      scope TEXT NOT NULL CHECK(scope IN ('customer','admin')), expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
      customer_id TEXT, details TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);`);
  db.prepare('INSERT OR IGNORE INTO settings VALUES (?, ?)').run('rules', JSON.stringify(createState().rules));
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const rules = () => JSON.parse(db.prepare('SELECT value FROM settings WHERE key = ?').get('rules').value);
  function member(id) {
    const user = db.prepare("SELECT member FROM users WHERE id = ? AND role = 'customer'").get(id);
    return user ? { ...JSON.parse(user.member), rules: rules() } : null;
  }
  function saveMember(state) { db.prepare('UPDATE users SET member = ?, name = ? WHERE id = ?').run(JSON.stringify(state), state.customer.name, state.customer.id); }
  function audit(actorId, action, customerId, details = {}) {
    db.prepare('INSERT INTO audit VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), actorId, action, customerId, JSON.stringify(details), new Date().toISOString());
  }
  function addUser({ email, name, role = 'customer', passwordHash, marketing = false }) {
    const id = randomUUID();
    const state = role === 'customer' ? {
      ...createState(), customer: { id, name, email, vehicle: '', marketing }, entries: [], redemptions: [],
    } : null;
    db.prepare('INSERT INTO users VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, email, name, role, passwordHash, state ? JSON.stringify(state) : null, new Date().toISOString());
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }
  return { db, transaction, rules, member, saveMember, audit, addUser, close: () => db.close() };
}
