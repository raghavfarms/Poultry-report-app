import AttendanceAuditLog from '../models/AttendanceAuditLog.js';
import { firmScope } from '../authorization.js';
import { objectId, pagination, dateOnly } from '../validation.js';

/**
 * Lists paginated audit logs for administrative transfers, corrections, and modifications.
 */
export async function listAuditLogs(user, query = {}) {
  const { page, limit, skip } = pagination(query);
  const filter = { ...firmScope(user, query.firmId) };

  if (query.workerId) filter.worker = objectId(query.workerId, 'Worker');
  if (query.entityType) filter.entityType = query.entityType;
  if (query.action) filter.action = query.action;
  if (query.attendanceDate) filter['newValue.date'] = dateOnly(query.attendanceDate, 'Attendance date');

  if (query.startDate || query.endDate) {
    filter.createdAt = {};
    if (query.startDate) filter.createdAt.$gte = new Date(`${dateOnly(query.startDate, 'Start date')}T00:00:00+05:30`);
    if (query.endDate) filter.createdAt.$lte = new Date(`${dateOnly(query.endDate, 'End date')}T23:59:59+05:30`);
  }

  const [items, total] = await Promise.all([
    AttendanceAuditLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
    AttendanceAuditLog.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}
