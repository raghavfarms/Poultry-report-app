import mongoose from 'mongoose';
import MedicineBatch from '../models/MedicineBatch.js';

export async function disposeBatch(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid batch.' });
    const batch = await MedicineBatch.findById(req.params.id);
    if (!batch) return res.status(404).json({ message: 'Batch not found.' });
    const quantity = batch.quantityAvailable;
    if (quantity <= 0) return res.status(409).json({ message: 'This batch has no remaining stock.' });
    // Stock and its audit entry change together in a single atomic write.
    const updated = await MedicineBatch.findOneAndUpdate(
      { _id: batch._id, quantityAvailable: quantity,
        $or: [{ disposedQuantity: batch.disposedQuantity || 0 }, { disposedQuantity: { $exists: false } }] },
      {
        $set: { quantityAvailable: 0, status: 'DEPLETED' },
        $inc: { disposedQuantity: quantity },
        $push: { disposals: { quantity, performedBy: req.user._id, performedByName: req.user.name || req.user.username || '', createdAt: new Date() } },
      },
      { new: true, runValidators: true },
    );
    if (!updated) return res.status(409).json({ message: 'Stock changed. Refresh and try again.' });
    res.json({ success: true, disposedQuantity: quantity });
  } catch (error) { next(error); }
}
