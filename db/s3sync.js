// Синхронизация базы SQLite с объектным хранилищем S3 (Timeweb).
// На старте — скачиваем актуальную базу из S3.
// При изменениях (заявки, правки в админке) — выгружаем свежую копию обратно.
// Если S3 не настроен или недоступен — приложение продолжает работать на локальной базе
// (просто без сохранения между редеплоями). S3-ошибки никогда не роняют сервер.

const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DB_PATH = path.join(DATA_DIR, 'db', 'mebel.db');
const KEY = process.env.S3_DB_KEY || 'db/mebel.db';

let enabled = false;
let client = null;
let bucket = null;
let dirty = false;
let uploading = false;
let getDbRef = null;
let debounce = null;

function init() {
  const ak = process.env.S3_ACCESS_KEY;
  const sk = process.env.S3_SECRET_KEY;
  bucket = process.env.S3_BUCKET || 'rt-mebel';
  if (!ak || !sk) {
    console.warn('⚠️  S3 не настроен (нет ключей) — база только локальная, при редеплое сбросится.');
    return false;
  }
  const { S3Client } = require('@aws-sdk/client-s3');
  client = new S3Client({
    region: process.env.S3_REGION || 'ru-1',
    endpoint: process.env.S3_ENDPOINT || 'https://s3.twcstorage.ru',
    credentials: { accessKeyId: ak, secretAccessKey: sk },
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
  });
  enabled = true;
  return true;
}

function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

// Скачать базу из S3 ДО открытия её приложением
async function restoreOnBoot() {
  if (!init()) return;
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: KEY }));
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(DB_PATH + ext); } catch (e) {} }
    const bytes = await streamToBuffer(res.Body);
    fs.writeFileSync(DB_PATH, bytes);
    console.log('✅ База восстановлена из S3 (' + bytes.length + ' байт)');
  } catch (e) {
    const code = e && (e.name || e.Code);
    if (code === 'NoSuchKey' || (e && e.$metadata && e.$metadata.httpStatusCode === 404)) {
      console.log('ℹ️  В S3 ещё нет резервной базы — стартуем с чистой, выгрузим после первых изменений.');
    } else {
      console.warn('⚠️  Не удалось скачать базу из S3:', code || (e && e.message));
    }
  }
}

function start(getDb) {
  getDbRef = getDb;
  if (!enabled) return;
  setInterval(() => { if (dirty) upload(); }, 30000);
  // авто-снимок раз в 6 часов (если были изменения)
  setInterval(() => { createSnapshot('авто').catch(() => {}); }, 6 * 60 * 60 * 1000);
}

function markDirty() {
  if (!enabled) return;
  dirty = true;
  clearTimeout(debounce);
  debounce = setTimeout(() => upload(), 3000);
}

async function upload() {
  if (!enabled || uploading) return;
  uploading = true;
  dirty = false;
  try {
    try { if (getDbRef) getDbRef().pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    const body = fs.readFileSync(DB_PATH);
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: KEY, Body: body, ContentType: 'application/octet-stream',
    }));
  } catch (e) {
    console.warn('⚠️  Не удалось выгрузить базу в S3:', e && (e.name || e.message));
    dirty = true;
  } finally {
    uploading = false;
  }
}

const SNAP_PREFIX = 'db/snapshots/';
const SNAP_KEEP = 20;

function isEnabled() { return enabled; }

// Создать снимок (бэкап) текущей базы
async function createSnapshot(label) {
  if (!enabled) throw new Error('S3 не настроен');
  try { if (getDbRef) getDbRef().pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
  const { PutObjectCommand } = require('@aws-sdk/client-s3');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const key = SNAP_PREFIX + 'mebel-' + ts + '.db';
  const body = fs.readFileSync(DB_PATH);
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: key, Body: body, ContentType: 'application/octet-stream',
    Metadata: label ? { label: encodeURIComponent(label) } : undefined,
  }));
  await pruneSnapshots();
  return { key, size: body.length };
}

// Список снимков
async function listSnapshots() {
  if (!enabled) return [];
  const { ListObjectsV2Command } = require('@aws-sdk/client-s3');
  const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: SNAP_PREFIX }));
  const items = (out.Contents || []).map(o => ({
    key: o.Key,
    size: o.Size,
    date: o.LastModified ? new Date(o.LastModified).toISOString() : '',
  }));
  items.sort((a, b) => (a.date < b.date ? 1 : -1)); // новые сверху
  return items;
}

async function pruneSnapshots() {
  try {
    const items = await listSnapshots();
    if (items.length <= SNAP_KEEP) return;
    const { DeleteObjectCommand } = require('@aws-sdk/client-s3');
    for (const old of items.slice(SNAP_KEEP)) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: old.key }));
    }
  } catch (e) {}
}

// Восстановить базу из снимка (откат)
async function restoreSnapshot(key) {
  if (!enabled) throw new Error('S3 не настроен');
  if (!key || key.indexOf(SNAP_PREFIX) !== 0) throw new Error('Неверный снимок');
  const { GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
  const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await streamToBuffer(res.Body);
  // переоткрыть базу с восстановленным файлом
  const initMod = require('./init');
  if (initMod.closeDb) initMod.closeDb();
  fs.writeFileSync(DB_PATH, bytes);
  if (initMod.reopenDb) initMod.reopenDb();
  // сразу сделать восстановленное состояние «живым» в S3
  await client.send(new PutObjectCommand({
    Bucket: bucket, Key: KEY, Body: bytes, ContentType: 'application/octet-stream',
  }));
  dirty = false;
  return { restored: bytes.length };
}

module.exports = { restoreOnBoot, start, markDirty, upload, isEnabled, createSnapshot, listSnapshots, restoreSnapshot };
