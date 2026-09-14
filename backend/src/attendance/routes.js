import express, { Router } from 'express';
import { protect, attendanceStaffOnly, supervisorOrAdminOnly } from '../middleware/auth.js';
import { firmScope } from './authorization.js';
import Firm from '../models/Firm.js';
import * as service from './services/masters.service.js';
import * as deploymentService from './services/deployment.service.js';
import * as attendanceService from './services/attendance.service.js';
import * as faceService from './services/face.service.js';
import * as photoService from './services/photo.service.js';
import * as dashboardService from './services/dashboard.service.js';
import * as reportService from './services/report.service.js';
import * as auditService from './services/audit.service.js';
import * as supervisorService from './services/supervisor.service.js';
import * as workerAuthService from './services/workerAuth.service.js';

const router = Router();

// Public worker self-service endpoints
router.post('/worker/login', async (req, res) => {
  res.json(await workerAuthService.workerLogin(req.body.identifier, req.body.pin));
});
router.get('/worker/me', protect, async (req, res) => {
  res.json(await workerAuthService.getWorkerSelfProfile(req.user));
});
router.post('/worker/punch', protect, async (req, res) => {
  res.json(await workerAuthService.recordWorkerSelfPunch(req.user, req.body));
});

// Staff-operated kiosk & administration endpoints
router.use(protect, attendanceStaffOnly);
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Supervisor scoped endpoints
router.get('/supervisor/workers', async (req, res) => res.json(await supervisorService.supervisorWorkers(req.user, req.query)));
router.get('/supervisor/sessions', async (req, res) => res.json(await supervisorService.supervisorSessions(req.user, req.query)));
router.post('/supervisor/sessions/correct', async (req, res) => res.json(await attendanceService.correctAttendanceSession(req.user, req.body)));

// Master data & firms
router.get('/firms', async (req, res) => {
  const scope = firmScope(req.user);
  const firms = await Firm.find({ active: true, ...(scope.firm ? { _id: scope.firm } : {}) })
    .select('name code').sort({ name: 1 }).lean();
  res.json({ firms });
});

router.get('/capacity', async (req, res) => res.json(await service.firmCapacity(req.user, req.query)));
router.get('/registered-users', async (req, res) => res.json(await service.listRegisteredUsers(req.user, req.query)));

for (const kind of ['designations', 'work-locations']) {
  router.get(`/${kind}`, async (req, res) => res.json(await service.listMasters(kind, req.user, req.query)));
  router.post(`/${kind}`, async (req, res) => res.status(201).json({ item: await service.createMaster(kind, req.user, req.body) }));
  router.get(`/${kind}/:id`, async (req, res) => {
    const item = await service.getMaster(kind, req.user, req.params.id);
    res.json({ item: kind === 'work-locations' ? service.locationWithCapacity(item) : item });
  });
  router.patch(`/${kind}/:id`, async (req, res) => res.json({ item: await service.updateMaster(kind, req.user, req.params.id, req.body) }));
}

// Deployments
router.get('/deployments', async (req, res) => res.json(await deploymentService.listDeployments(req.user, req.query)));

// Workers
router.get('/workers', async (req, res) => res.json(await service.listWorkers(req.user, req.query)));
router.post('/workers', async (req, res) => res.status(201).json(await service.createWorker(req.user, req.body)));
router.get('/workers/:id/private-details', async (req, res) => res.json(await service.getWorker(req.user, req.params.id, true)));
router.get('/workers/:id', async (req, res) => res.json({ worker: await service.getWorker(req.user, req.params.id) }));
router.patch('/workers/:id', async (req, res) => res.json({ worker: await service.updateWorker(req.user, req.params.id, req.body) }));
router.delete('/workers/:id', supervisorOrAdminOnly, async (req, res) => res.json(await service.deleteWorker(req.user, req.params.id)));
router.get('/workers/:id/deployment', async (req, res) => res.json(await deploymentService.currentDeployment(req.user, req.params.id, req.query)));
router.get('/workers/:id/deployments', async (req, res) => res.json(await deploymentService.listDeployments(req.user, req.query, req.params.id)));
router.post('/workers/:id/initial-deployment', async (req, res) => res.status(201).json({ deployment: await deploymentService.assignInitialDeployment(req.user, req.params.id, req.body) }));
router.post('/workers/:id/transfer', supervisorOrAdminOnly, async (req, res) => res.json(await deploymentService.transferWorker(req.user, req.params.id, req.body)));

// Worker Photo
router.put('/workers/:id/photo', express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), async (req, res) => {
  res.json(await photoService.saveWorkerPhoto(req.user, req.params.id, req.body));
});
router.get('/workers/:id/photo', async (req, res) => {
  const { filename, mimeType } = await photoService.getWorkerPhoto(req.user, req.params.id);
  res.type(mimeType).sendFile(filename);
});

// Face Biometrics
router.post('/workers/:id/face', async (req, res) => res.json(await faceService.enrolWorkerFace(req.user, req.params.id, req.body)));
router.delete('/workers/:id/face', async (req, res) => res.json(await faceService.deleteWorkerFaceProfile(req.user, req.params.id)));
router.get('/face-descriptors', async (req, res) => res.json(await faceService.listFirmFaceDescriptors(req.user, req.query)));

// Live Attendance Tracking & Events
router.get('/workers/:id/status', async (req, res) => res.json(await attendanceService.getWorkerAttendanceStatus(req.user, req.params.id, req.query.at ? new Date(req.query.at) : undefined)));
router.get('/events', async (req, res) => res.json(await attendanceService.listAttendanceEvents(req.user, req.query)));
router.post('/events', async (req, res) => res.status(201).json(await attendanceService.recordAttendance(req.user, req.body)));
router.get('/sessions', async (req, res) => res.json(await attendanceService.listAttendanceSessions(req.user, req.query)));
router.post('/sessions/correct', async (req, res) => res.json(await attendanceService.correctAttendanceSession(req.user, req.body)));

// Dashboard
router.get('/dashboard/live', async (req, res) => res.json(await dashboardService.getLiveDashboardData(req.user, req.query)));

// Reports
router.get('/reports/daily', async (req, res) => res.json(await reportService.getDailyAttendanceReport(req.user, req.query)));
router.get('/reports/monthly', async (req, res) => res.json(await reportService.getMonthlyAttendanceSummary(req.user, req.query)));

// Audit Logs
router.get('/audit-logs', async (req, res) => res.json(await auditService.listAuditLogs(req.user, req.query)));

// Error handling
router.use((error, req, res, next) => {
  if (error.name === 'CastError') return res.status(400).json({ message: 'An attendance field has an invalid value.' });
  if (error.name === 'VersionError') return res.status(409).json({ message: 'This record changed. Refresh and retry.' });
  if (error.code === 11000) return res.status(409).json({ message: 'This name or worker ID already exists. Inactive records also reserve their names and IDs.' });
  if (error.name === 'ValidationError') return res.status(400).json({ message: 'Please check the attendance fields and try again.' });
  if (error.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message });
  console.error('Attendance request failed:', error.name || 'Error');
  res.status(500).json({ message: 'Unable to process attendance. Please retry.' });
});

export default router;

 
  
