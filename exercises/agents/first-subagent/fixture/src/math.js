export function clamp(value, min, max) {
  if (min > max) throw new RangeError("min must be <= max");
  return Math.min(Math.max(value, min), max);
}

export function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
