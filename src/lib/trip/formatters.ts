export function formatApproximateDistance(distanceKm: number) {
  return `≈ ${Math.round(distanceKm).toLocaleString("en-US")} km`;
}

export function formatApproximateDuration(durationSeconds: number) {
  const totalMinutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `≈ ${minutes} min`;
  }

  if (minutes === 0) {
    return `≈ ${hours} h`;
  }

  return `≈ ${hours} h ${minutes} min`;
}
