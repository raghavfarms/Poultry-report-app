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
 * Shorten verbose unit labels like "Millilitre (ml)" -> "ml", "Litre (L)" -> "L", etc.
 */
export function formatUnit(unit = '') {
  if (!unit) return '';
  const trimmed = String(unit).trim();
  const parenMatch = trimmed.match(/\(([^)]+)\)/);
  if (parenMatch) return parenMatch[1].trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'millilitre' || lower === 'milliliter' || lower === 'ml') return 'ml';
  if (lower === 'litre' || lower === 'liter' || lower === 'l') return 'L';
  if (lower === 'kilogram' || lower === 'kg') return 'Kg';
  if (lower === 'gram' || lower === 'gm' || lower === 'g') return 'g';
  if (lower === 'milligram' || lower === 'mg') return 'mg';
  return trimmed;
}

export function getPackagingPlural(name = 'Bottle', count = 1) {
  if (count === 1) return name;
  const trimmed = String(name || 'Bottle').trim();
  const lower = trimmed.toLowerCase();
  if (lower.endsWith('x') || lower.endsWith('sh') || lower.endsWith('ch') || lower.endsWith('ss')) {
    return `${trimmed}es`;
  }
  if (lower.endsWith('s')) {
    return trimmed;
  }
  return `${trimmed}s`;
}

/**
 * Format available stock with pack count above/primary and raw quantity secondary.
 * e.g.:
 *  - 1800 ml, packSize 100, Vial -> "18 Vials (1800 ml)"
 *  - 40 L, packSize 20, Bucket    -> "2 Buckets (40 L)"
 *  - 21 Kg, packSize 0.5, Box     -> "42 Boxes (21 Kg)"
 *  - 19 L, packSize 5, Bottle     -> "3 Bottles + 4 L (19 L)"
 *  - 50 Kg, packSize 25, Bag      -> "2 Bags (50 Kg)"
 */
export function formatStockDisplay(quantity, packSize = 1, packagingType = 'Bottle', unit = 'Units') {
  const qty = Number(quantity) || 0;
  const size = Number(packSize) || 1;
  const packName = packagingType || 'Bottle';
  const u = formatUnit(unit) || 'Units';

  // Only bypass packaging display if size is invalid or exactly 1 with no distinct pack ratio
  if (!size || size <= 0 || size === 1) {
    return `${qty} ${u}`;
  }

  const pLabel = (count) => getPackagingPlural(packName, count);

  if (qty === 0) {
    return `0 ${pLabel(0)} (0 ${u})`;
  }

  // Exact multiple of pack size: Pack count first, volume in parenthesis
  const pCount = qty / size;
  if (Math.abs(pCount - Math.round(pCount)) < 0.0001) {
    const packs = Math.round(pCount);
    return `${packs} ${pLabel(packs)} (${qty} ${u})`;
  }

  // Fractional or partial container remaining
  const fullPacks = Math.floor(qty / size);
  const remainder = Number((qty - fullPacks * size).toFixed(3));

  if (fullPacks > 0) {
    return `${fullPacks} ${pLabel(fullPacks)} + ${remainder} ${u} (${qty} ${u})`;
  }

  return `0 ${pLabel(0)} + ${remainder} ${u} (${qty} ${u})`;
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

/**
 * Universal packaging breakdown for table displays and exports.
 * Returns { main, sub, excelStr, fullPacks, loose }
 */
export function formatPackAndLoose(totalStock, packSize, packagingType, unit) {
  const qty = Number(totalStock) || 0;
  const size = Number(packSize) > 0 ? Number(packSize) : 1;
  const type = packagingType || 'Bottle';
  const u = formatUnit(unit) || 'Units';

  if (size <= 0 || size === 1) {
    return {
      main: `${qty} ${u}`,
      sub: '',
      excelStr: `${qty} ${u}`,
      fullPacks: qty,
      loose: 0,
    };
  }

  const exactPacks = qty / size;
  const rounded = Math.round(exactPacks);
  const isExact = Math.abs(exactPacks - rounded) < 0.0001;

  if (isExact) {
    const packs = rounded;
    const label = getPackagingPlural(type, packs);
    return {
      main: `📦 ${packs} ${label}`,
      sub: `1 ${type} = ${size} ${u}`,
      excelStr: `${packs} ${label} (${qty} ${u})`,
      fullPacks: packs,
      loose: 0,
    };
  }

  const fullPacks = Math.floor(exactPacks + 0.00001);
  const loose = Number(Math.max(0, qty - fullPacks * size).toFixed(3));
  const label = getPackagingPlural(type, fullPacks);

  if (fullPacks > 0) {
    return {
      main: `📦 ${fullPacks} ${label} + ${loose} ${u}`,
      sub: `1 ${type} = ${size} ${u}`,
      excelStr: `${fullPacks} ${label} + ${loose} ${u} (${qty} ${u})`,
      fullPacks,
      loose,
    };
  }

  return {
    main: `📦 0 ${getPackagingPlural(type, 0)} + ${loose} ${u}`,
    sub: `1 ${type} = ${size} ${u}`,
    excelStr: `0 ${getPackagingPlural(type, 0)} + ${loose} ${u} (${qty} ${u})`,
    fullPacks: 0,
    loose,
  };
}