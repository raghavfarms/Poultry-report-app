import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import firmRoutes from './routes/firms.routes.js';
import assetRoutes from './routes/assets.routes.js';
import entryRoutes from './routes/entries.routes.js';
import transportVehicleRoutes from './routes/transportVehicles.routes.js';
import transportEntryRoutes from './routes/transportEntries.routes.js';
import transportStationRoutes from './routes/transportStations.routes.js';
import attendanceRoutes from './attendance/routes.js';
import medicineRoutes from './medicine/routes/medicine.route.js'
import supplierRoutes from './medicine/routes/supplier.route.js'
import purchaseOrderRoutes from './medicine/routes/purchaseOrder.route.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((item) => item.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));   // credentials are cookies, authorization headers or TLS client certificates
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'poultry-reporting-api' }));   // check backend is running or not with logging 
app.use('/api/auth', authRoutes);
app.use('/api/firms', firmRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/entries', entryRoutes);

//  transport vehicles and transport entries are separate routes for managing transportation-related data in the application
app.use('/api/transport-vehicles', transportVehicleRoutes);
app.use('/api/transport-entries', transportEntryRoutes);
app.use('/api/transport-stations', transportStationRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/medicine/masters',medicineRoutes);
app.use('/api/medicine/suppliers', supplierRoutes);
app.use('/api/medicine/purchase-orders', purchaseOrderRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;

