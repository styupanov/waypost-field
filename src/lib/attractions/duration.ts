import type { VisitDuration } from "@/types/attractions";

const RANGE_PATTERN = /^(\d+)[-–](\d+) (minutes|hours|days)$/;
const EXACT_UNIT_PATTERN = /^(\d+) (hour|hours|day|days)$/;
const COMPACT_PATTERN = /^(?:(\d+)h)?(?:\s*(\d+)m)?$/;

function unitMinutes(unit: string) {
  if (unit === "days" || unit === "day") return 24 * 60;
  if (unit === "hours" || unit === "hour") return 60;
  return 1;
}

export function parseVisitDuration(value: string | null): VisitDuration | null {
  if (!value) return null;

  if (value === "< 1 hour") {
    return { minimumMinutes: null, maximumMinutes: 60 };
  }
  if (value === "More than 3 hours") {
    return { minimumMinutes: 180, maximumMinutes: null };
  }

  const range = value.match(RANGE_PATTERN);
  if (range) {
    const factor = unitMinutes(range[3]);
    return {
      minimumMinutes: Number(range[1]) * factor,
      maximumMinutes: Number(range[2]) * factor,
    };
  }

  const exactUnit = value.match(EXACT_UNIT_PATTERN);
  if (exactUnit) {
    const minutes = Number(exactUnit[1]) * unitMinutes(exactUnit[2]);
    return { minimumMinutes: minutes, maximumMinutes: minutes };
  }

  const compact = value.match(COMPACT_PATTERN);
  if (compact && (compact[1] || compact[2])) {
    const minutes = Number(compact[1] ?? 0) * 60 + Number(compact[2] ?? 0);
    return { minimumMinutes: minutes, maximumMinutes: minutes };
  }

  return null;
}
