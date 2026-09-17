import User from '../../models/User.js';
import { badRequest } from '../../utils/http.js';

export async function requireRegisteredWorker(worker, session = null) {
  if (!worker.userId) return;
  const exists = await User.exists({
    _id: worker.userId, active: true, 'firms.0': { $exists: true },
  }).session(session);
  if (!exists) {
    throw badRequest('The user account linked to this attendance worker is inactive or unavailable. Contact your administrator.');
  }
}
