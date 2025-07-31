import { vec3, vec2, clamp, type Vec3, type Vec2 } from '@/common/maaths';
import {
    MESH_NULL_IDX,
    MULTIPLE_REGS,
    getDirForOffset,
    getDirOffsetX,
    getDirOffsetY,
} from './common';
import type { CompactHeightfield } from './compact-heightfield';
import { getCon } from './compact-heightfield';
import { NOT_CONNECTED } from './common';
import type { PolyMesh } from './poly-mesh';

/**
 * Contains triangle meshes that represent detailed height data associated
 * with the polygons in its associated polygon mesh object.
 */
export type PolyMeshDetail = {
    /** The sub-mesh data. Size: 4*nMeshes. Layout: [verticesBase1, trianglesBase1, verticesCount1, trianglesCount1, ...] */
    meshes: number[];
    /** The mesh vertices. Size: 3*nVertices */
    vertices: number[];
    /** The mesh triangles. Size: 4*nTriangles */
    triangles: number[];
    /** The number of sub-meshes defined by meshes */
    nMeshes: number;
    /** The number of vertices in verts */
    nVertices: number;
    /** The number of triangles in tris */
    nTriangles: number;
};

// Constants
const UNSET_HEIGHT = 0xffff;
const DETAIL_EDGE_BOUNDARY = 0x1;
const MAX_VERTS = 127;
const MAX_TRIS = 255;
const MAX_VERTS_PER_EDGE = 32;
const RETRACT_SIZE = 256;
const EPS = 1e-6;

// Edge values enum
const EV_UNDEF = -1;
const EV_HULL = -2;

// Height patch structure
type HeightPatch = {
    data: number[];
    xmin: number;
    ymin: number;
    width: number;
    height: number;
};

// CircumCircle result structure
type CircumCircleResult = {
    success: boolean;
    radius: number;
};

// Helper functions for working with array views (to avoid allocations)
const getVec3 = (out: Vec3, arr: number[], index: number): Vec3 => {
    out[0] = arr[index];
    out[1] = arr[index + 1];
    out[2] = arr[index + 2];
    return out;
};

const setVec3 = (
    arr: number[],
    index: number,
    x: number,
    y: number,
    z: number,
): void => {
    arr[index] = x;
    arr[index + 1] = y;
    arr[index + 2] = z;
};


const _circumCircleV1Proj: Vec2 = vec2.create();
const _circumCircleV2Proj: Vec2 = vec2.create();
const _circumCircleV3Proj: Vec2 = vec2.create();
const _circumCircleCenter2D: Vec2 = vec2.create();
const _circumCircleRadiusCalc: Vec2 = vec2.create();

// Helper to extract 2D vector from 3D array (x, z components)
const getVec2XZ = (out: Vec2, arr: number[], index = 0): Vec2 => {
    out[0] = arr[index]; // x component
    out[1] = arr[index + 2]; // z component (skip y)
    return out;
};

const _circumCircleP1: Vec3 = vec3.create();
const _circumCircleP2: Vec3 = vec3.create();
const _circumCircleP3: Vec3 = vec3.create();
const _circumCircleCenter: Vec3 = vec3.create();
const _circumCircleResultVec: Vec3 = vec3.create();

const _circumCircleV1 = vec3.create();
const _circumCircleV2 = vec3.create();
const _circumCircleV3 = vec3.create();

const _circumCircleResult: CircumCircleResult = {
    success: false,
    radius: 0,
};

// Geometric utility functions
const circumCircle = (
    result: CircumCircleResult,
    p1: Vec3,
    p2: Vec3,
    p3: Vec3,
    c: Vec3,
): void => {
    // Calculate the circle relative to p1, to avoid some precision issues.
    const v1 = _circumCircleV1;
    const v2 = _circumCircleV2;
    const v3 = _circumCircleV3;

    // v1 is the origin (p1 - p1 = 0), v2 and v3 are relative to p1
    vec3.set(v1, 0, 0, 0);
    vec3.subtract(v2, p2, p1);
    vec3.subtract(v3, p3, p1);

    // Calculate cross product for 2D vectors (v2 - v1) × (v3 - v1)
    getVec2XZ(_circumCircleV1Proj, v1);
    getVec2XZ(_circumCircleV2Proj, v2);
    getVec2XZ(_circumCircleV3Proj, v3);
    vec2.subtract(_circumCircleV2Proj, _circumCircleV2Proj, _circumCircleV1Proj); // v2 - v1
    vec2.subtract(_circumCircleV3Proj, _circumCircleV3Proj, _circumCircleV1Proj); // v3 - v1
    const cp = _circumCircleV2Proj[0] * _circumCircleV3Proj[1] - _circumCircleV2Proj[1] * _circumCircleV3Proj[0];

    if (Math.abs(cp) > EPS) {
        getVec2XZ(_circumCircleV1Proj, v1);
        getVec2XZ(_circumCircleV2Proj, v2);
        getVec2XZ(_circumCircleV3Proj, v3);
        const v1Sq = vec2.dot(_circumCircleV1Proj, _circumCircleV1Proj);
        const v2Sq = vec2.dot(_circumCircleV2Proj, _circumCircleV2Proj);
        const v3Sq = vec2.dot(_circumCircleV3Proj, _circumCircleV3Proj);
        c[0] =
            (v1Sq * (v2[2] - v3[2]) +
                v2Sq * (v3[2] - v1[2]) +
                v3Sq * (v1[2] - v2[2])) /
            (2 * cp);
        c[1] = 0;
        c[2] =
            (v1Sq * (v3[0] - v2[0]) +
                v2Sq * (v1[0] - v3[0]) +
                v3Sq * (v2[0] - v1[0])) /
            (2 * cp);
        getVec2XZ(_circumCircleCenter2D, c);
        getVec2XZ(_circumCircleRadiusCalc, v1);
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

const _distPtTriV0: Vec3 = vec3.create();
const _distPtTriV1: Vec3 = vec3.create();
const _distPtTriV2: Vec3 = vec3.create();

const _distPtTriVec0: Vec2 = vec2.create();
const _distPtTriVec1: Vec2 = vec2.create();
const _distPtTriVec2: Vec2 = vec2.create();

const distPtTri = (p: Vec3, a: Vec3, b: Vec3, c: Vec3): number => {
    const v0 = _distPtTriV0;
    const v1 = _distPtTriV1;
    const v2 = _distPtTriV2;

    vec3.subtract(v0, c, a);
    vec3.subtract(v1, b, a);
    vec3.subtract(v2, p, a);

    getVec2XZ(_distPtTriVec0, v0);
    getVec2XZ(_distPtTriVec1, v1);
    getVec2XZ(_distPtTriVec2, v2);

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

const _distPtSegP: Vec3 = vec3.create();
const _distPtSegQ: Vec3 = vec3.create();

const distancePtSeg = (pt: Vec3, p: Vec3, q: Vec3): number => {
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

const _distPtSeg2dP: Vec2 = vec2.create();
const _distPtSeg2dQ: Vec2 = vec2.create();

const distancePtSeg2d = (pt: Vec2, p: Vec2, q: Vec2): number => {
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

const distToTriMesh = (
    p: Vec3,
    verts: number[],
    tris: number[],
    ntris: number,
): number => {
    let dmin = Number.MAX_VALUE;
    for (let i = 0; i < ntris; ++i) {
        const va = tris[i * 4 + 0] * 3;
        const vb = tris[i * 4 + 1] * 3;
        const vc = tris[i * 4 + 2] * 3;

        getVec3(_distPtTriA, verts, va);
        getVec3(_distPtTriB, verts, vb);
        getVec3(_distPtTriC, verts, vc);

        const d = distPtTri(p, _distPtTriA, _distPtTriB, _distPtTriC);
        if (d < dmin) dmin = d;
    }
    if (dmin === Number.MAX_VALUE) return -1;
    return dmin;
};

const _distToPolyVj: Vec2 = vec2.create();
const _distToPolyVi: Vec2 = vec2.create();
const _distToPolyP: Vec2 = vec2.create();

const distToPoly = (nvert: number, verts: number[], p: Vec3): number => {
    let dmin = Number.MAX_VALUE;
    let c = 0;

    // Extract 2D point from Vec3 (XZ plane)
    getVec2XZ(_distToPolyP, p);

    for (let i = 0, j = nvert - 1; i < nvert; j = i++) {
        const vi = i * 3;
        const vj = j * 3;
        if (
            verts[vi + 2] > p[2] !== verts[vj + 2] > p[2] &&
            p[0] <
                ((verts[vj] - verts[vi]) * (p[2] - verts[vi + 2])) /
                    (verts[vj + 2] - verts[vi + 2]) +
                    verts[vi]
        ) {
            c = c === 0 ? 1 : 0;
        }
        getVec2XZ(_distToPolyVj, verts, vj);
        getVec2XZ(_distToPolyVi, verts, vi);
        dmin = Math.min(
            dmin,
            distancePtSeg2d(_distToPolyP, _distToPolyVj, _distToPolyVi),
        );
    }
    return c ? -dmin : dmin;
};

// Jitter functions for sampling
const getJitterX = (i: number): number => {
    return (((i * 0x8da6b343) & 0xffff) / 65535.0) * 2.0 - 1.0;
};

const getJitterY = (i: number): number => {
    return (((i * 0xd8163841) & 0xffff) / 65535.0) * 2.0 - 1.0;
};

const _polyMinExtentPt: Vec2 = vec2.create();
const _polyMinExtentP1: Vec2 = vec2.create();
const _polyMinExtentP2: Vec2 = vec2.create();

// Calculate minimum extend of the polygon.
const polyMinExtent = (verts: number[], nverts: number): number => {
    let minDist = Number.MAX_VALUE;
    for (let i = 0; i < nverts; i++) {
        const ni = (i + 1) % nverts;
        const p1 = i * 3;
        const p2 = ni * 3;
        let maxEdgeDist = 0;
        for (let j = 0; j < nverts; j++) {
            if (j === i || j === ni) continue;
            getVec2XZ(_polyMinExtentPt, verts, j * 3);
            getVec2XZ(_polyMinExtentP1, verts, p1);
            getVec2XZ(_polyMinExtentP2, verts, p2);
            const d = distancePtSeg2d(
                _polyMinExtentPt,
                _polyMinExtentP1,
                _polyMinExtentP2,
            );
            maxEdgeDist = Math.max(maxEdgeDist, d);
        }
        minDist = Math.min(minDist, maxEdgeDist);
    }
    return Math.sqrt(minDist);
};

// Helper functions for array navigation
const prev = (i: number, n: number): number => (i - 1 >= 0 ? i - 1 : n - 1);
const next = (i: number, n: number): number => (i + 1 < n ? i + 1 : 0);

// Height sampling function with spiral search
const getHeight = (
    fx: number,
    fy: number,
    fz: number,
    cs: number,
    ics: number,
    ch: number,
    radius: number,
    hp: HeightPatch,
): number => {
    let ix = Math.floor(fx * ics + 0.01);
    let iz = Math.floor(fz * ics + 0.01);
    ix = clamp(ix - hp.xmin, 0, hp.width - 1);
    iz = clamp(iz - hp.ymin, 0, hp.height - 1);
    let h = hp.data[ix + iz * hp.width];

    if (h === UNSET_HEIGHT) {
        // Special case when data might be bad.
        // Walk adjacent cells in a spiral up to 'radius', and look
        // for a pixel which has a valid height.
        let x = 1;
        let z = 0;
        let dx = 1;
        let dz = 0;
        const maxSize = radius * 2 + 1;
        const maxIter = maxSize * maxSize - 1;

        let nextRingIterStart = 8;
        let nextRingIters = 16;

        let dmin = Number.MAX_VALUE;
        for (let i = 0; i < maxIter; i++) {
            const nx = ix + x;
            const nz = iz + z;

            if (nx >= 0 && nz >= 0 && nx < hp.width && nz < hp.height) {
                const nh = hp.data[nx + nz * hp.width];
                if (nh !== UNSET_HEIGHT) {
                    const d = Math.abs(nh * ch - fy);
                    if (d < dmin) {
                        h = nh;
                        dmin = d;
                    }
                }
            }

            // We are searching in a grid which looks approximately like this:
            //  __________
            // |2 ______ 2|
            // | |1 __ 1| |
            // | | |__| | |
            // | |______| |
            // |__________|
            // We want to find the best height as close to the center cell as possible.
            if (i + 1 === nextRingIterStart) {
                if (h !== UNSET_HEIGHT) break;

                nextRingIterStart += nextRingIters;
                nextRingIters += 8;
            }

            if (x === z || (x < 0 && x === -z) || (x > 0 && x === 1 - z)) {
                const tmp = dx;
                dx = -dz;
                dz = tmp;
            }
            x += dx;
            z += dz;
        }
    }
    return h;
};

// Edge management functions for triangulation
const findEdge = (
    edges: number[],
    nedges: number,
    s: number,
    t: number,
): number => {
    for (let i = 0; i < nedges; i++) {
        const e = i * 4;
        if (
            (edges[e] === s && edges[e + 1] === t) ||
            (edges[e] === t && edges[e + 1] === s)
        ) {
            return i;
        }
    }
    return EV_UNDEF;
};

const addEdge = (
    edges: number[],
    nedges: { value: number },
    maxEdges: number,
    s: number,
    t: number,
    l: number,
    r: number,
): number => {
    if (nedges.value >= maxEdges) {
        console.error(`addEdge: Too many edges (${nedges.value}/${maxEdges}).`);
        return EV_UNDEF;
    }

    // Add edge if not already in the triangulation.
    const e = findEdge(edges, nedges.value, s, t);
    if (e === EV_UNDEF) {
        const edgeIdx = nedges.value * 4;
        edges[edgeIdx] = s;
        edges[edgeIdx + 1] = t;
        edges[edgeIdx + 2] = l;
        edges[edgeIdx + 3] = r;
        return nedges.value++;
    }
    return EV_UNDEF;
};

const _completeFacetC = vec3.create();
const _completeFacetPointS: Vec2 = vec2.create();
const _completeFacetPointT: Vec2 = vec2.create();
const _completeFacetPointU: Vec2 = vec2.create();
const _completeFacetCircleCenter: Vec2 = vec2.create();
const _completeFacetDistanceCalc: Vec2 = vec2.create();

// Triangle completion function for Delaunay triangulation
const completeFacet = (
    points: number[],
    nPoints: number,
    edges: number[],
    nEdges: { value: number },
    maxEdges: number,
    nFaces: { value: number },
    e: number,
): void => {
    const EPS_FACET = 1e-5;

    const edgeIdx = e * 4;

    // Cache s and t.
    let s: number;
    let t: number;
    if (edges[edgeIdx + 2] === EV_UNDEF) {
        s = edges[edgeIdx];
        t = edges[edgeIdx + 1];
    } else if (edges[edgeIdx + 3] === EV_UNDEF) {
        s = edges[edgeIdx + 1];
        t = edges[edgeIdx];
    } else {
        // Edge already completed.
        return;
    }

    // Find best point on left of edge.
    let pt = nPoints;
    const c = _completeFacetC;
    let r = -1;

    for (let u = 0; u < nPoints; ++u) {
        if (u === s || u === t) continue;
        // Calculate cross product to check if points are in correct order for triangle
        getVec2XZ(_completeFacetPointS, points, s * 3);
        getVec2XZ(_completeFacetPointT, points, t * 3);
        getVec2XZ(_completeFacetPointU, points, u * 3);
        vec2.subtract(_completeFacetPointT, _completeFacetPointT, _completeFacetPointS); // t - s
        vec2.subtract(_completeFacetPointU, _completeFacetPointU, _completeFacetPointS); // u - s
        const crossProduct =
            _completeFacetPointT[0] * _completeFacetPointU[1] - _completeFacetPointT[1] * _completeFacetPointU[0];

        if (crossProduct > EPS_FACET) {
            if (r < 0) {
                // The circle is not updated yet, do it now.
                pt = u;
                getVec3(_circumCircleP1, points, s * 3);
                getVec3(_circumCircleP2, points, t * 3);
                getVec3(_circumCircleP3, points, u * 3);
                circumCircle(
                    _circumCircleResult,
                    _circumCircleP1,
                    _circumCircleP2,
                    _circumCircleP3,
                    c,
                );
                r = _circumCircleResult.radius;
                continue;
            }
            getVec2XZ(_completeFacetCircleCenter, c, 0);
            getVec2XZ(_completeFacetDistanceCalc, points, u * 3);
            const d = vec2.distance(_completeFacetCircleCenter, _completeFacetDistanceCalc);
            const tol = 0.001;

            if (d > r * (1 + tol)) {
                // Outside current circumcircle, skip.
                continue;
            }

            if (d < r * (1 - tol)) {
                // Inside safe circumcircle, update circle.
                pt = u;
                getVec3(_circumCircleP1, points, s * 3);
                getVec3(_circumCircleP2, points, t * 3);
                getVec3(_circumCircleP3, points, u * 3);
                circumCircle(
                    _circumCircleResult,
                    _circumCircleP1,
                    _circumCircleP2,
                    _circumCircleP3,
                    c,
                );
                r = _circumCircleResult.radius;
            } else {
                // Inside epsilon circumcircle, do extra tests to make sure the edge is valid.
                if (overlapEdges(points, edges, nEdges.value, s, u)) continue;
                if (overlapEdges(points, edges, nEdges.value, t, u)) continue;
                // Edge is valid.
                pt = u;
                getVec3(_circumCircleP1, points, s * 3);
                getVec3(_circumCircleP2, points, t * 3);
                getVec3(_circumCircleP3, points, u * 3);
                circumCircle(
                    _circumCircleResult,
                    _circumCircleP1,
                    _circumCircleP2,
                    _circumCircleP3,
                    c,
                );
                r = _circumCircleResult.radius;
            }
        }
    }

    // Add new triangle or update edge info if s-t is on hull.
    if (pt < nPoints) {
        // Update face information of edge being completed.
        updateLeftFace(edges, e, s, t, nFaces.value);

        // Add new edge or update face info of old edge.
        let newE = findEdge(edges, nEdges.value, pt, s);
        if (newE === EV_UNDEF) {
            addEdge(edges, nEdges, maxEdges, pt, s, nFaces.value, EV_UNDEF);
        } else {
            updateLeftFace(edges, newE, pt, s, nFaces.value);
        }

        // Add new edge or update face info of old edge.
        newE = findEdge(edges, nEdges.value, t, pt);
        if (newE === EV_UNDEF) {
            addEdge(edges, nEdges, maxEdges, t, pt, nFaces.value, EV_UNDEF);
        } else {
            updateLeftFace(edges, newE, t, pt, nFaces.value);
        }

        nFaces.value++;
    } else {
        updateLeftFace(edges, e, s, t, EV_HULL);
    }
};

const updateLeftFace = (
    edges: number[],
    edgeIdx: number,
    s: number,
    t: number,
    f: number,
): void => {
    const e = edgeIdx * 4;
    if (edges[e] === s && edges[e + 1] === t && edges[e + 2] === EV_UNDEF) {
        edges[e + 2] = f;
    } else if (
        edges[e + 1] === s &&
        edges[e] === t &&
        edges[e + 3] === EV_UNDEF
    ) {
        edges[e + 3] = f;
    }
};

const _overlapSegAB: Vec2 = vec2.create();
const _overlapSegAD: Vec2 = vec2.create();
const _overlapSegAC: Vec2 = vec2.create();
const _overlapSegCD: Vec2 = vec2.create();
const _overlapSegCA: Vec2 = vec2.create();

// Segment overlap checking
const overlapSegSeg2d = (a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean => {
    // Calculate cross products for line segment intersection test
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

// Pre-allocated Vec2 objects for overlapEdges function
const _overlapEdgesS0: Vec2 = vec2.create();
const _overlapEdgesT0: Vec2 = vec2.create();
const _overlapEdgesS1: Vec2 = vec2.create();
const _overlapEdgesT1: Vec2 = vec2.create();

const overlapEdges = (
    pts: number[],
    edges: number[],
    nedges: number,
    s1: number,
    t1: number,
): boolean => {
    for (let i = 0; i < nedges; ++i) {
        const s0 = edges[i * 4];
        const t0 = edges[i * 4 + 1];
        // Same or connected edges do not overlap.
        if (s0 === s1 || s0 === t1 || t0 === s1 || t0 === t1) continue;
        getVec2XZ(_overlapEdgesS0, pts, s0 * 3);
        getVec2XZ(_overlapEdgesT0, pts, t0 * 3);
        getVec2XZ(_overlapEdgesS1, pts, s1 * 3);
        getVec2XZ(_overlapEdgesT1, pts, t1 * 3);
        if (
            overlapSegSeg2d(
                _overlapEdgesS0,
                _overlapEdgesT0,
                _overlapEdgesS1,
                _overlapEdgesT1,
            )
        )
            return true;
    }
    return false;
};

// Delaunay triangulation hull function
const delaunayHull = (
    npts: number,
    pts: number[],
    nhull: number,
    hull: number[],
    tris: number[],
    edges: number[],
): void => {
    const nfaces = { value: 0 };
    const nedges = { value: 0 };
    const maxEdges = npts * 10;

    // Resize edges array
    edges.length = maxEdges * 4;

    for (let i = 0, j = nhull - 1; i < nhull; j = i++) {
        addEdge(edges, nedges, maxEdges, hull[j], hull[i], EV_HULL, EV_UNDEF);
    }

    let currentEdge = 0;
    while (currentEdge < nedges.value) {
        if (edges[currentEdge * 4 + 2] === EV_UNDEF) {
            completeFacet(
                pts,
                npts,
                edges,
                nedges,
                maxEdges,
                nfaces,
                currentEdge,
            );
        }
        if (edges[currentEdge * 4 + 3] === EV_UNDEF) {
            completeFacet(
                pts,
                npts,
                edges,
                nedges,
                maxEdges,
                nfaces,
                currentEdge,
            );
        }
        currentEdge++;
    }

    // Create tris
    tris.length = nfaces.value * 4;
    for (let i = 0; i < nfaces.value * 4; ++i) {
        tris[i] = -1;
    }

    for (let i = 0; i < nedges.value; ++i) {
        const e = i * 4;
        if (edges[e + 3] >= 0) {
            // Left face
            const t = edges[e + 3] * 4;
            if (tris[t] === -1) {
                tris[t] = edges[e];
                tris[t + 1] = edges[e + 1];
            } else if (tris[t] === edges[e + 1]) {
                tris[t + 2] = edges[e];
            } else if (tris[t + 1] === edges[e]) {
                tris[t + 2] = edges[e + 1];
            }
        }
        if (edges[e + 2] >= 0) {
            // Right
            const t = edges[e + 2] * 4;
            if (tris[t] === -1) {
                tris[t] = edges[e + 1];
                tris[t + 1] = edges[e];
            } else if (tris[t] === edges[e]) {
                tris[t + 2] = edges[e + 1];
            } else if (tris[t + 1] === edges[e + 1]) {
                tris[t + 2] = edges[e];
            }
        }
    }

    // Remove dangling faces
    for (let i = 0; i < tris.length / 4; ++i) {
        const t = i * 4;
        if (tris[t] === -1 || tris[t + 1] === -1 || tris[t + 2] === -1) {
            console.warn(
                `delaunayHull: Removing dangling face ${i} [${tris[t]},${tris[t + 1]},${tris[t + 2]}].`,
            );
            tris[t] = tris[tris.length - 4];
            tris[t + 1] = tris[tris.length - 3];
            tris[t + 2] = tris[tris.length - 2];
            tris[t + 3] = tris[tris.length - 1];
            tris.length -= 4;
            --i;
        }
    }
};

// Hull triangulation function (fallback when delaunay is not used)
const triangulateHull = (
    verts: number[],
    nhull: number,
    hull: number[],
    nin: number,
    tris: number[],
): void => {
    let start = 0;
    let left = 1;
    let right = nhull - 1;

    // Start from an ear with shortest perimeter.
    let dmin = Number.MAX_VALUE;
    for (let i = 0; i < nhull; i++) {
        if (hull[i] >= nin) continue; // Ears are triangles with original vertices as middle vertex
        const pi = prev(i, nhull);
        const ni = next(i, nhull);
        const pv = hull[pi] * 3;
        const cv = hull[i] * 3;
        const nv = hull[ni] * 3;
        // Calculate triangle perimeter using 2D distances
        getVec2XZ(_triangulateHullPrev, verts, pv);
        getVec2XZ(_triangulateHullCurrent, verts, cv);
        getVec2XZ(_triangulateHullNext, verts, nv);

        const d =
            vec2.distance(_triangulateHullPrev, _triangulateHullCurrent) +
            vec2.distance(_triangulateHullCurrent, _triangulateHullNext) +
            vec2.distance(_triangulateHullNext, _triangulateHullPrev);
        if (d < dmin) {
            start = i;
            left = ni;
            right = pi;
            dmin = d;
        }
    }

    // Add first triangle
    tris.push(hull[start]);
    tris.push(hull[left]);
    tris.push(hull[right]);
    tris.push(0);

    // Triangulate the polygon by moving left or right
    while (next(left, nhull) !== right) {
        // Check to see if we should advance left or right.
        const nleft = next(left, nhull);
        const nright = prev(right, nhull);

        const cvleft = hull[left] * 3;
        const nvleft = hull[nleft] * 3;
        const cvright = hull[right] * 3;
        const nvright = hull[nright] * 3;
        // Calculate distances for left and right triangulation options
        getVec2XZ(_triangulateHullPrev, verts, cvleft);
        getVec2XZ(_triangulateHullCurrent, verts, nvleft);
        getVec2XZ(_triangulateHullNext, verts, cvright);
        getVec2XZ(_triangulateHullRight, verts, nvright);

        const dleft =
            vec2.distance(_triangulateHullPrev, _triangulateHullCurrent) +
            vec2.distance(_triangulateHullCurrent, _triangulateHullNext);
        const dright =
            vec2.distance(_triangulateHullNext, _triangulateHullRight) +
            vec2.distance(_triangulateHullPrev, _triangulateHullRight);

        if (dleft < dright) {
            tris.push(hull[left]);
            tris.push(hull[nleft]);
            tris.push(hull[right]);
            tris.push(0);
            left = nleft;
        } else {
            tris.push(hull[left]);
            tris.push(hull[nright]);
            tris.push(hull[right]);
            tris.push(0);
            right = nright;
        }
    }
};

// Check if edge is on hull
const onHull = (
    a: number,
    b: number,
    nhull: number,
    hull: number[],
): boolean => {
    // All internal sampled points come after the hull so we can early out for those.
    if (a >= nhull || b >= nhull) return false;

    for (let j = nhull - 1, i = 0; i < nhull; j = i++) {
        if (a === hull[j] && b === hull[i]) return true;
    }
    return false;
};

// Set triangle flags for boundary edges
const setTriFlags = (tris: number[], nhull: number, hull: number[]): void => {
    for (let i = 0; i < tris.length; i += 4) {
        const a = tris[i];
        const b = tris[i + 1];
        const c = tris[i + 2];
        let flags = 0;
        flags |= (onHull(a, b, nhull, hull) ? DETAIL_EDGE_BOUNDARY : 0) << 0;
        flags |= (onHull(b, c, nhull, hull) ? DETAIL_EDGE_BOUNDARY : 0) << 2;
        flags |= (onHull(c, a, nhull, hull) ? DETAIL_EDGE_BOUNDARY : 0) << 4;
        tris[i + 3] = flags;
    }
};

// Helper function to push 3 values to queue
const push3 = (queue: number[], v1: number, v2: number, v3: number): void => {
    queue.push(v1, v2, v3);
};

const SEED_ARRAY_WITH_POLY_CENTER_OFFSET = [
    [0, 0],
    [-1, -1],
    [0, -1],
    [1, -1],
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
];

// Seed array with polygon center for height data collection
const seedArrayWithPolyCenter = (
    chf: CompactHeightfield,
    poly: number[],
    polyStart: number,
    nPolys: number,
    verts: number[],
    bs: number,
    hp: HeightPatch,
    array: number[],
): void => {
    // Note: Reads to the compact heightfield are offset by border size (bs)
    // since border size offset is already removed from the polymesh vertices.

    const offset = SEED_ARRAY_WITH_POLY_CENTER_OFFSET;

    // Find cell closest to a poly vertex
    let startCellX = 0;
    let startCellY = 0;
    let startSpanIndex = -1;
    let dmin = UNSET_HEIGHT;

    for (let j = 0; j < nPolys && dmin > 0; ++j) {
        for (let k = 0; k < 9 && dmin > 0; ++k) {
            const ax = verts[poly[polyStart + j] * 3] + offset[k][0];
            const ay = verts[poly[polyStart + j] * 3 + 1];
            const az = verts[poly[polyStart + j] * 3 + 2] + offset[k][1];
            if (
                ax < hp.xmin ||
                ax >= hp.xmin + hp.width ||
                az < hp.ymin ||
                az >= hp.ymin + hp.height
            )
                continue;

            const c = chf.cells[ax + bs + (az + bs) * chf.width];
            for (
                let i = c.index, ni = c.index + c.count;
                i < ni && dmin > 0;
                ++i
            ) {
                const s = chf.spans[i];
                const d = Math.abs(ay - s.y);
                if (d < dmin) {
                    startCellX = ax;
                    startCellY = az;
                    startSpanIndex = i;
                    dmin = d;
                }
            }
        }
    }

    // Find center of the polygon
    let pcx = 0;
    let pcy = 0;
    for (let j = 0; j < nPolys; ++j) {
        pcx += verts[poly[polyStart + j] * 3];
        pcy += verts[poly[polyStart + j] * 3 + 2];
    }
    pcx = Math.floor(pcx / nPolys);
    pcy = Math.floor(pcy / nPolys);

    // Use seeds array as a stack for DFS
    array.length = 0;
    array.push(startCellX, startCellY, startSpanIndex);

    const dirs = [0, 1, 2, 3];
    hp.data.fill(0);

    // DFS to move to the center
    let cx = -1;
    let cy = -1;
    let ci = -1;
    while (true) {
        if (array.length < 3) {
            console.warn('Walk towards polygon center failed to reach center');
            break;
        }

        ci = array.pop()!;
        cy = array.pop()!;
        cx = array.pop()!;

        if (cx === pcx && cy === pcy) break;

        // If we are already at the correct X-position, prefer direction directly towards the center in Y-axis
        let directDir: number;
        if (cx === pcx) {
            directDir = getDirForOffset(0, pcy > cy ? 1 : -1);
        } else {
            directDir = getDirForOffset(pcx > cx ? 1 : -1, 0);
        }

        // Push the direct dir last so we start with this on next iteration
        const temp = dirs[directDir];
        dirs[directDir] = dirs[3];
        dirs[3] = temp;

        const cs = chf.spans[ci];
        for (let i = 0; i < 4; i++) {
            const dir = dirs[i];
            if (getCon(cs, dir) === NOT_CONNECTED) continue;

            const newX = cx + getDirOffsetX(dir);
            const newY = cy + getDirOffsetY(dir);

            const hpx = newX - hp.xmin;
            const hpy = newY - hp.ymin;
            if (hpx < 0 || hpx >= hp.width || hpy < 0 || hpy >= hp.height)
                continue;

            if (hp.data[hpx + hpy * hp.width] !== 0) continue;

            hp.data[hpx + hpy * hp.width] = 1;
            array.push(
                newX,
                newY,
                chf.cells[newX + bs + (newY + bs) * chf.width].index +
                    getCon(cs, dir),
            );
        }

        // Restore dirs array
        dirs[directDir] = dirs[3];
        dirs[3] = temp;
    }

    array.length = 0;
    // getHeightData seeds are given in coordinates with borders
    array.push(cx + bs, cy + bs, ci);

    hp.data.fill(UNSET_HEIGHT);
    const cs = chf.spans[ci];
    hp.data[cx - hp.xmin + (cy - hp.ymin) * hp.width] = cs.y;
};

// Get height data for a polygon
const getHeightData = (
    chf: CompactHeightfield,
    poly: number[],
    polyStart: number,
    nPolys: number,
    verts: number[],
    bs: number,
    hp: HeightPatch,
    queue: number[],
    region: number,
): void => {
    // Note: Reads to the compact heightfield are offset by border size (bs)
    // since border size offset is already removed from the polymesh vertices.

    queue.length = 0;
    // Set all heights to RC_UNSET_HEIGHT.
    hp.data.fill(UNSET_HEIGHT);

    let empty = true;

    // We cannot sample from this poly if it was created from polys of different regions.
    if (region !== MULTIPLE_REGS) {
        // Copy the height from the same region, and mark region borders as seed points to fill the rest.
        for (let hy = 0; hy < hp.height; hy++) {
            const y = hp.ymin + hy + bs;
            for (let hx = 0; hx < hp.width; hx++) {
                const x = hp.xmin + hx + bs;
                const c = chf.cells[x + y * chf.width];
                for (let i = c.index, ni = c.index + c.count; i < ni; ++i) {
                    const s = chf.spans[i];
                    if (s.region === region) {
                        // Store height
                        hp.data[hx + hy * hp.width] = s.y;
                        empty = false;

                        // If any of the neighbours is not in same region, add the current location as flood fill start
                        let border = false;
                        for (let dir = 0; dir < 4; ++dir) {
                            if (getCon(s, dir) !== NOT_CONNECTED) {
                                const ax = x + getDirOffsetX(dir);
                                const ay = y + getDirOffsetY(dir);
                                const ai =
                                    chf.cells[ax + ay * chf.width].index +
                                    getCon(s, dir);
                                const as = chf.spans[ai];
                                if (as.region !== region) {
                                    border = true;
                                    break;
                                }
                            }
                        }
                        if (border) push3(queue, x, y, i);
                        break;
                    }
                }
            }
        }
    }

    // if the polygon does not contain any points from the current region or if it could potentially be overlapping polygons
    if (empty) {
        seedArrayWithPolyCenter(
            chf,
            poly,
            polyStart,
            nPolys,
            verts,
            bs,
            hp,
            queue,
        );
    }

    let head = 0;

    // BFS to collect height data
    while (head * 3 < queue.length) {
        const cx = queue[head * 3];
        const cy = queue[head * 3 + 1];
        const ci = queue[head * 3 + 2];
        head++;
        if (head >= RETRACT_SIZE) {
            head = 0;
            if (queue.length > RETRACT_SIZE * 3) {
                queue.splice(0, RETRACT_SIZE * 3);
            }
        }

        const cs = chf.spans[ci];
        for (let dir = 0; dir < 4; ++dir) {
            if (getCon(cs, dir) === NOT_CONNECTED) continue;

            const ax = cx + getDirOffsetX(dir);
            const ay = cy + getDirOffsetY(dir);
            const hx = ax - hp.xmin - bs;
            const hy = ay - hp.ymin - bs;

            if (hx < 0 || hx >= hp.width || hy < 0 || hy >= hp.height) continue;

            if (hp.data[hx + hy * hp.width] !== UNSET_HEIGHT) continue;

            const ai = chf.cells[ax + ay * chf.width].index + getCon(cs, dir);
            const as = chf.spans[ai];

            hp.data[hx + hy * hp.width] = as.y;

            push3(queue, ax, ay, ai);
        }
    }
};

// Pre-allocated Vec3 objects for buildPolyDetail function
const _buildPolyDetailV1: Vec3 = vec3.create();
const _buildPolyDetailV2: Vec3 = vec3.create();
const _buildPolyDetailEdgePt: Vec3 = vec3.create();
const _buildPolyDetailEdgeA: Vec3 = vec3.create();
const _buildPolyDetailEdgeB: Vec3 = vec3.create();
const _buildPolyDetailSamplePt: Vec3 = vec3.create();
const _buildPolyDetailGridPt: Vec3 = vec3.create();

const _bmin = vec3.create();
const _bmax = vec3.create();

const buildPolyDetail = (
    inVerts: number[],
    nin: number,
    sampleDist: number,
    sampleMaxError: number,
    heightSearchRadius: number,
    chf: CompactHeightfield,
    hp: HeightPatch,
    verts: number[],
    nverts: { value: number },
    tris: number[],
    edges: number[],
    samples: number[],
): boolean => {
    const edge = new Array((MAX_VERTS_PER_EDGE + 1) * 3);
    const hull = new Array(MAX_VERTS);
    let nhull = 0;

    nverts.value = nin;

    // Copy input vertices
    for (let i = 0; i < nin; ++i) {
        setVec3(
            verts,
            i * 3,
            inVerts[i * 3],
            inVerts[i * 3 + 1],
            inVerts[i * 3 + 2],
        );
    }

    // Clear arrays
    edges.length = 0;
    tris.length = 0;

    const cs = chf.cellSize;
    const ics = 1.0 / cs;

    // Calculate minimum extents of the polygon based on input data.
    const minExtent = polyMinExtent(verts, nverts.value);

    // Tessellate outlines.
    if (sampleDist > 0) {
        for (let i = 0, j = nin - 1; i < nin; j = i++) {
            const vj = j * 3;
            const vi = i * 3;
            let swapped = false;

            // Make sure the segments are always handled in same order using lexological sort
            if (Math.abs(inVerts[vj] - inVerts[vi]) < 1e-6) {
                if (inVerts[vj + 2] > inVerts[vi + 2]) {
                    swapped = true;
                }
            } else {
                if (inVerts[vj] > inVerts[vi]) {
                    swapped = true;
                }
            }

            const v1 = swapped
                ? getVec3(_buildPolyDetailV1, inVerts, vi)
                : getVec3(_buildPolyDetailV1, inVerts, vj);
            const v2 = swapped
                ? getVec3(_buildPolyDetailV2, inVerts, vj)
                : getVec3(_buildPolyDetailV2, inVerts, vi);

            // Create samples along the edge.
            const dx = v2[0] - v1[0];
            const dy = v2[1] - v1[1];
            const dz = v2[2] - v1[2];
            const d = Math.sqrt(dx * dx + dz * dz);
            let nn = 1 + Math.floor(d / sampleDist);
            if (nn >= MAX_VERTS_PER_EDGE) nn = MAX_VERTS_PER_EDGE - 1;
            if (nverts.value + nn >= MAX_VERTS)
                nn = MAX_VERTS - 1 - nverts.value;

            for (let k = 0; k <= nn; ++k) {
                const u = k / nn;
                const pos = k * 3;
                edge[pos] = v1[0] + dx * u;
                edge[pos + 1] = v1[1] + dy * u;
                edge[pos + 2] = v1[2] + dz * u;
                edge[pos + 1] =
                    getHeight(
                        edge[pos],
                        edge[pos + 1],
                        edge[pos + 2],
                        cs,
                        ics,
                        chf.cellHeight,
                        heightSearchRadius,
                        hp,
                    ) * chf.cellHeight;
            }

            // Simplify samples.
            const idx = new Array(MAX_VERTS_PER_EDGE).fill(0);
            idx[0] = 0;
            idx[1] = nn;
            let nidx = 2;

            for (let k = 0; k < nidx - 1; ) {
                const a = idx[k];
                const b = idx[k + 1];
                const va = a * 3;
                const vb = b * 3;

                // Find maximum deviation along the segment.
                let maxd = 0;
                let maxi = -1;
                for (let m = a + 1; m < b; ++m) {
                    getVec3(_buildPolyDetailEdgePt, edge, m * 3);
                    getVec3(_buildPolyDetailEdgeA, edge, va);
                    getVec3(_buildPolyDetailEdgeB, edge, vb);
                    const dev = distancePtSeg(
                        _buildPolyDetailEdgePt,
                        _buildPolyDetailEdgeA,
                        _buildPolyDetailEdgeB,
                    );
                    if (dev > maxd) {
                        maxd = dev;
                        maxi = m;
                    }
                }

                // If the max deviation is larger than accepted error, add new point
                if (maxi !== -1 && maxd > sampleMaxError * sampleMaxError) {
                    for (let m = nidx; m > k; --m) {
                        idx[m] = idx[m - 1];
                    }
                    idx[k + 1] = maxi;
                    nidx++;
                } else {
                    ++k;
                }
            }

            hull[nhull++] = j;
            // Add new vertices.
            if (swapped) {
                for (let k = nidx - 2; k > 0; --k) {
                    setVec3(
                        verts,
                        nverts.value * 3,
                        edge[idx[k] * 3],
                        edge[idx[k] * 3 + 1],
                        edge[idx[k] * 3 + 2],
                    );
                    hull[nhull++] = nverts.value;
                    nverts.value++;
                }
            } else {
                for (let k = 1; k < nidx - 1; ++k) {
                    setVec3(
                        verts,
                        nverts.value * 3,
                        edge[idx[k] * 3],
                        edge[idx[k] * 3 + 1],
                        edge[idx[k] * 3 + 2],
                    );
                    hull[nhull++] = nverts.value;
                    nverts.value++;
                }
            }
        }
    }

    // If the polygon minimum extent is small, do not try to add internal points.
    if (minExtent < sampleDist * 2) {
        triangulateHull(verts, nhull, hull, nin, tris);
        setTriFlags(tris, nhull, hull);
        return true;
    }

    // Tessellate the base mesh using triangulateHull
    triangulateHull(verts, nhull, hull, nin, tris);

    if (tris.length === 0) {
        console.warn(
            `buildPolyDetail: Could not triangulate polygon (${nverts.value} verts).`,
        );
        return true;
    }

    if (sampleDist > 0) {
        // Create sample locations in a grid.
        const bmin = vec3.set(_bmin, inVerts[0], inVerts[1], inVerts[2]);
        const bmax = vec3.set(_bmax, inVerts[0], inVerts[1], inVerts[2]);
        for (let i = 1; i < nin; ++i) {
            bmin[0] = Math.min(bmin[0], inVerts[i * 3]);
            bmin[1] = Math.min(bmin[1], inVerts[i * 3 + 1]);
            bmin[2] = Math.min(bmin[2], inVerts[i * 3 + 2]);
            bmax[0] = Math.max(bmax[0], inVerts[i * 3]);
            bmax[1] = Math.max(bmax[1], inVerts[i * 3 + 1]);
            bmax[2] = Math.max(bmax[2], inVerts[i * 3 + 2]);
        }
        const x0 = Math.floor(bmin[0] / sampleDist);
        const x1 = Math.ceil(bmax[0] / sampleDist);
        const z0 = Math.floor(bmin[2] / sampleDist);
        const z1 = Math.ceil(bmax[2] / sampleDist);
        samples.length = 0;
        for (let z = z0; z < z1; ++z) {
            for (let x = x0; x < x1; ++x) {
                const pt = [
                    x * sampleDist,
                    (bmax[1] + bmin[1]) * 0.5,
                    z * sampleDist,
                ];
                // Make sure the samples are not too close to the edges.
                vec3.set(_buildPolyDetailGridPt, pt[0], pt[1], pt[2]);
                if (
                    distToPoly(nin, inVerts, _buildPolyDetailGridPt) >
                    -sampleDist / 2
                )
                    continue;
                samples.push(x);
                samples.push(
                    getHeight(
                        pt[0],
                        pt[1],
                        pt[2],
                        cs,
                        ics,
                        chf.cellHeight,
                        heightSearchRadius,
                        hp,
                    ),
                );
                samples.push(z);
                samples.push(0); // Not added
            }
        }

        // Add the samples starting from the one that has the most error.
        const nsamples = samples.length / 4;
        for (let iter = 0; iter < nsamples; ++iter) {
            if (nverts.value >= MAX_VERTS) break;

            // Find sample with most error.
            const bestpt = [0, 0, 0];
            let bestd = 0;
            let besti = -1;
            for (let i = 0; i < nsamples; ++i) {
                const s = i * 4;
                if (samples[s + 3]) continue; // skip added.
                const pt = [
                    samples[s] * sampleDist + getJitterX(i) * cs * 0.1,
                    samples[s + 1] * chf.cellHeight,
                    samples[s + 2] * sampleDist + getJitterY(i) * cs * 0.1,
                ];
                vec3.set(_buildPolyDetailSamplePt, pt[0], pt[1], pt[2]);
                const d = distToTriMesh(
                    _buildPolyDetailSamplePt,
                    verts,
                    tris,
                    tris.length / 4,
                );
                if (d < 0) continue; // did not hit the mesh.
                if (d > bestd) {
                    bestd = d;
                    besti = i;
                    bestpt[0] = pt[0];
                    bestpt[1] = pt[1];
                    bestpt[2] = pt[2];
                }
            }
            // If the max error is within accepted threshold, stop tesselating.
            if (bestd <= sampleMaxError || besti === -1) break;
            // Mark sample as added.
            samples[besti * 4 + 3] = 1;
            // Add the new sample point.
            verts.push(bestpt[0], bestpt[1], bestpt[2]);
            // setVec3(verts, nverts.value * 3, bestpt[0], bestpt[1], bestpt[2]);
            nverts.value++;

            // Create new triangulation.
            edges.length = 0;
            tris.length = 0;
            delaunayHull(nverts.value, verts, nhull, hull, tris, edges);
        }
    }

    const ntris = tris.length / 4;
    if (ntris > MAX_TRIS) {
        tris.length = MAX_TRIS * 4;
        console.error(
            `rcBuildPolyMeshDetail: Shrinking triangle count from ${ntris} to max ${MAX_TRIS}.`,
        );
    }

    setTriFlags(tris, nhull, hull);

    return true;
};

const _triangulateHullPrev: Vec2 = vec2.create();
const _triangulateHullCurrent: Vec2 = vec2.create(); 
const _triangulateHullNext: Vec2 = vec2.create();
const _triangulateHullRight: Vec2 = vec2.create();

export const buildPolyMeshDetail = (
    polyMesh: PolyMesh,
    compactHeightfield: CompactHeightfield,
    sampleDist: number,
    sampleMaxError: number,
): PolyMeshDetail => {
    if (polyMesh.nVertices === 0 || polyMesh.nPolys === 0) {
        return {
            meshes: [],
            vertices: [],
            triangles: [],
            nMeshes: 0,
            nVertices: 0,
            nTriangles: 0,
        };
    }

    const nvp = polyMesh.maxVerticesPerPoly;
    const cs = polyMesh.cellSize;
    const ch = polyMesh.cellHeight;
    const orig = [
        polyMesh.bounds[0][0],
        polyMesh.bounds[0][1],
        polyMesh.bounds[0][2],
    ];
    const borderSize = polyMesh.borderSize;
    const heightSearchRadius = Math.max(1, Math.ceil(polyMesh.maxEdgeError));

    const edges: number[] = [];
    const tris: number[] = [];
    const arr: number[] = [];
    const samples: number[] = [];
    const verts: number[] = [];

    const hp: HeightPatch = {
        data: [],
        xmin: 0,
        ymin: 0,
        width: 0,
        height: 0,
    };

    let nPolyVerts = 0;
    let maxhw = 0;
    let maxhh = 0;

    // Calculate bounds for each polygon
    const bounds = new Array(polyMesh.nPolys * 4);
    const poly = new Array(nvp * 3);

    // Find max size for a polygon area.
    for (let i = 0; i < polyMesh.nPolys; ++i) {
        const p = i * nvp * 2;
        let xmin = compactHeightfield.width;
        let xmax = 0;
        let ymin = compactHeightfield.height;
        let ymax = 0;
        for (let j = 0; j < nvp; ++j) {
            if (polyMesh.polys[p + j] === MESH_NULL_IDX) break;
            const v = polyMesh.polys[p + j] * 3;
            xmin = Math.min(xmin, polyMesh.vertices[v]);
            xmax = Math.max(xmax, polyMesh.vertices[v]);
            ymin = Math.min(ymin, polyMesh.vertices[v + 2]);
            ymax = Math.max(ymax, polyMesh.vertices[v + 2]);
            nPolyVerts++;
        }
        bounds[i * 4] = Math.max(0, xmin - 1);
        bounds[i * 4 + 1] = Math.min(compactHeightfield.width, xmax + 1);
        bounds[i * 4 + 2] = Math.max(0, ymin - 1);
        bounds[i * 4 + 3] = Math.min(compactHeightfield.height, ymax + 1);
        if (
            bounds[i * 4] >= bounds[i * 4 + 1] ||
            bounds[i * 4 + 2] >= bounds[i * 4 + 3]
        )
            continue;
        maxhw = Math.max(maxhw, bounds[i * 4 + 1] - bounds[i * 4]);
        maxhh = Math.max(maxhh, bounds[i * 4 + 3] - bounds[i * 4 + 2]);
    }

    hp.data = new Array(maxhw * maxhh);

    const dmesh: PolyMeshDetail = {
        meshes: new Array(polyMesh.nPolys * 4),
        vertices: [],
        triangles: [],
        nMeshes: polyMesh.nPolys,
        nVertices: 0,
        nTriangles: 0,
    };

    for (let i = 0; i < polyMesh.nPolys; ++i) {
        const p = i * nvp * 2;

        // Store polygon vertices for processing.
        let npoly = 0;
        for (let j = 0; j < nvp; ++j) {
            if (polyMesh.polys[p + j] === MESH_NULL_IDX) break;
            const v = polyMesh.polys[p + j] * 3;
            poly[j * 3] = polyMesh.vertices[v] * cs;
            poly[j * 3 + 1] = polyMesh.vertices[v + 1] * ch;
            poly[j * 3 + 2] = polyMesh.vertices[v + 2] * cs;
            npoly++;
        }

        // Get the height data from the area of the polygon.
        hp.xmin = bounds[i * 4];
        hp.ymin = bounds[i * 4 + 2];
        hp.width = bounds[i * 4 + 1] - bounds[i * 4];
        hp.height = bounds[i * 4 + 3] - bounds[i * 4 + 2];
        getHeightData(
            compactHeightfield,
            polyMesh.polys,
            p,
            npoly,
            polyMesh.vertices,
            borderSize,
            hp,
            arr,
            polyMesh.regions[i],
        );

        // Build detail mesh.
        const nverts = { value: 0 };

        if (
            !buildPolyDetail(
                poly,
                npoly,
                sampleDist,
                sampleMaxError,
                heightSearchRadius,
                compactHeightfield,
                hp,
                verts,
                nverts,
                tris,
                edges,
                samples,
            )
        ) {
            console.error('buildPolyMeshDetail: Failed to build detail mesh');
            continue;
        }

        // Move detail verts to world space.
        for (let j = 0; j < nverts.value; ++j) {
            verts[j * 3] += orig[0];
            verts[j * 3 + 1] += orig[1] + compactHeightfield.cellHeight; // Is this offset necessary?
            verts[j * 3 + 2] += orig[2];
        }

        // Offset poly too, will be used to flag checking.
        for (let j = 0; j < npoly; ++j) {
            poly[j * 3] += orig[0];
            poly[j * 3 + 1] += orig[1];
            poly[j * 3 + 2] += orig[2];
        }

        // Store detail submesh.
        const ntris = tris.length / 4;

        dmesh.meshes[i * 4] = dmesh.nVertices;
        dmesh.meshes[i * 4 + 1] = nverts.value;
        dmesh.meshes[i * 4 + 2] = dmesh.nTriangles;
        dmesh.meshes[i * 4 + 3] = ntris;

        // Store vertices
        for (let j = 0; j < nverts.value; ++j) {
            dmesh.vertices.push(
                verts[j * 3],
                verts[j * 3 + 1],
                verts[j * 3 + 2],
            );
            dmesh.nVertices++;
        }

        // Store triangles
        for (let j = 0; j < ntris; ++j) {
            const t = j * 4;
            dmesh.triangles.push(
                tris[t],
                tris[t + 1],
                tris[t + 2],
                tris[t + 3],
            );
            dmesh.nTriangles++;
        }
    }

    return dmesh;
};
