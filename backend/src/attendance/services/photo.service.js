import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Worker from '../models/Worker.js';
import { firmScope } from '../authorization.js';
import { objectId } from '../validation.js';
import { badRequest, notFoundError } from '../../utils/http.js';

export function photoMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > 2 * 1024 * 1024) throw badRequest('Choose a JPEG, PNG or WebP photo up to 2 MB.');
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && buffer.toString('ascii', 12, 16) === 'IHDR') return 'image/png';
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255 && buffer.at(-2) === 255 && buffer.at(-1) === 217) return 'image/jpeg';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  throw badRequest('The file is not a supported photo. Choose JPEG, PNG or WebP.');
}

function photoPath(key) {
  if (!/^[a-f0-9-]{36}$/.test(key || '')) throw notFoundError('Worker photo not found.');
  const root = process.env.ATTENDANCE_PHOTO_DIR || fileURLToPath(new URL('../../../uploads/attendance/', import.meta.url));
  return path.resolve(root, key);
}

async function photoWorker(user, id) {
  const worker = await Worker.findOne({ _id: objectId(id, 'Worker'), ...firmScope(user) }).select('+photographFile');
  if (!worker) throw notFoundError('Worker not found.');
  return worker;
}

export async function saveWorkerPhoto(user, id, buffer) {
  const worker = await photoWorker(user, id);
  const mimeType = photoMime(buffer);
  const key = randomUUID();
  const filename = photoPath(key);
  const previous = worker.photographFile?.key;
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, buffer, { flag: 'wx' });
  try {
    worker.photographFile = { key, mimeType };
    worker.hasPhotograph = true;
    await worker.save();
  } catch (error) {
    await unlink(filename).catch(() => {});
    throw error;
  }
  if (previous) await unlink(photoPath(previous)).catch(() => {});
  return { message: 'Worker photo saved.', hasPhotograph: true };
}

export async function getWorkerPhoto(user, id) {
  const worker = await photoWorker(user, id);
  if (!worker.photographFile?.key) throw notFoundError('Worker photo not found.');
  return { filename: photoPath(worker.photographFile.key), mimeType: worker.photographFile.mimeType };
}
