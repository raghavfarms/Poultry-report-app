import FeedFormulation from '../models/FeedFormulation.js';

/**
 * Generates the next sequential BOM Number for Feed Formulations.
 * Format: BOM-001, BOM-002, ... BOM-999
 */
export async function getNextBomNumber() {
  const lastItem = await FeedFormulation.findOne({ bomNumber: /^BOM-\d+$/ })
    .sort({ bomNumber: -1 })
    .select('bomNumber')
    .lean();

  if (!lastItem || !lastItem.bomNumber) {
    return 'BOM-001';
  }

  const numericPart = lastItem.bomNumber.replace('BOM-', '');
  const lastNumber = parseInt(numericPart, 10);
  const nextNumber = (isNaN(lastNumber) ? 0 : lastNumber) + 1;

  return `BOM-${String(nextNumber).padStart(3, '0')}`;
}     

  