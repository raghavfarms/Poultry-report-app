import express, { Router } from 'express';
import { protect, attendanceStaffOnly, supervisorOrAdminOnly, attendanceAdminOnly } from '../middleware/auth.js';
import { firmScope, sortFirms } from './authorization.js';
import Firm from '../models/Firm.js';
import User from '../models/User.js';

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

// Instant public network location resolution endpoint (server-side IP geolocation)
// Used by Face Scanner, Worker Portal, and Admin Geofence modal when client-side GPS/Brave is restricted
router.get('/network-location', async (req, res) => {
  try {
    let clientIp = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || '';
    if (typeof clientIp === 'string') {
      clientIp = clientIp.split(',')[0].trim();
    }
    if (!clientIp || clientIp === '::1' || clientIp === '127.0.0.1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.') || clientIp.startsWith('172.16.')) {
      clientIp = '';
    }

    const targetUrl = clientIp ? `https://ipwho.is/${clientIp}` : 'https://ipwho.is/';
    const response = await fetch(targetUrl, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const data = await response.json();
      if (data && data.success !== false && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
        return res.json({
          status: 'CAPTURED',
          latitude: data.latitude,
          longitude: data.longitude,
          accuracyMetres: 250,
          source: 'SERVER_NETWORK',
          city: data.city || '',
          capturedAt: new Date().toISOString(),
        });
      }
    }
  } catch {}

  try {
    const response = await fetch('http://ip-api.com/json/', { signal: AbortSignal.timeout(1800) });
    if (response.ok) {
      const data = await response.json();
      if (data && data.status === 'success' && Number.isFinite(data.lat) && Number.isFinite(data.lon)) {
        return res.json({
          status: 'CAPTURED',
          latitude: data.lat,
          longitude: data.lon,
          accuracyMetres: 350,
          source: 'SERVER_NETWORK',
          city: data.city || '',
          capturedAt: new Date().toISOString(),
        });
      }
    }
  } catch {}

  res.json({ status: 'UNAVAILABLE' });
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
  try {
    const officeFirm = await Firm.findOneAndUpdate(
      { code: 'OFFICE' },
      {
        $setOnInsert: {
          name: 'Head Office',
          code: 'OFFICE',
          active: true,
        },
      },
      { upsert: true, new: true, runValidators: true }
    );
    if (officeFirm) {
      await User.updateMany(
        { role: { $in: ['admin', 'developer'] } },
        { $addToSet: { firms: officeFirm._id } }
      );
    }
  } catch (err) {
    console.error('Office firm auto-seed note:', err.message);
  }

  const scope = firmScope(req.user);
  const firms = await Firm.find({ active: true, ...(scope.firm ? { _id: scope.firm } : {}) })
    .select('name code').lean();
  res.json({ firms: sortFirms(firms) });
});


router.get('/capacity', async (req, res) => res.json(await service.firmCapacity(req.user, req.query)));
router.get('/registered-users', async (req, res) => res.json(await service.listRegisteredUsers(req.user, req.query)));

for (const kind of ['designations', 'work-locations', 'geofences']) {
  router.get(`/${kind}`, async (req, res) => res.json(await service.listMasters(kind, req.user, req.query)));
  router.post(`/${kind}`, attendanceAdminOnly, async (req, res) => res.status(201).json({ item: await service.createMaster(kind, req.user, req.body) }));
  router.get(`/${kind}/:id`, async (req, res) => {
    const item = await service.getMaster(kind, req.user, req.params.id);
    res.json({ item: kind === 'work-locations' ? service.locationWithCapacity(item) : item });
  });
  router.patch(`/${kind}/:id`, attendanceAdminOnly, async (req, res) => res.json({ item: await service.updateMaster(kind, req.user, req.params.id, req.body) }));
  router.delete(`/${kind}/:id`, attendanceAdminOnly, async (req, res) => res.json(await service.deleteMaster(kind, req.user, req.params.id)));
}

// Deployments
router.get('/deployments', async (req, res) => res.json(await deploymentService.listDeployments(req.user, req.query)));

// Workers
router.get('/workers', async (req, res) => res.json(await service.listWorkers(req.user, req.query)));
router.post('/workers', attendanceAdminOnly, async (req, res) => res.status(201).json(await service.createWorker(req.user, req.body)));
router.get('/workers/:id/private-details', attendanceAdminOnly, async (req, res) => res.json(await service.getWorker(req.user, req.params.id, true)));
router.get('/workers/:id', async (req, res) => res.json({ worker: await service.getWorker(req.user, req.params.id) }));
router.patch('/workers/:id', attendanceAdminOnly, async (req, res) => res.json({ worker: await service.updateWorker(req.user, req.params.id, req.body) }));
router.delete('/workers/:id', attendanceAdminOnly, async (req, res) => res.json(await service.deleteWorker(req.user, req.params.id)));
router.get('/workers/:id/deployment', async (req, res) => res.json(await deploymentService.currentDeployment(req.user, req.params.id, req.query)));
router.get('/workers/:id/deployments', async (req, res) => res.json(await deploymentService.listDeployments(req.user, req.query, req.params.id)));
router.post('/workers/:id/initial-deployment', attendanceAdminOnly, async (req, res) => res.status(201).json({ deployment: await deploymentService.assignInitialDeployment(req.user, req.params.id, req.body) }));
router.post('/workers/:id/transfer', async (req, res) => res.json(await deploymentService.transferWorker(req.user, req.params.id, req.body)));

// Worker Photo
router.put('/workers/:id/photo', attendanceAdminOnly, express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '2mb' }), async (req, res) => {
  res.json(await photoService.saveWorkerPhoto(req.user, req.params.id, req.body));
});
router.get('/workers/:id/photo', async (req, res) => {
  const { filename, mimeType } = await photoService.getWorkerPhoto(req.user, req.params.id);
  res.type(mimeType).sendFile(filename);
});

// Face Biometrics
router.post('/workers/:id/face', attendanceAdminOnly, async (req, res) => res.json(await faceService.enrolWorkerFace(req.user, req.params.id, req.body)));
router.delete('/workers/:id/face', attendanceAdminOnly, async (req, res) => res.json(await faceService.deleteWorkerFaceProfile(req.user, req.params.id)));
router.get('/face-descriptors', async (req, res) => res.json(await faceService.listFirmFaceDescriptors(req.user, req.query)));

// Live Attendance Tracking & Events
router.get('/workers/:id/status', async (req, res) => res.json(await attendanceService.getWorkerAttendanceStatus(req.user, req.params.id, req.query.at ? new Date(req.query.at) : undefined)));
router.get('/events', async (req, res) => res.json(await attendanceService.listAttendanceEvents(req.user, req.query)));
router.post('/events', async (req, res) => res.status(201).json(await attendanceService.recordAttendance(req.user, req.body)));
router.get('/sessions', async (req, res) => res.json(await attendanceService.listAttendanceSessions(req.user, req.query)));
router.post('/sessions/correct', async (req, res) => res.json(await attendanceService.correctAttendanceSession(req.user, req.body)));
router.post('/sessions/auto-cut', async (req, res) => res.json(await attendanceService.manualAutoCutSession(req.user, req.body)));
router.post('/sessions/bulk-day', async (req, res) => res.json(await attendanceService.recordBulkDayAttendance(req.user, req.body)));

// Dashboard
router.get('/dashboard/live', async (req, res) => res.json(await dashboardService.getLiveDashboardData(req.user, req.query)));

// Reports
router.get('/reports/daily', async (req, res) => res.json(await reportService.getDailyAttendanceReport(req.user, req.query)));
router.get('/reports/monthly', async (req, res) => res.json(await reportService.getMonthlyAttendanceSummary(req.user, req.query)));

// Audit Logs
router.get('/audit-logs', attendanceAdminOnly, async (req, res) => res.json(await auditService.listAuditLogs(req.user, req.query)));

// Error handling
router.use((error, req, res, next) => {
  if (error.name === 'CastError') return res.status(400).json({ message: 'An attendance field has an invalid value.' });
  if (error.name === 'VersionError') return res.status(409).json({ message: 'This record changed. Refresh and retry.' });
  if (error.code === 11000) return res.status(409).json({ message: 'This name or worker ID already exists. Inactive records also reserve their names and IDs.' });
  if (error.name === 'ValidationError') {
    const msg = error.errors ? Object.values(error.errors).map((e) => e.message).join(' ') : error.message;
    return res.status(400).json({ message: msg || 'Please check the attendance fields and try again.' });
  }
  if (error.status && error.status >= 400 && error.status < 500) return res.status(error.status).json({ message: error.message });
  console.error('Attendance request failed:', error.name || 'Error');
  res.status(500).json({ message: 'Unable to process attendance. Please retry.' });
});

export default router;

 
  
