const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'db', 'mebel.db');

let db;

function getDb() {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
    db.run('PRAGMA journal_mode = WAL');
    db.run('PRAGMA foreign_keys = ON');
    db.run = promisify(db, 'run');
    db.get = promisify(db, 'get');
    db.all = promisify(db, 'all');
    db.exec = promisify(db, 'exec');
    db.prepare = function(sql) {
      const stmt = sqlite3.Database.prototype.prepare.call(this._db || this, sql);
      return {
        run: (...args) => new Promise((res, rej) => stmt.run(...args, function(err) { err ? rej(err) : res(this); })),
        get: (...args) => new Promise((res, rej) => stmt.get(...args, (err, row) => err ? rej(err) : res(row))),
        all: (...args) => new Promise((res, rej) => stmt.all(...args, (err, rows) => err ? rej(err) : res(rows))),
      };
    };
  }
  return db;
}

function promisify(db, method) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      db[method](...args, function(err, result) {
        if (err) reject(err);
        else resolve(result || this);
      });
    });
  };
}
