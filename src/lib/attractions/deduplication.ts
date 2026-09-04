import type { AttractionCandidate } from "@/types/attractions";

export const DUPLICATE_PROXIMITY_METERS = 250;

export type DeduplicationResult = {
  candidates: AttractionCandidate[];
  candidateCountBeforeDedup: number;
  candidateCountAfterDedup: number;
  duplicatesRemoved: number;
};

export function normalizeAttractionName(name: string) {
  return name
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[‘’'`]/g, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function distanceMeters(
  left: AttractionCandidate,
  right: AttractionCandidate
) {
  const earthRadiusMeters = 6_371_008.8;
  const toRadians = Math.PI / 180;
  const leftLatitude = left.lat * toRadians;
  const rightLatitude = right.lat * toRadians;
  const latitudeDelta = (right.lat - left.lat) * toRadians;
  const longitudeDelta = (right.lon - left.lon) * toRadians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
  );
}

function metadataCompleteness(candidate: AttractionCandidate) {
  return Number(Boolean(candidate.sourceGroup?.trim())) +
    Number(Boolean(candidate.duration?.trim()));
}

function compareSourceQuality(
  left: AttractionCandidate,
  right: AttractionCandidate
) {
  return (
    right.reviewCount - left.reviewCount ||
    right.rating - left.rating ||
    metadataCompleteness(right) - metadataCompleteness(left) ||
    left.id - right.id
  );
}

export function deduplicateAttractionCandidates(
  candidates: AttractionCandidate[]
): DeduplicationResult {
  const parents = candidates.map((_, index) => index);
  const buckets = new Map<string, number[]>();

  function find(index: number): number {
    if (parents[index] !== index) parents[index] = find(parents[index]);
    return parents[index];
  }

  function union(left: number, right: number) {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  }

  candidates.forEach((candidate, index) => {
    const normalizedName = normalizeAttractionName(candidate.name);
    const matchingNameIndexes = buckets.get(normalizedName) ?? [];
    for (const otherIndex of matchingNameIndexes) {
      if (
        distanceMeters(candidate, candidates[otherIndex]) <=
        DUPLICATE_PROXIMITY_METERS
      ) {
        union(index, otherIndex);
      }
    }
    matchingNameIndexes.push(index);
    buckets.set(normalizedName, matchingNameIndexes);
  });

  const groups = new Map<number, AttractionCandidate[]>();
  candidates.forEach((candidate, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), candidate]);
  });

  const retainedIds = new Set<number>();
  for (const group of groups.values()) {
    retainedIds.add([...group].sort(compareSourceQuality)[0].id);
  }

  const deduplicated = candidates.filter((candidate) =>
    retainedIds.has(candidate.id)
  );
  return {
    candidates: deduplicated,
    candidateCountBeforeDedup: candidates.length,
    candidateCountAfterDedup: deduplicated.length,
    duplicatesRemoved: candidates.length - deduplicated.length,
  };
}
