export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date, amount) {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

export function dateRange(from, to) {
  const values = [];
  for (let current = from; current <= to; current = addDays(current, 1)) values.push(current);
  return values;
}

export function assertDate(value, name = 'date') {
  if (!DATE_PATTERN.test(value || '') || Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())) {
    const error = new Error(`${name} must use YYYY-MM-DD format.`);
    error.status = 400;
    throw error;
  }
}

