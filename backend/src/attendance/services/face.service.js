import mongoose from 'mongoose';
import { requireRegisteredWorker } from './registeredUser.service.js';
import Worker from '../models/Worker.js';
import WorkerFaceProfile from '../models/WorkerFaceProfile.js';
import { firmScope } from '../authorization.js';
import { objectId } from '../validation.js';
import { badRequest, notFoundError, forbiddenError } from '../../utils/http.js';

export function validateDescriptor(descriptor) {
  if (!Array.isArray(descriptor)) {
    throw badRequest('Face descriptor must be an array.');
  }
  if (descriptor.length !== 128) {
    throw badRequest(`Face descriptor must contain exactly 128 numbers (received ${descriptor.length}).`);
  }
  const allFinite = descriptor.every((val) => typeof val === 'number' && Number.isFinite(val));
  if (!allFinite) {
    throw badRequest('Face descriptor contains invalid or non-finite numbers.');
  }
}

export function euclideanDistance(arrA, arrB) {
  if (!Array.isArray(arrA) || !Array.isArray(arrB) || arrA.length !== arrB.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < arrA.length; i++) {
    const diff = arrA[i] - arrB[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

export async function enrolWorkerFace(user, workerId, payload = {}) {
  const workerObjectId = objectId(workerId, 'Worker');
  const worker = await Worker.findById(workerObjectId);
  if (!worker) throw notFoundError('Worker not found.');

  const scope = firmScope(user, worker.firm);
  if (!scope) throw forbiddenError('You do not have access to this worker’s firm.');

  if (!worker.active) {
    throw badRequest(`Worker ${worker.fullName} (${worker.workerCode}) is inactive. Inactive workers cannot be registered for face recognition.`);
  }

  await requireRegisteredWorker(worker);

  const { descriptor, descriptorVersion = 'v1', quality = {} } = payload;
  validateDescriptor(descriptor);

  // Verify face duplicacy: Ensure this face descriptor does not match any other enrolled worker
  let existingProfiles = [];
  if (mongoose.connection.readyState === 1) {
    existingProfiles = await WorkerFaceProfile.find({
      worker: { $ne: worker._id },
      active: true,
    })
      .populate({
        path: 'worker',
        select: 'fullName workerCode active firm',
        populate: { path: 'firm', select: 'name' },
      })
      .lean();
  }

  if (Array.isArray(existingProfiles)) {
    for (const profile of existingProfiles) {
      if (!profile.descriptor || profile.descriptor.length !== 128) continue;
      if (!profile.worker || !profile.worker.active) continue;

      const dist = euclideanDistance(descriptor, profile.descriptor);
      // Distance <= 0.42 strictly matches the same person
      if (dist <= 0.42) {
        const otherWorker = profile.worker;
        const firmLabel = otherWorker.firm?.name ? ` in ${otherWorker.firm.name}` : '';
        throw badRequest(
          `Duplicate face detected! This face is already enrolled for worker "${otherWorker.fullName}" (${otherWorker.workerCode})${firmLabel}. Multiple workers cannot share the same face.`
        );
      }
    }
  }

  const profile = await WorkerFaceProfile.findOneAndUpdate(
    { worker: worker._id },
    {
      worker: worker._id,
      firm: worker.firm,
      descriptor,
      descriptorVersion,
      quality: {
        score: typeof quality.score === 'number' ? quality.score : 1,
        faceBox: quality.faceBox || {},
      },
      active: true,
      registeredBy: user._id,
      registeredAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  worker.faceStatus = 'REGISTERED';
  await worker.save();

  return {
    message: `Face registered successfully for ${worker.fullName} (${worker.workerCode}).`,
    faceStatus: worker.faceStatus,
    profileId: profile._id,
  };
}

export async function deleteWorkerFaceProfile(user, workerId) {
  const workerObjectId = objectId(workerId, 'Worker');
  const worker = await Worker.findById(workerObjectId);
  if (!worker) throw notFoundError('Worker not found.');

  const scope = firmScope(user, worker.firm);
  if (!scope) throw forbiddenError('You do not have access to this worker’s firm.');

  await WorkerFaceProfile.deleteOne({ worker: worker._id });

  worker.faceStatus = 'NOT_REGISTERED';
  await worker.save();

  return {
    message: `Face registration cleared for ${worker.fullName}.`,
    faceStatus: worker.faceStatus,
  };
}

export async function listFirmFaceDescriptors(user, query = {}) {
  const filter = { ...firmScope(user, query.firmId), active: true };

  const profiles = await WorkerFaceProfile.find(filter)
    .populate({
      path: 'worker',
      select: 'workerCode fullName isSupervisor active',
    })
    .lean();

  const descriptors = profiles
    .filter((p) => p.worker && p.worker.active)
    .map((p) => ({
      workerId: p.worker._id,
      workerCode: p.worker.workerCode,
      fullName: p.worker.fullName,
      isSupervisor: p.worker.isSupervisor,
      descriptor: p.descriptor,
    }));

  return {
    firmId: query.firmId || null,
    total: descriptors.length,
    descriptors,
  };
}

