import assert from "node:assert/strict";
import { cellToBoundary, gridDisk, latLngToCell } from "h3-js";
import { buildFogMask, padCoverageViewport } from "../src/lib/coverage/fog-mask.ts";

type FogGeometry = ReturnType<typeof buildFogMask>["geometry"];

const bounds = { west: -80.2, south: 35, east: -79.8, north: 35.4 };
const centerRes5 = latLngToCell(35.2, -80, 5);
const centerRes4 = latLngToCell(35.2, -80, 4);
const centerRes10 = latLngToCell(35.2, -80, 10);

function polygons(geometry: FogGeometry) {
  return geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
}

function coordinateCount(geometry: FogGeometry) {
  return polygons(geometry).reduce((total, polygon) => total + polygon.reduce((sum, ring) => sum + ring.length, 0), 0);
}

function assertValid(geometry: FogGeometry) {
  assert.ok(geometry.type === "Polygon" || geometry.type === "MultiPolygon");
  for (const polygon of polygons(geometry)) for (const ring of polygon) {
    assert.ok(ring.length >= 4);
    assert.deepEqual(ring[0], ring.at(-1));
    for (const [longitude, latitude] of ring) {
      assert.ok(longitude >= -180 && longitude <= 180);
      assert.ok(latitude >= -90 && latitude <= 90);
    }
  }
}

const empty = buildFogMask({ bounds, revealedCells: [] });
assert.deepEqual(empty.geometry, { type: "Polygon", coordinates: [[[-80.2, 35], [-79.8, 35], [-79.8, 35.4], [-80.2, 35.4], [-80.2, 35]]] });

for (const cells of [
  [centerRes5],
  [centerRes4],
  [centerRes10],
  [latLngToCell(35.08, -80.12, 9), latLngToCell(35.32, -79.88, 9)],
  gridDisk(latLngToCell(35.2, -80, 8), 1),
  [latLngToCell(35, -80, 7)],
]) {
  const before = structuredClone(cells);
  const fog = buildFogMask({ bounds, revealedCells: cells });
  assertValid(fog.geometry);
  assert.deepEqual(cells, before);
}

const coarse = buildFogMask({ bounds, revealedCells: [centerRes5] });
const regional = buildFogMask({ bounds, revealedCells: [centerRes4] });
const precise = buildFogMask({ bounds, revealedCells: [centerRes10] });
assert.ok(polygons(coarse.geometry)[0].length > 1, "A contained res5 cell must create a real hole.");
assertValid(regional.geometry);
assert.ok(polygons(precise.geometry)[0].length > 1, "A contained res10 cell must create a real hole.");
function longitudeSpan(ring: number[][]) {
  const longitudes = ring.map(([longitude]) => longitude);
  return Math.max(...longitudes) - Math.min(...longitudes);
}
assert.ok(longitudeSpan(polygons(coarse.geometry)[0][1]) > longitudeSpan(polygons(precise.geometry)[0][1]));
assert.ok(coordinateCount(coarse.geometry) > 0 && coordinateCount(precise.geometry) > 0);

const h3Boundary = cellToBoundary(centerRes10, true)[0];
assert.ok(Math.abs(h3Boundary[0]) > Math.abs(h3Boundary[1]), "H3 GeoJSON longitude must be first.");
const padded = padCoverageViewport(bounds);
assert.ok(Math.abs(padded.west - -80.3) < 1e-12);
assert.ok(Math.abs(padded.south - 34.9) < 1e-12);
assert.ok(Math.abs(padded.east - -79.7) < 1e-12);
assert.ok(Math.abs(padded.north - 35.5) < 1e-12);
assert.deepEqual(padded, padCoverageViewport(bounds));
assert.throws(() => padCoverageViewport(bounds, -1));

console.log("Fog bbox, cutouts, adjacency, clipping, ring, coordinate-order, padding, immutability, and resolution checks passed.");
