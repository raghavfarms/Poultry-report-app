// Packaging & Unit Helper Utilities for Medicine Inventory

export const DEFAULT_PACKAGING_TYPES = [
  'Bottle',
  'Bag',
  'Box',
  'Can',
  'Packet',
  'Vial',
];

export const DEFAULT_MEASUREMENT_UNITS = [
  'Litre (L)',
  'Millilitre (ml)',
  'Kilogram (Kg)',
  'Gram (g)',
  'Tablet',
  'Dose',
];

/**
 * Format available stock with both base units and physical packaging breakdown.
 * e.g.:
 *  - 20 L, packSize 5, Bottle -> "20 Litre (L) (4 Bottles)"
 *  - 19 L, packSize 5, Bottle -> "19 Litre (L) (3 Bottles + 4 Litre (L))"
 *  - 50 Kg, packSize 25, Bag  -> "50 Kilogram (Kg) (2 Bags)"
 */
export function formatStockDisplay(quantity, packSize = 1, packagingType = 'Bottle', unit = 'Units') {
  const qty = Number(quantity) || 0;
  const size = Number(packSize) || 1;
  const packName = packagingType || 'Bottle';
  const unitName = unit || 'Units';

  if (!size || size <= 1) {
    return `${qty} ${unitName}`;
  }

  if (qty === 0) {
    return `0 ${unitName} (0 ${packName}s)`;
  }

  // Exact multiple of pack size
  if (qty % size === 0) {
    const packs = qty / size;
    return `${qty} ${unitName} (${packs} ${packName}${packs === 1 ? '' : 's'})`;
  }

  // Fractional or partial container remaining
  const fullPacks = Math.floor(qty / size);
  const remainder = Number((qty % size).toFixed(3));

  if (fullPacks > 0) {
    return `${qty} ${unitName} (${fullPacks} ${packName}${fullPacks === 1 ? '' : 's'} + ${remainder} ${unitName})`;
  }

  return `${qty} ${unitName} (${remainder} ${unitName} in open ${packName})`;
}

/**
 * Calculate total volume/weight from number of packs and pack size.
 */
export function calculateTotalFromPacks(packs, packSize = 1) {
  const p = Number(packs);
  const s = Number(packSize) || 1;
  if (!Number.isFinite(p) || p <= 0) return 0;
  return Number((p * s).toFixed(3));
}

/**
 * Calculate pack count from total volume/weight and pack size.
 */
export function calculatePacksFromTotal(total, packSize = 1) {
  const t = Number(total);
  const s = Number(packSize) || 1;
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Number((t / s).toFixed(3));
}
