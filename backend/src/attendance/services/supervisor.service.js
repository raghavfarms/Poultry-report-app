import Worker from '../models/Worker.js';
import WorkerDeployment from '../models/WorkerDeployment.js';
import AttendanceSession from '../models/AttendanceSession.js';
import { requireRegisteredWorker } from './registeredUser.service.js';
import { firmScope } from '../authorization.js';
import { dateOnly, objectId } from '../validation.js';
import { forbiddenError } from '../../utils/http.js';

export async function supervisorIdentity(user) {
  const supervisor = await Worker.findOne({
    ...(user.role === 'worker' ? { _id: user._id } : { userId: user._id }),
    active: true, isSupervisor: true,
  }).lean();
  if (!supervisor) throw forbiddenError('Supervisor access is required.');
  await requireRegisteredWorker(supervisor);
  return supervisor;
}

export function assertSupervisedDeployment(supervisor, worker, deployment) {
  if (String(supervisor._id) === String(worker._id) ||
      String(deployment.supervisor) !== String(supervisor._id) ||
      String(deployment.firm) !== String(supervisor.firm)) {
    throw forbiddenError('You can correct attendance only for workers assigned to you, not your own attendance.');
  }
}

export async function correctionActor(user, worker, deployment) {
  firmScope(user, deployment.firm);
  if (['admin', 'developer', 'security', 'farm_incharge'].includes(user.role)) return user;
  if (['admin', 'developer', 'office', 'security', 'farm_incharge'].includes(user.role)) return user;
  if (!['supervisor', 'worker'].includes(user.role)) throw forbiddenError('Attendance editing access is required.');
  const supervisor = await supervisorIdentity(user);
  assertSupervisedDeployment(supervisor, worker, deployment);
  return { _id: supervisor.userId, name: supervisor.fullName, role: 'supervisor' };
}

export async function supervisorWorkers(user, query) {
  const supervisor = await supervisorIdentity(user);
  const date = dateOnly(query.date, 'Date');
  const start = new Date(date + 'T00:00:00+05:30');
  const end = new Date(start.getTime() + 86400000);
  firmScope(user, supervisor.firm);
  const ids = await WorkerDeployment.distinct('worker', {
    supervisor: supervisor._id, firm: supervisor.firm,
    effectiveFrom: { $lt: end }, $or: [{ effectiveTo: null }, { effectiveTo: { $gt: start } }],
  });
  const items = await Worker.find({ _id: { $in: ids, $ne: supervisor._id } })
    .select('fullName workerCode').sort({ fullName: 1, _id: 1 }).lean();
  return { items };
}

export async function supervisorSessions(user, query) {
  const workerId = objectId(query.workerId, 'Worker');
  const { items } = await supervisorWorkers(user, query);
  if (!items.some(worker => String(worker._id) === String(workerId))) throw forbiddenError('Worker is not assigned to you on this date.');
  const supervisor = await supervisorIdentity(user);
  return { items: await AttendanceSession.find({ worker: workerId, date: query.date, firm: supervisor.firm, supervisor: supervisor._id }).sort({ dutyIn: -1 }).lean() };
}
