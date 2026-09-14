import { requireRegisteredWorker } from './registeredUser.service.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Worker from '../models/Worker.js';
import WorkerFaceProfile from '../models/WorkerFaceProfile.js';
import AttendanceSession from '../models/AttendanceSession.js';
import { findEffectiveDeployment } from './deployment.service.js';
import { recordAttendance } from './attendance.service.js';
import { indiaDateString } from './attendance.service.js';
import { badRequest, notFoundError, forbiddenError } from '../../utils/http.js';

export function calculateDefaultPin(mobileNumber) {
  const digits = String(mobileNumber || '').replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : '1234';
}

export async function workerLogin(identifier, pin) {
  const cleanId = String(identifier || '').trim();
  const cleanPin = String(pin || '').trim();

  if (!cleanId || !cleanPin) {
    throw badRequest('Please enter your Worker ID / Mobile and PIN.');
  }

  // Find worker by case-insensitive workerCode or mobile number
  const worker = await Worker.findOne({
    $or: [
      { workerCode: new RegExp(`^${cleanId}$`, 'i') },
      { mobileNumber: cleanId },
    ],
  }).select('+pinHash').populate('firm', 'name code active');

  if (!worker) {
    throw badRequest('Invalid Worker ID or PIN.');
  }

  if (!worker.active) {
    throw forbiddenError('This worker account is inactive. Please contact your farm administrator.');
  }

  await requireRegisteredWorker(worker);

  // Verify PIN
  let pinValid = false;
  if (worker.pinHash) {
    pinValid = await bcrypt.compare(cleanPin, worker.pinHash);
  } else {
    // Default PIN for workers without pinHash (last 4 digits of mobile, or '1234')
    const defaultPin = calculateDefaultPin(worker.mobileNumber);
    if (cleanPin === defaultPin) {
      pinValid = true;
      // Lazily upgrade to bcrypt hash
      worker.pinHash = await bcrypt.hash(cleanPin, 10);
      await worker.save();
    }
  }

  if (!pinValid) {
    throw badRequest('Invalid Worker ID or PIN.');
  }

  const token = jwt.sign(
    {
      sub: String(worker._id),
      role: 'worker',
      workerId: String(worker._id),
      firm: String(worker.firm?._id || worker.firm),
      name: worker.fullName,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return {
    token,
    user: {
      id: String(worker._id),
      name: worker.fullName,
      role: 'worker',
      workerCode: worker.workerCode,
      mobileNumber: worker.mobileNumber,
      firm: worker.firm,
      faceStatus: worker.faceStatus,
    },
  };
}

export async function resolveWorkerForUser(user) {
  if (!user) return null;
  if (user.role === 'worker') {
    return Worker.findById(user._id || user.workerId)
      .populate('firm', 'name code')
      .populate('designation', 'name')
      .lean();
  }

  return Worker.findOne({ userId: user._id })
    .populate('firm', 'name code')
    .populate('designation', 'name')
    .lean();
}

export async function getWorkerSelfProfile(user) {
  const worker = await resolveWorkerForUser(user);
  if (!worker) throw notFoundError('Ask your firm administrator to add your registered account as an attendance worker first.');

  const now = new Date();
  const today = indiaDateString(now);

  const [deployment, todaySession, recentSessions, faceProfile] = await Promise.all([
    findEffectiveDeployment(worker._id, now),
    AttendanceSession.findOne({ worker: worker._id, date: today }).lean(),
    AttendanceSession.find({ worker: worker._id }).sort({ date: -1 }).limit(7).lean(),
    WorkerFaceProfile.findOne({ worker: worker._id, active: true }).lean(),
  ]);

  return {
    worker: {
      id: String(worker._id),
      workerCode: worker.workerCode,
      fullName: worker.fullName,
      isSupervisor: worker.isSupervisor,
      mobileNumber: worker.mobileNumber,
      dateOfJoining: worker.dateOfJoining,
      firm: worker.firm,
      designation: worker.designation,
      faceStatus: worker.faceStatus,
    },
    deployment: deployment ? {
      workLocationName: deployment.workLocationNameSnapshot,
      designationName: deployment.designationNameSnapshot,
      supervisorName: deployment.supervisorNameSnapshot || 'No supervisor assigned',
    } : null,
    todaySession: todaySession ? {
      date: todaySession.date,
      status: todaySession.status,
      dutyIn: todaySession.dutyIn,
      dutyOut: todaySession.dutyOut,
      workedMinutes: todaySession.workedMinutes,
      workedHoursFormatted: todaySession.workedHoursFormatted,
    } : null,
    recentSessions: recentSessions.map((s) => ({
      _id: s._id,
      date: s.date,
      status: s.status,
      dutyIn: s.dutyIn,
      dutyOut: s.dutyOut,
      workedHoursFormatted: s.workedHoursFormatted,
    })),
    hasFace: worker.faceStatus === 'REGISTERED' && Boolean(faceProfile?.descriptor),
    faceDescriptor: faceProfile?.descriptor || null,
  };
}

export async function recordWorkerSelfPunch(user, payload = {}) {
  const worker = await resolveWorkerForUser(user);
  if (!worker) throw badRequest('No worker profile linked to this user account.');

  const workerId = worker._id;
  const liveDescriptor = payload.liveDescriptor || payload.faceDescriptor;
  const eventType = payload.eventType || payload.punchType || 'AUTO';
  const { location } = payload;

  // Face biometrics check: verify liveDescriptor matches worker's enrolled face profile
  if (liveDescriptor) {
    if (!Array.isArray(liveDescriptor) || liveDescriptor.length !== 128) {
      throw badRequest('Invalid live face descriptor received.');
    }

    const faceProfile = await WorkerFaceProfile.findOne({ worker: workerId, active: true }).lean();
    if (!faceProfile?.descriptor) {
      throw badRequest('Face registration required. Please ask your administrator to enrol your face.');
    }

    // Euclidean distance comparison
    let sum = 0;
    for (let i = 0; i < 128; i++) {
      const diff = liveDescriptor[i] - faceProfile.descriptor[i];
      sum += diff * diff;
    }
    const distance = Math.sqrt(sum);

    if (distance > 0.58) {
      throw badRequest(`Face verification mismatch (match score: ${distance.toFixed(2)}). Please look directly into the camera in good lighting.`);
    }
  }

  // Submit through unified attendance transaction
  return recordAttendance(user, {
    workerId: String(workerId),
    eventType,
    source: 'FACE',
    location,
  });
}
