export const CENTS_PER_POINT = 100;

export function centsToPoints(cents: number): number {
  return Math.round(cents) / CENTS_PER_POINT;
}

export function pointsToCents(points: number): number {
  return Math.round(points * CENTS_PER_POINT);
}
