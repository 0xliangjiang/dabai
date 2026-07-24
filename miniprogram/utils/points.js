function centsToPoints(value) {
  const points = (Number(value) || 0) / 100;
  return Number.isInteger(points) ? String(points) : points.toFixed(2);
}

function pointsToCents(value) {
  const points = Number(value);
  if (!Number.isFinite(points)) return 0;
  return Math.round(points * 100);
}

module.exports = { centsToPoints, pointsToCents };
