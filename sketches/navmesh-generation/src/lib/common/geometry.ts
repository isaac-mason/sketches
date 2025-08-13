import type { Vec2, Vec3 } from '@/common/maaths';
import { vec2, vec3 } from '@/common/maaths';

const EPS = 1e-6;

/**
 * Calculates the closest point on a line segment to a given point in 2D (XZ plane)
 * @param closest Output parameter for the closest point
 * @param pt The point
 * @param p First endpoint of the segment
 * @param q Second endpoint of the segment
 */
export const closestPtSeg2d = (closest: Vec3, pt: Vec3, p: Vec3, q: Vec3): void => {
    const pqx = q[0] - p[0];
    const pqz = q[2] - p[2];
    const dx = pt[0] - p[0];
    const dz = pt[2] - p[2];

    const d = pqx * pqx + pqz * pqz;
    let t = pqx * dx + pqz * dz;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    closest[0] = p[0] + t * pqx;
    closest[1] = p[1]; // Keep original Y value from p
    closest[2] = p[2] + t * pqz;
};

/**
 * Tests if a point is inside a polygon in 2D (XZ plane)
 * @param nvert Number of vertices in the polygon
 * @param verts Array of vertex coordinates [x,y,z,x,y,z,...]
 * @param p The point to test
 * @returns True if the point is inside the polygon
 */
export const pointInPoly = (nvert: number, verts: number[], p: Vec3): boolean => {
    let c = false;
    let j = nvert - 1;

    for (let i = 0; i < nvert; j = i++) {
        const vi = verts.slice(i * 3, i * 3 + 3);
        const vj = verts.slice(j * 3, j * 3 + 3);

        if (vi[2] > p[2] !== vj[2] > p[2] && p[0] < ((vj[0] - vi[0]) * (p[2] - vi[2])) / (vj[2] - vi[2]) + vi[0]) {
            c = !c;
        }
    }

    return c;
};
// Helper functions for geometric calculations
/**
 * Calculates the squared distance from a point to a line segment in 2D (XZ plane)
 * @param pt The point
 * @param p First endpoint of the segment
 * @param q Second endpoint of the segment
 * @returns The squared distance
 */
export const distancePtSeg2dSqr = (pt: Vec3, p: Vec3, q: Vec3): number => {
    const pqx = q[0] - p[0];
    const pqz = q[2] - p[2];
    const dx = pt[0] - p[0];
    const dz = pt[2] - p[2];

    const d = pqx * pqx + pqz * pqz;
    let t = pqx * dx + pqz * dz;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const closestX = p[0] + t * pqx;
    const closestZ = p[2] + t * pqz;

    const distX = closestX - pt[0];
    const distZ = closestZ - pt[2];

    return distX * distX + distZ * distZ;
};

const _distPtTriV0: Vec3 = vec3.create();
const _distPtTriV1: Vec3 = vec3.create();
const _distPtTriV2: Vec3 = vec3.create();

const _distPtTriVec0: Vec2 = vec2.create();
const _distPtTriVec1: Vec2 = vec2.create();
const _distPtTriVec2: Vec2 = vec2.create();

export const distPtTri = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
    const v0 = _distPtTriV0;
    const v1 = _distPtTriV1;
    const v2 = _distPtTriV2;

    vec3.subtract(v0, c, a);
    vec3.subtract(v1, b, a);
    vec3.subtract(v2, p, a);

    _distPtTriVec0[0] = v0[0];
    _distPtTriVec0[1] = v0[2];

    _distPtTriVec1[0] = v1[0];
    _distPtTriVec1[1] = v1[2];

    _distPtTriVec2[0] = v2[0];
    _distPtTriVec2[1] = v2[2];

    const dot00 = vec2.dot(_distPtTriVec0, _distPtTriVec0);
    const dot01 = vec2.dot(_distPtTriVec0, _distPtTriVec1);
    const dot02 = vec2.dot(_distPtTriVec0, _distPtTriVec2);
    const dot11 = vec2.dot(_distPtTriVec1, _distPtTriVec1);
    const dot12 = vec2.dot(_distPtTriVec1, _distPtTriVec2);

    // Compute barycentric coordinates
    const invDenom = 1.0 / (dot00 * dot11 - dot01 * dot01);
    const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
    const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

    // If point lies inside the triangle, return interpolated y-coord.
    const EPS_TRI = 1e-4;
    if (u >= -EPS_TRI && v >= -EPS_TRI && u + v <= 1 + EPS_TRI) {
        const y = a[1] + v0[1] * u + v1[1] * v;
        return Math.abs(y - p[1]);
    }
    return Number.MAX_VALUE;
};

const _distPtSeg2dP: Vec2 = vec2.create();
const _distPtSeg2dQ: Vec2 = vec2.create();

export const distancePtSeg2d = (pt: Vec2, p: Vec2, q: Vec2): number => {
    const pq = _distPtSeg2dP;
    const d_vec = _distPtSeg2dQ;

    vec2.subtract(pq, q, p); // pq = q - p
    vec2.subtract(d_vec, pt, p); // d_vec = pt - p

    const d = vec2.dot(pq, pq);
    let t = vec2.dot(pq, d_vec);
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    // Calculate closest point on segment: p + t * pq
    vec2.scale(pq, pq, t);
    vec2.add(pq, p, pq);

    // Calculate distance vector: closest_point - pt
    vec2.subtract(pq, pq, pt);

    return vec2.dot(pq, pq); // Return squared distance
};

const _distPtTriA: Vec3 = vec3.create();
const _distPtTriB: Vec3 = vec3.create();
const _distPtTriC: Vec3 = vec3.create();

export const distToTriMesh = (p: Vec3, verts: number[], tris: number[], ntris: number): number => {
    let dmin = Number.MAX_VALUE;
    for (let i = 0; i < ntris; ++i) {
        const va = tris[i * 4 + 0] * 3;
        const vb = tris[i * 4 + 1] * 3;
        const vc = tris[i * 4 + 2] * 3;

        vec3.fromBuffer(_distPtTriA, verts, va);
        vec3.fromBuffer(_distPtTriB, verts, vb);
        vec3.fromBuffer(_distPtTriC, verts, vc);

        const d = distPtTri(p, _distPtTriA, _distPtTriB, _distPtTriC);
        if (d < dmin) dmin = d;
    }
    if (dmin === Number.MAX_VALUE) return -1;
    return dmin;
};

const _distToPolyVj: Vec2 = vec2.create();
const _distToPolyVi: Vec2 = vec2.create();
const _distToPolyP: Vec2 = vec2.create();

export const distToPoly = (nvert: number, verts: number[], p: Vec3): number => {
    let dmin = Number.MAX_VALUE;
    let c = 0;

    // Extract 2D point from Vec3 (XZ plane)
    _distToPolyP[0] = p[0];
    _distToPolyP[1] = p[2];

    for (let i = 0, j = nvert - 1; i < nvert; j = i++) {
        const vi = i * 3;
        const vj = j * 3;
        if (
            verts[vi + 2] > p[2] !== verts[vj + 2] > p[2] &&
            p[0] < ((verts[vj] - verts[vi]) * (p[2] - verts[vi + 2])) / (verts[vj + 2] - verts[vi + 2]) + verts[vi]
        ) {
            c = c === 0 ? 1 : 0;
        }

        _distToPolyVj[0] = verts[vj];
        _distToPolyVj[1] = verts[vj + 2];

        _distToPolyVi[0] = verts[vi];
        _distToPolyVi[1] = verts[vi + 2];

        dmin = Math.min(dmin, distancePtSeg2d(_distToPolyP, _distToPolyVj, _distToPolyVi));
    }
    return c ? -dmin : dmin;
};

const _distPtSegP: Vec3 = vec3.create();
const _distPtSegQ: Vec3 = vec3.create();

export const distancePtSeg = (pt: Vec3, p: Vec3, q: Vec3): number => {
    const pq = _distPtSegP;
    const d_vec = _distPtSegQ;

    vec3.subtract(pq, q, p); // pq = q - p
    vec3.subtract(d_vec, pt, p); // d_vec = pt - p

    const d = vec3.dot(pq, pq);
    let t = vec3.dot(pq, d_vec);
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    // Calculate closest point on segment: p + t * pq
    vec3.scale(pq, pq, t);
    vec3.add(pq, p, pq);

    // Calculate distance vector: closest_point - pt
    vec3.subtract(pq, pq, pt);

    return vec3.dot(pq, pq); // Return squared distance
};

/**
 * Calculates the height at a point using barycentric coordinates on a triangle
 * @param v0 First vertex of triangle
 * @param v1 Second vertex of triangle
 * @param v2 Third vertex of triangle
 * @param pos Position to calculate height for
 * @returns Height at position, or null if point is not inside triangle
 */
export const getHeightAtPoint = (v0: Vec3, v1: Vec3, v2: Vec3, pos: Vec3): number | null => {
    // Calculate barycentric coordinates
    const denom = (v1[2] - v2[2]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[2] - v2[2]);
    if (Math.abs(denom) < 1e-8) return null;

    const a = ((v1[2] - v2[2]) * (pos[0] - v2[0]) + (v2[0] - v1[0]) * (pos[2] - v2[2])) / denom;
    const b = ((v2[2] - v0[2]) * (pos[0] - v2[0]) + (v0[0] - v2[0]) * (pos[2] - v2[2])) / denom;
    const c = 1 - a - b;

    // Check if point is inside triangle
    if (a >= 0 && b >= 0 && c >= 0) {
        return a * v0[1] + b * v1[1] + c * v2[1];
    }

    return null;
};

const _circumCircleCenter: Vec3 = vec3.create();
const _circumCircleResultVec: Vec3 = vec3.create();

const _circumCircleV1 = vec3.create();
const _circumCircleV2 = vec3.create();
const _circumCircleV3 = vec3.create();

const _circumCircleV1Proj: Vec2 = vec2.create();
const _circumCircleV2Proj: Vec2 = vec2.create();
const _circumCircleV3Proj: Vec2 = vec2.create();
const _circumCircleCenter2D: Vec2 = vec2.create();
const _circumCircleRadiusCalc: Vec2 = vec2.create();

export type CircumCircleResult = {
    success: boolean;
    radius: number;
};

export const circumCircle = (result: CircumCircleResult, p1: Vec3, p2: Vec3, p3: Vec3, c: Vec3): void => {
    // Calculate the circle relative to p1, to avoid some precision issues.
    const v1 = _circumCircleV1;
    const v2 = _circumCircleV2;
    const v3 = _circumCircleV3;

    // v1 is the origin (p1 - p1 = 0), v2 and v3 are relative to p1
    vec3.set(v1, 0, 0, 0);
    vec3.subtract(v2, p2, p1);
    vec3.subtract(v3, p3, p1);

    // Calculate cross product for 2D vectors (v2 - v1) × (v3 - v1)
    _circumCircleV1Proj[0] = v1[0];
    _circumCircleV1Proj[1] = v1[2];

    _circumCircleV2Proj[0] = v2[0];
    _circumCircleV2Proj[1] = v2[2];

    _circumCircleV3Proj[0] = v3[0];
    _circumCircleV3Proj[1] = v3[2];

    vec2.subtract(_circumCircleV2Proj, _circumCircleV2Proj, _circumCircleV1Proj); // v2 - v1
    vec2.subtract(_circumCircleV3Proj, _circumCircleV3Proj, _circumCircleV1Proj); // v3 - v1
    const cp = _circumCircleV2Proj[0] * _circumCircleV3Proj[1] - _circumCircleV2Proj[1] * _circumCircleV3Proj[0];

    if (Math.abs(cp) > EPS) {
        _circumCircleV1Proj[0] = v1[0];
        _circumCircleV1Proj[1] = v1[2];

        _circumCircleV2Proj[0] = v2[0];
        _circumCircleV2Proj[1] = v2[2];

        _circumCircleV3Proj[0] = v3[0];
        _circumCircleV3Proj[1] = v3[2];

        const v1Sq = vec2.dot(_circumCircleV1Proj, _circumCircleV1Proj);
        const v2Sq = vec2.dot(_circumCircleV2Proj, _circumCircleV2Proj);
        const v3Sq = vec2.dot(_circumCircleV3Proj, _circumCircleV3Proj);
        c[0] = (v1Sq * (v2[2] - v3[2]) + v2Sq * (v3[2] - v1[2]) + v3Sq * (v1[2] - v2[2])) / (2 * cp);
        c[1] = 0;
        c[2] = (v1Sq * (v3[0] - v2[0]) + v2Sq * (v1[0] - v3[0]) + v3Sq * (v2[0] - v1[0])) / (2 * cp);

        _circumCircleCenter2D[0] = c[0];
        _circumCircleCenter2D[1] = c[2];

        _circumCircleRadiusCalc[0] = v1[0];
        _circumCircleRadiusCalc[1] = v1[2];

        const r = vec2.distance(_circumCircleCenter2D, _circumCircleRadiusCalc);

        const cVec = vec3.copy(_circumCircleCenter, c);
        const resultVec = _circumCircleResultVec;
        vec3.add(resultVec, cVec, p1);
        vec3.set(c, resultVec[0], resultVec[1], resultVec[2]);

        result.success = true;
        result.radius = r;
        return;
    }

    vec3.set(c, p1[0], p1[1], p1[2]);
    result.success = false;
    result.radius = 0;
};

const _overlapSegAB: Vec2 = vec2.create();
const _overlapSegAD: Vec2 = vec2.create();
const _overlapSegAC: Vec2 = vec2.create();
const _overlapSegCD: Vec2 = vec2.create();
const _overlapSegCA: Vec2 = vec2.create();

// Segment overlap checking
export const overlapSegSeg2d = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
    // calculate cross products for line segment intersection test
    const ab = _overlapSegAB;
    const ad = _overlapSegAD;
    const ac = _overlapSegAC;

    vec2.subtract(ab, b, a); // b - a
    vec2.subtract(ad, d, a); // d - a
    const a1 = ab[0] * ad[1] - ab[1] * ad[0];

    vec2.subtract(ac, c, a); // c - a
    const a2 = ab[0] * ac[1] - ab[1] * ac[0];

    if (a1 * a2 < 0.0) {
        const cd = _overlapSegCD;
        const ca = _overlapSegCA;

        vec2.subtract(cd, d, c); // d - c
        vec2.subtract(ca, a, c); // a - c
        const a3 = cd[0] * ca[1] - cd[1] * ca[0];
        const a4 = a3 + a2 - a1;
        if (a3 * a4 < 0.0) return true;
    }
    return false;
};

/**
 * 2D signed area in XZ plane (positive if c is to the left of ab)
 * Matches C++ dtTriArea2D: return acx*abz - abx*acz;
 */
export const triArea2D = (a: Vec3, b: Vec3, c: Vec3): number => {
    const abx = b[0] - a[0];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acz = c[2] - a[2];
    return acx * abz - abx * acz;
};

export type IntersectSegSeg2DResult = { hit: boolean; s: number; t: number };
export const createIntersectSegSeg2DResult = (): IntersectSegSeg2DResult => ({ hit: false, s: 0, t: 0 });

/**
 * Segment-segment intersection in XZ plane.
 * Returns tuple [hit, s, t] where
 *  P = a + s*(b-a) and Q = c + t*(d-c). Hit only if both s and t are within [0,1].
 */
export const intersectSegSeg2D = (out: IntersectSegSeg2DResult, a: Vec3, b: Vec3, c: Vec3, d: Vec3): boolean => {
    const bax = b[0] - a[0];
    const baz = b[2] - a[2];
    const dcx = d[0] - c[0];
    const dcz = d[2] - c[2];
    const acx = a[0] - c[0];
    const acz = a[2] - c[2];
    const denom = dcz * bax - dcx * baz;
    if (Math.abs(denom) < 1e-12) {
        out.hit = false;
        out.s = 0;
        out.t = 0;
        return false;
    }
    const s = (dcx * acz - dcz * acx) / denom;
    const t = (bax * acz - baz * acx) / denom;
    const hit = !(s < 0 || s > 1 || t < 0 || t > 1);
    out.hit = hit;
    out.s = s;
    out.t = t;
    return hit;
};

const _polyMinExtentPt: Vec2 = vec2.create();
const _polyMinExtentP1: Vec2 = vec2.create();
const _polyMinExtentP2: Vec2 = vec2.create();

// calculate minimum extend of the polygon.
export const polyMinExtent = (verts: number[], nverts: number): number => {
    let minDist = Number.MAX_VALUE;

    for (let i = 0; i < nverts; i++) {
        const ni = (i + 1) % nverts;
        const p1 = i * 3;
        const p2 = ni * 3;
        let maxEdgeDist = 0;
        for (let j = 0; j < nverts; j++) {
            if (j === i || j === ni) continue;

            const ptIdx = j * 3;
            _polyMinExtentPt[0] = verts[ptIdx];
            _polyMinExtentPt[1] = verts[ptIdx + 2];

            _polyMinExtentP1[0] = verts[p1];
            _polyMinExtentP1[1] = verts[p1 + 2];

            _polyMinExtentP2[0] = verts[p2];
            _polyMinExtentP2[1] = verts[p2 + 2];

            const d = distancePtSeg2d(_polyMinExtentPt, _polyMinExtentP1, _polyMinExtentP2);
            maxEdgeDist = Math.max(maxEdgeDist, d);
        }
        minDist = Math.min(minDist, maxEdgeDist);
    }

    return Math.sqrt(minDist);
};

/**
 * Derives the xz-plane 2D perp product of the two vectors. (uz*vx - ux*vz)
 * The vectors are projected onto the xz-plane, so the y-values are ignored.
 * @param u The LHV vector [(x, y, z)]
 * @param v The RHV vector [(x, y, z)]
 * @returns The perp dot product on the xz-plane.
 */
const vperp2D = (u: Vec3, v: Vec3): number => {
    return u[2] * v[0] - u[0] * v[2];
};

export type IntersectSegmentPoly2DResult = {
    intersects: boolean;
    tmin: number;
    tmax: number;
    segMin: number;
    segMax: number;
};

export const createIntersectSegmentPoly2DResult = (): IntersectSegmentPoly2DResult => ({
    intersects: false,
    tmin: 0,
    tmax: 0,
    segMin: -1,
    segMax: -1,
});

const _intersectSegmentPoly2DVi = vec3.create();
const _intersectSegmentPoly2DVj = vec3.create();
const _intersectSegmentPoly2DDir = vec3.create();
const _intersectSegmentPoly2DToStart = vec3.create();
const _intersectSegmentPoly2DEdge = vec3.create();

/**
 * Intersects a segment with a polygon in 2D (ignoring Y).
 * Uses the Sutherland-Hodgman clipping algorithm approach.
 *
 * @param result - The result object to store intersection data
 * @param startPos - Start position of the segment
 * @param endPos - End position of the segment
 * @param verts - Polygon vertices as flat array [x,y,z,x,y,z,...]
 * @param nv - Number of vertices in the polygon
 */
export const intersectSegmentPoly2D = (
    result: IntersectSegmentPoly2DResult,
    startPos: Vec3,
    endPos: Vec3,
    verts: number[],
): IntersectSegmentPoly2DResult => {
    result.intersects = false;
    result.tmin = 0;
    result.tmax = 1;
    result.segMin = -1;
    result.segMax = -1;

    const dir = vec3.subtract(_intersectSegmentPoly2DDir, endPos, startPos);

    const vi = _intersectSegmentPoly2DVi;
    const vj = _intersectSegmentPoly2DVj;
    const edge = _intersectSegmentPoly2DEdge;
    const diff = _intersectSegmentPoly2DToStart;

    const nv = verts.length / 3;
    for (let i = 0, j = nv - 1; i < nv; j = i, i++) {
        vec3.fromBuffer(vi, verts, i * 3);
        vec3.fromBuffer(vj, verts, j * 3);

        vec3.subtract(edge, vi, vj);
        vec3.subtract(diff, startPos, vj);

        const n = vperp2D(edge, diff);
        const d = vperp2D(dir, edge);

        if (Math.abs(d) < EPS) {
            // S is nearly parallel to this edge
            if (n < 0) {
                return result;
            }

            continue;
        }

        const t = n / d;

        if (d < 0) {
            // segment S is entering across this edge
            if (t > result.tmin) {
                result.tmin = t;
                result.segMin = j;
                // S enters after leaving polygon
                if (result.tmin > result.tmax) {
                    return result;
                }
            }
        } else {
            // segment S is leaving across this edge
            if (t < result.tmax) {
                result.tmax = t;
                result.segMax = j;
                // S leaves before entering polygon
                if (result.tmax < result.tmin) {
                    return result;
                }
            }
        }
    }

    result.intersects = true;

    return result;
};

const _randomPointInConvexPolyVa = vec3.create();
const _randomPointInConvexPolyVb = vec3.create();
const _randomPointInConvexPolyVc = vec3.create();

/**
 * Generates a random point inside a convex polygon using barycentric coordinates.
 *
 * @param verts - Polygon vertices as flat array [x,y,z,x,y,z,...]
 * @param areas - Temporary array for triangle areas (will be modified)
 * @param s - Random value [0,1] for triangle selection
 * @param t - Random value [0,1] for point within triangle
 * @param out - Output point [x,y,z]
 */
export const randomPointInConvexPoly = (out: Vec3, verts: number[], areas: number[], s: number, t: number): Vec3 => {
    const nv = verts.length / 3;

    // calculate cumulative triangle areas for weighted selection
    let areaSum = 0;
    for (let i = 2; i < nv; i++) {
        const va = [verts[0], verts[1], verts[2]] as Vec3;
        const vb = [verts[(i - 1) * 3], verts[(i - 1) * 3 + 1], verts[(i - 1) * 3 + 2]] as Vec3;
        const vc = [verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]] as Vec3;
        areas[i] = triArea2D(va, vb, vc);
        areaSum += Math.max(0.001, areas[i]);
    }

    // choose triangle based on area-weighted random selection
    const thr = s * areaSum;
    let acc = 0;
    let tri = nv - 1;
    for (let i = 2; i < nv; i++) {
        acc += Math.max(0.001, areas[i]);
        if (thr <= acc) {
            tri = i;
            break;
        }
    }

    // generate random point in triangle using barycentric coordinates
    // standard method: use square root for uniform distribution
    let u = Math.sqrt(t);
    let v = 1 - t;

    // ensure the point is inside the triangle
    if (u + v > 1) {
        u = 1 - u;
        v = 1 - v;
    }

    const w = 1 - u - v;

    const va = vec3.set(_randomPointInConvexPolyVa, verts[0], verts[1], verts[2]);
    const vb = vec3.set(_randomPointInConvexPolyVb, verts[(tri - 1) * 3], verts[(tri - 1) * 3 + 1], verts[(tri - 1) * 3 + 2]);
    const vc = vec3.set(_randomPointInConvexPolyVc, verts[tri * 3], verts[tri * 3 + 1], verts[tri * 3 + 2]);

    out[0] = u * va[0] + v * vb[0] + w * vc[0];
    out[1] = u * va[1] + v * vb[1] + w * vc[1];
    out[2] = u * va[2] + v * vb[2] + w * vc[2];

    return out;
};
