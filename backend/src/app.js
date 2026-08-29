import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import firmRoutes from './routes/firms.routes.js';
import assetRoutes from './routes/assets.routes.js';
import entryRoutes from './routes/entries.routes.js';
import { errorHandler, notFound } from './middleware/error.js';

const app = express();
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map((item) => item.trim());

app.use(helmet());
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'poultry-reporting-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/firms', firmRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/entries', entryRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;

