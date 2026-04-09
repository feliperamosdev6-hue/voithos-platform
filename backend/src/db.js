const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'app.db');
const db = new sqlite3.Database(dbPath);

const run = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function onRun(err) {
    if (err) return reject(err);
    resolve({ id: this.lastID, changes: this.changes });
  });
});

const get = (sql, params = []) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => {
    if (err) return reject(err);
    resolve(row || null);
  });
});

const all = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) return reject(err);
    resolve(rows || []);
  });
});

const initDb = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prontuario TEXT UNIQUE,
      nome TEXT NOT NULL,
      cpf TEXT,
      data_nascimento TEXT,
      telefone TEXT,
      email TEXT,
      endereco TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nome TEXT NOT NULL,
      login TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      tipo TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);

    db.get('SELECT COUNT(1) AS total FROM users', (err, row) => {
      if (err) return;
      if (!row || row.total === 0) {
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('admin', 10);
        db.run(
          'INSERT INTO users (nome, login, senha_hash, tipo, created_at) VALUES (?, ?, ?, ?, ?)',
          ['Administrador', 'admin', hash, 'admin', new Date().toISOString()]
        );
      }
    });
  });
};

module.exports = { db, initDb, run, get, all };
