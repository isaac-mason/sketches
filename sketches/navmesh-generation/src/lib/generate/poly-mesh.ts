import { type Box3, type Vec3, vec3 } from '@/common/maaths';
import {
    BORDER_VERTEX,
    MESH_NULL_IDX,
    MULTIPLE_REGS,
    POLY_NEIS_FLAG_EXT_LINK,
} from './common';
import type { ContourSet } from './contour-set';

/**
 * Represents a polygon mesh suitable for use in building a navigation mesh.
 */
export type PolyMesh = {
    /** The mesh vertices. Form: (x, y, z) * nverts */
    vertices: number[];
    /** Polygon and neighbor data. Length: npolys * 2 * nvp */
    polys: number[];
    /** The region id assigned to each polygon. Length: npolys */
    regions: number[];
    /** The user defined flags for each polygon. Length: npolys */
    flags: number[];
    /** The area id assigned to each polygon. Length: npolys */
    areas: number[];
    /** The number of vertices */
    nVertices: number;
    /** The number of polygons */
    nPolys: number;
    /** The maximum number of vertices per polygon */
    maxVerticesPerPoly: number;
    /** the bounds in world space */
    bounds: Box3;
    /** The size of each cell. (On the xz-plane.) */
    cellSize: number;
    /** The height of each cell. (The minimum increment along the y-axis.) */
    cellHeight: number;
    /** The AABB border size used to generate the source data from which the mesh was derived */
    borderSize: number;
    /** The max error of the polygon edges in the mesh */
    maxEdgeError: number;
};

const VERTEX_BUCKET_COUNT = 1 << 12;

// Edge structure for mesh adjacency
type Edge = {
    vert: [number, number];
    polyEdge: [number, number];
    poly: [number, number];
};

// Helper functions
const computeVertexHash = (x: number, y: number, z: number): number => {
    const h1 = 0x8da6b343; // Large multiplicative constants
    const h2 = 0xd8163841; // arbitrarily chosen primes
    const h3 = 0xcb1ab31f;
    const n = h1 * x + h2 * y + h3 * z;
    return n & (VERTEX_BUCKET_COUNT - 1);
};

const addVertex = (
    x: number,
    y: number,
    z: number,
    vertices: number[],
    firstVertexInBucket: number[],
    nextVertexInBucket: number[],
    vertexCount: { value: number },
): number => {
    const bucket = computeVertexHash(x, 0, z);
    let i = firstVertexInBucket[bucket];

    while (i !== -1) {
        const vx = vertices[i * 3];
        const vy = vertices[i * 3 + 1];
        const vz = vertices[i * 3 + 2];
        if (vx === x && Math.abs(vy - y) <= 2 && vz === z) {
            return i;
        }
        i = nextVertexInBucket[i];
    }

    // Could not find, create new
    i = vertexCount.value;
    vertexCount.value++;
    vertices[i * 3] = x;
    vertices[i * 3 + 1] = y;
    vertices[i * 3 + 2] = z;
    nextVertexInBucket[i] = firstVertexInBucket[bucket];
    firstVertexInBucket[bucket] = i;

    return i;
};

// Helper functions for polygon operations
const prev = (i: number, n: number): number => (i - 1 >= 0 ? i - 1 : n - 1);
const next = (i: number, n: number): number => (i + 1 < n ? i + 1 : 0);

/**
 *
 */
const area2 = (
    vertexA: number[],
    vertexB: number[],
    vertexC: number[],
): number => {
    return (
        (vertexB[0] - vertexA[0]) * (vertexC[2] - vertexA[2]) -
        (vertexC[0] - vertexA[0]) * (vertexB[2] - vertexA[2])
    );
};

const xorb = (x: boolean, y: boolean): boolean => !x !== !y;

// Returns true iff c is strictly to the left of the directed
// line through a to b.
const left = (
    firstVertex: number[],
    secondVertex: number[],
    testVertex: number[],
): boolean => area2(firstVertex, secondVertex, testVertex) < 0;

const leftOn = (
    firstVertex: number[],
    secondVertex: number[],
    testVertex: number[],
): boolean => area2(firstVertex, secondVertex, testVertex) <= 0;

const collinear = (
    firstVertex: number[],
    secondVertex: number[],
    testVertex: number[],
): boolean => area2(firstVertex, secondVertex, testVertex) === 0;

const intersectProp = (
    segmentAStart: number[],
    segmentAEnd: number[],
    segmentBStart: number[],
    segmentBEnd: number[],
): boolean => {
    if (
        collinear(segmentAStart, segmentAEnd, segmentBStart) ||
        collinear(segmentAStart, segmentAEnd, segmentBEnd) ||
        collinear(segmentBStart, segmentBEnd, segmentAStart) ||
        collinear(segmentBStart, segmentBEnd, segmentAEnd)
    ) {
        return false;
    }
    return (
        xorb(
            left(segmentAStart, segmentAEnd, segmentBStart),
            left(segmentAStart, segmentAEnd, segmentBEnd),
        ) &&
        xorb(
            left(segmentBStart, segmentBEnd, segmentAStart),
            left(segmentBStart, segmentBEnd, segmentAEnd),
        )
    );
};

const between = (
    startVertex: number[],
    endVertex: number[],
    testVertex: number[],
): boolean => {
    if (!collinear(startVertex, endVertex, testVertex)) return false;
    if (startVertex[0] !== endVertex[0]) {
        return (
            (startVertex[0] <= testVertex[0] &&
                testVertex[0] <= endVertex[0]) ||
            (startVertex[0] >= testVertex[0] && testVertex[0] >= endVertex[0])
        );
    }
    return (
        (startVertex[2] <= testVertex[2] && testVertex[2] <= endVertex[2]) ||
        (startVertex[2] >= testVertex[2] && testVertex[2] >= endVertex[2])
    );
};

const intersect = (
    segmentAStart: number[],
    segmentAEnd: number[],
    segmentBStart: number[],
    segmentBEnd: number[],
): boolean => {
    if (intersectProp(segmentAStart, segmentAEnd, segmentBStart, segmentBEnd))
        return true;
    return (
        between(segmentAStart, segmentAEnd, segmentBStart) ||
        between(segmentAStart, segmentAEnd, segmentBEnd) ||
        between(segmentBStart, segmentBEnd, segmentAStart) ||
        between(segmentBStart, segmentBEnd, segmentAEnd)
    );
};

// Returns whether the two vertices are equal in the XZ plane
const vec3EqualXZ = (vertexA: number[], vertexB: number[]): boolean =>
    vertexA[0] === vertexB[0] && vertexA[2] === vertexB[2];

const _diagonalStart = vec3.create();
const _diagonalEnd = vec3.create();
const _edgeStart = vec3.create();
const _edgeEnd = vec3.create();

// Returns T iff (v_i, v_j) is a proper internal *or* external
// diagonal of P, *ignoring edges incident to v_i and v_j*.
const diagonalie = (
    startVertexIdx: number,
    endVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const diagonalStart = vec3.set(
        _diagonalStart,
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 2],
    );
    const diagonalEnd = vec3.set(
        _diagonalEnd,
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    for (let k = 0; k < polygonVertexCount; k++) {
        const k1 = next(k, polygonVertexCount);
        if (
            !(
                k === startVertexIdx ||
                k1 === startVertexIdx ||
                k === endVertexIdx ||
                k1 === endVertexIdx
            )
        ) {
            const edgeStart = vec3.set(
                _edgeStart,
                vertices[(vertexIndices[k] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 2],
            );
            const edgeEnd = vec3.set(
                _edgeEnd,
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 2],
            );

            if (
                vec3EqualXZ(diagonalStart, edgeStart) ||
                vec3EqualXZ(diagonalEnd, edgeStart) ||
                vec3EqualXZ(diagonalStart, edgeEnd) ||
                vec3EqualXZ(diagonalEnd, edgeEnd)
            ) {
                continue;
            }

            if (intersect(diagonalStart, diagonalEnd, edgeStart, edgeEnd)) {
                return false;
            }
        }
    }
    return true;
};

const _coneVertex = vec3.create();
const _testVertex = vec3.create();
const _nextVertex = vec3.create();
const _prevVertex = vec3.create();

const inCone = (
    coneVertexIdx: number,
    testVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const coneVertex = vec3.set(
        _coneVertex,
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    const testVertex = vec3.set(
        _testVertex,
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    const nextVertex = vec3.set(
        _nextVertex,
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4
        ],
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                1
        ],
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                2
        ],
    );

    const prevVertex = vec3.set(
        _prevVertex,
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4
        ],
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                1
        ],
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                2
        ],
    );

    if (leftOn(prevVertex, coneVertex, nextVertex)) {
        return (
            left(coneVertex, testVertex, prevVertex) &&
            left(testVertex, coneVertex, nextVertex)
        );
    }
    return !(
        leftOn(coneVertex, testVertex, nextVertex) &&
        leftOn(testVertex, coneVertex, prevVertex)
    );
};

const diagonal = (
    startVertexIdx: number,
    endVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    return (
        inCone(
            startVertexIdx,
            endVertexIdx,
            polygonVertexCount,
            vertices,
            vertexIndices,
        ) &&
        diagonalie(
            startVertexIdx,
            endVertexIdx,
            polygonVertexCount,
            vertices,
            vertexIndices,
        )
    );
};

const diagonalieLoose = (
    startVertexIdx: number,
    endVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const diagonalStart = vec3.set(
        _diagonalStart,
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 2],
    );
    const diagonalEnd = vec3.set(
        _diagonalEnd,
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    for (let k = 0; k < polygonVertexCount; k++) {
        const k1 = next(k, polygonVertexCount);
        if (
            !(
                k === startVertexIdx ||
                k1 === startVertexIdx ||
                k === endVertexIdx ||
                k1 === endVertexIdx
            )
        ) {
            const edgeStart = vec3.set(
                _edgeStart,
                vertices[(vertexIndices[k] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 2],
            );
            const edgeEnd = vec3.set(
                _edgeEnd,
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 2],
            );

            if (
                vec3EqualXZ(diagonalStart, edgeStart) ||
                vec3EqualXZ(diagonalEnd, edgeStart) ||
                vec3EqualXZ(diagonalStart, edgeEnd) ||
                vec3EqualXZ(diagonalEnd, edgeEnd)
            ) {
                continue;
            }

            if (intersectProp(diagonalStart, diagonalEnd, edgeStart, edgeEnd)) {
                return false;
            }
        }
    }
    return true;
};

const inConeLoose = (
    coneVertexIdx: number,
    testVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const coneVertex = vec3.set(
        _coneVertex,
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    const testVertex = vec3.set(
        _testVertex,
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 2],
    );

    const nextVertex = vec3.set(
        _nextVertex,
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4
        ],
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                1
        ],
        vertices[
            (vertexIndices[next(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                2
        ],
    );

    const prevVertex = vec3.set(
        _prevVertex,
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4
        ],
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                1
        ],
        vertices[
            (vertexIndices[prev(coneVertexIdx, polygonVertexCount)] &
                0x0fffffff) *
                4 +
                2
        ],
    );

    if (leftOn(prevVertex, coneVertex, nextVertex)) {
        return (
            leftOn(coneVertex, testVertex, prevVertex) &&
            leftOn(testVertex, coneVertex, nextVertex)
        );
    }
    return !(
        leftOn(coneVertex, testVertex, nextVertex) &&
        leftOn(testVertex, coneVertex, prevVertex)
    );
};

const diagonalLoose = (
    startVertexIdx: number,
    endVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    return (
        inConeLoose(
            startVertexIdx,
            endVertexIdx,
            polygonVertexCount,
            vertices,
            vertexIndices,
        ) &&
        diagonalieLoose(
            startVertexIdx,
            endVertexIdx,
            polygonVertexCount,
            vertices,
            vertexIndices,
        )
    );
};

const _triangulateP0 = vec3.create();
const _triangulateP2 = vec3.create();

const triangulate = (
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
    triangleIndices: number[],
): number => {
    let ntris = 0;
    let dst = 0;

    // Mark removable vertices
    for (let i = 0; i < polygonVertexCount; i++) {
        const i1 = next(i, polygonVertexCount);
        const i2 = next(i1, polygonVertexCount);
        if (diagonal(i, i2, polygonVertexCount, vertices, vertexIndices)) {
            vertexIndices[i1] |= 0x80000000;
        }
    }

    let nv = polygonVertexCount;
    while (nv > 3) {
        let minLen = -1;
        let mini = -1;

        for (let i = 0; i < nv; i++) {
            const i1 = next(i, nv);
            if (vertexIndices[i1] & 0x80000000) {
                const p0 = vec3.set(
                    _triangulateP0,
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4],
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 1],
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 2],
                );
                const p2 = vec3.set(
                    _triangulateP2,
                    vertices[(vertexIndices[next(i1, nv)] & 0x0fffffff) * 4],
                    vertices[
                        (vertexIndices[next(i1, nv)] & 0x0fffffff) * 4 + 1
                    ],
                    vertices[
                        (vertexIndices[next(i1, nv)] & 0x0fffffff) * 4 + 2
                    ],
                );

                const dx = p2[0] - p0[0];
                const dy = p2[2] - p0[2];
                const len = dx * dx + dy * dy;

                if (minLen < 0 || len < minLen) {
                    minLen = len;
                    mini = i;
                }
            }
        }

        if (mini === -1) {
            // Try loose diagonal test
            for (let i = 0; i < nv; i++) {
                const i1 = next(i, nv);
                const i2 = next(i1, nv);
                if (diagonalLoose(i, i2, nv, vertices, vertexIndices)) {
                    // Using loose version would be better but simplified
                    const p0 = vec3.set(
                        _triangulateP0,
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4],
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 1],
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 2],
                    );
                    const p2 = vec3.set(
                        _triangulateP2,
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4
                        ],
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4 + 1
                        ],
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4 + 2
                        ],
                    );
                    const dx = p2[0] - p0[0];
                    const dy = p2[2] - p0[2];
                    const len = dx * dx + dy * dy;

                    if (minLen < 0 || len < minLen) {
                        minLen = len;
                        mini = i;
                    }
                }
            }
            if (mini === -1) {
                return -ntris;
            }
        }

        const i = mini;
        let i1 = next(i, nv);
        const i2 = next(i1, nv);

        triangleIndices[dst++] = vertexIndices[i] & 0x0fffffff;
        triangleIndices[dst++] = vertexIndices[i1] & 0x0fffffff;
        triangleIndices[dst++] = vertexIndices[i2] & 0x0fffffff;
        ntris++;

        // Remove vertex
        nv--;
        for (let k = i1; k < nv; k++) {
            vertexIndices[k] = vertexIndices[k + 1];
        }

        if (i1 >= nv) i1 = 0;
        const iPrev = prev(i1, nv);

        // Update diagonal flags
        if (diagonal(prev(iPrev, nv), i1, nv, vertices, vertexIndices)) {
            vertexIndices[iPrev] |= 0x80000000;
        } else {
            vertexIndices[iPrev] &= 0x0fffffff;
        }

        if (diagonal(iPrev, next(i1, nv), nv, vertices, vertexIndices)) {
            vertexIndices[i1] |= 0x80000000;
        } else {
            vertexIndices[i1] &= 0x0fffffff;
        }
    }

    // Final triangle
    triangleIndices[dst++] = vertexIndices[0] & 0x0fffffff;
    triangleIndices[dst++] = vertexIndices[1] & 0x0fffffff;
    triangleIndices[dst++] = vertexIndices[2] & 0x0fffffff;
    ntris++;

    return ntris;
};

const countPolyVerts = (
    polygons: number[],
    polyStartIdx: number,
    maxVerticesPerPoly: number,
): number => {
    for (let i = 0; i < maxVerticesPerPoly; i++) {
        if (polygons[polyStartIdx + i] === MESH_NULL_IDX) return i;
    }
    return maxVerticesPerPoly;
};

const uleft = (
    firstVertex: number[],
    secondVertex: number[],
    testVertex: number[],
): boolean => {
    return (
        (secondVertex[0] - firstVertex[0]) * (testVertex[2] - firstVertex[2]) -
            (testVertex[0] - firstVertex[0]) *
                (secondVertex[2] - firstVertex[2]) <
        0
    );
};

const getPolyMergeValue = (
    polygons: number[],
    polyAStartIdx: number,
    polyBStartIdx: number,
    vertices: number[],
    maxVerticesPerPoly: number,
): { value: number; ea: number; eb: number } => {
    const numVertsA = countPolyVerts(
        polygons,
        polyAStartIdx,
        maxVerticesPerPoly,
    );
    const numVertsB = countPolyVerts(
        polygons,
        polyBStartIdx,
        maxVerticesPerPoly,
    );

    if (numVertsA + numVertsB - 2 > maxVerticesPerPoly) {
        return { value: -1, ea: -1, eb: -1 };
    }

    let ea = -1;
    let eb = -1;

    // Check if polygons share an edge
    for (let i = 0; i < numVertsA; i++) {
        let va0 = polygons[polyAStartIdx + i];
        let va1 = polygons[polyAStartIdx + ((i + 1) % numVertsA)];
        if (va0 > va1) [va0, va1] = [va1, va0];

        for (let j = 0; j < numVertsB; j++) {
            let vb0 = polygons[polyBStartIdx + j];
            let vb1 = polygons[polyBStartIdx + ((j + 1) % numVertsB)];
            if (vb0 > vb1) [vb0, vb1] = [vb1, vb0];

            if (va0 === vb0 && va1 === vb1) {
                ea = i;
                eb = j;
                break;
            }
        }
    }

    if (ea === -1 || eb === -1) {
        return { value: -1, ea: -1, eb: -1 };
    }

    // Check convexity
    const va = polygons[polyAStartIdx + ((ea + numVertsA - 1) % numVertsA)];
    const vb = polygons[polyAStartIdx + ea];
    const vc = polygons[polyBStartIdx + ((eb + 2) % numVertsB)];
    if (
        !uleft(
            [vertices[va * 3], 0, vertices[va * 3 + 2]],
            [vertices[vb * 3], 0, vertices[vb * 3 + 2]],
            [vertices[vc * 3], 0, vertices[vc * 3 + 2]],
        )
    ) {
        return { value: -1, ea: -1, eb: -1 };
    }

    const va2 = polygons[polyBStartIdx + ((eb + numVertsB - 1) % numVertsB)];
    const vb2 = polygons[polyBStartIdx + eb];
    const vc2 = polygons[polyAStartIdx + ((ea + 2) % numVertsA)];
    if (
        !uleft(
            [vertices[va2 * 3], 0, vertices[va2 * 3 + 2]],
            [vertices[vb2 * 3], 0, vertices[vb2 * 3 + 2]],
            [vertices[vc2 * 3], 0, vertices[vc2 * 3 + 2]],
        )
    ) {
        return { value: -1, ea: -1, eb: -1 };
    }

    const vaEdge = polygons[polyAStartIdx + ea];
    const vbEdge = polygons[polyAStartIdx + ((ea + 1) % numVertsA)];
    const dx = vertices[vaEdge * 3] - vertices[vbEdge * 3];
    const dy = vertices[vaEdge * 3 + 2] - vertices[vbEdge * 3 + 2];

    return { value: dx * dx + dy * dy, ea, eb };
};

const mergePolyVerts = (
    polygons: number[],
    polyAStartIdx: number,
    polyBStartIdx: number,
    edgeIdxA: number,
    edgeIdxB: number,
    tempStartIdx: number,
    maxVerticesPerPoly: number,
): void => {
    const numVertsA = countPolyVerts(
        polygons,
        polyAStartIdx,
        maxVerticesPerPoly,
    );
    const numVertsB = countPolyVerts(
        polygons,
        polyBStartIdx,
        maxVerticesPerPoly,
    );

    // Clear tmp area
    for (let i = 0; i < maxVerticesPerPoly; i++) {
        polygons[tempStartIdx + i] = MESH_NULL_IDX;
    }

    let n = 0;

    // Add pa
    for (let i = 0; i < numVertsA - 1; i++) {
        polygons[tempStartIdx + n++] =
            polygons[polyAStartIdx + ((edgeIdxA + 1 + i) % numVertsA)];
    }
    // Add pb
    for (let i = 0; i < numVertsB - 1; i++) {
        polygons[tempStartIdx + n++] =
            polygons[polyBStartIdx + ((edgeIdxB + 1 + i) % numVertsB)];
    }

    // Copy back to pa
    for (let i = 0; i < maxVerticesPerPoly; i++) {
        polygons[polyAStartIdx + i] = polygons[tempStartIdx + i];
    }
};

export const buildMeshAdjacency = (
    polygons: number[],
    polygonCount: number,
    vertexCount: number,
    verticesPerPoly: number,
): boolean => {
    const maxEdgeCount = polygonCount * verticesPerPoly;
    const firstEdge = new Array(vertexCount).fill(MESH_NULL_IDX);
    const nextEdge = new Array(maxEdgeCount).fill(MESH_NULL_IDX);
    let edgeCount = 0;

    const edges: Edge[] = [];

    for (let i = 0; i < vertexCount; i++) {
        firstEdge[i] = MESH_NULL_IDX;
    }

    // build edges
    for (let i = 0; i < polygonCount; i++) {
        const polyStartIdx = i * verticesPerPoly * 2;
        for (let j = 0; j < verticesPerPoly; j++) {
            if (polygons[polyStartIdx + j] === MESH_NULL_IDX) break;
            const v0 = polygons[polyStartIdx + j];
            const v1 =
                j + 1 >= verticesPerPoly ||
                polygons[polyStartIdx + j + 1] === MESH_NULL_IDX
                    ? polygons[polyStartIdx]
                    : polygons[polyStartIdx + j + 1];
            if (v0 < v1) {
                const edge: Edge = {
                    vert: [v0, v1],
                    poly: [i, i],
                    polyEdge: [j, 0],
                };
                edges[edgeCount] = edge;
                nextEdge[edgeCount] = firstEdge[v0];
                firstEdge[v0] = edgeCount;
                edgeCount++;
            }
        }
    }

    // match edges
    for (let i = 0; i < polygonCount; i++) {
        const polyStartIdx = i * verticesPerPoly * 2;
        for (let j = 0; j < verticesPerPoly; j++) {
            if (polygons[polyStartIdx + j] === MESH_NULL_IDX) break;
            const v0 = polygons[polyStartIdx + j];
            const v1 =
                j + 1 >= verticesPerPoly ||
                polygons[polyStartIdx + j + 1] === MESH_NULL_IDX
                    ? polygons[polyStartIdx]
                    : polygons[polyStartIdx + j + 1];
            if (v0 > v1) {
                for (
                    let e = firstEdge[v1];
                    e !== MESH_NULL_IDX;
                    e = nextEdge[e]
                ) {
                    const edge = edges[e];
                    if (edge.vert[1] === v0 && edge.poly[0] === edge.poly[1]) {
                        edge.poly[1] = i;
                        edge.polyEdge[1] = j;
                        break;
                    }
                }
            }
        }
    }

    // store adjacency
    for (let i = 0; i < edgeCount; i++) {
        const e = edges[i];
        if (e.poly[0] !== e.poly[1]) {
            const p0Start = e.poly[0] * verticesPerPoly * 2;
            const p1Start = e.poly[1] * verticesPerPoly * 2;
            polygons[p0Start + verticesPerPoly + e.polyEdge[0]] = e.poly[1];
            polygons[p1Start + verticesPerPoly + e.polyEdge[1]] = e.poly[0];
        }
    }

    return true;
};

export const buildPolyMesh = (
    contourSet: ContourSet,
    maxVerticesPerPoly: number,
): PolyMesh => {
    // calculate sizes
    let maxVertices = 0;
    let maxTris = 0;
    let maxVertsPerCont = 0;

    for (let i = 0; i < contourSet.contours.length; i++) {
        const contour = contourSet.contours[i];
        if (contour.nVertices < 3) continue;
        maxVertices += contour.nVertices;
        maxTris += contour.nVertices - 2;
        maxVertsPerCont = Math.max(maxVertsPerCont, contour.nVertices);
    }

    if (maxVertices >= 0xfffe) {
        throw new Error(`Too many vertices: ${maxVertices}`);
    }

    // initialize mesh
    const mesh: PolyMesh = {
        vertices: new Array(maxVertices * 3).fill(0),
        polys: new Array(maxTris * maxVerticesPerPoly * 2).fill(MESH_NULL_IDX),
        regions: new Array(maxTris).fill(0),
        flags: new Array(maxTris).fill(0),
        areas: new Array(maxTris).fill(0),
        nVertices: 0,
        nPolys: 0,
        maxVerticesPerPoly,
        bounds: structuredClone(contourSet.bounds) as Box3,
        cellSize: contourSet.cellSize,
        cellHeight: contourSet.cellHeight,
        borderSize: contourSet.borderSize,
        maxEdgeError: contourSet.maxError,
    };

    const vflags = new Array(maxVertices).fill(0);
    const nextVert = new Array(maxVertices).fill(0);
    const firstVert = new Array(VERTEX_BUCKET_COUNT).fill(-1);
    const indices = new Array(maxVertsPerCont);
    const tris = new Array(maxVertsPerCont * 3);
    const polys = new Array((maxVertsPerCont + 1) * maxVerticesPerPoly).fill(
        MESH_NULL_IDX,
    );
    const tmpPolyStart = maxVertsPerCont * maxVerticesPerPoly;

    const vertexCount = { value: 0 };

    // process each contour
    for (let i = 0; i < contourSet.contours.length; i++) {
        const cont = contourSet.contours[i];

        if (cont.nVertices < 3) continue;

        // create indices
        for (let j = 0; j < cont.nVertices; j++) {
            indices[j] = j;
        }

        // triangulate contour
        let ntris = triangulate(cont.nVertices, cont.vertices, indices, tris);
        if (ntris <= 0) {
            console.warn(`Bad triangulation for contour ${i}`);
            ntris = Math.abs(ntris);
        }

        // add vertices
        for (let j = 0; j < cont.nVertices; j++) {
            const v = [
                cont.vertices[j * 4],
                cont.vertices[j * 4 + 1],
                cont.vertices[j * 4 + 2],
                cont.vertices[j * 4 + 3],
            ];
            indices[j] = addVertex(
                v[0],
                v[1],
                v[2],
                mesh.vertices,
                firstVert,
                nextVert,
                vertexCount,
            );
            if (v[3] & BORDER_VERTEX) {
                vflags[indices[j]] = 1;
            }
        }

        // build initial polygons
        let npolys = 0;
        polys.fill(MESH_NULL_IDX, 0, maxVertsPerCont * maxVerticesPerPoly);

        for (let j = 0; j < ntris; j++) {
            const t = [tris[j * 3], tris[j * 3 + 1], tris[j * 3 + 2]];
            if (t[0] !== t[1] && t[0] !== t[2] && t[1] !== t[2]) {
                polys[npolys * maxVerticesPerPoly] = indices[t[0]];
                polys[npolys * maxVerticesPerPoly + 1] = indices[t[1]];
                polys[npolys * maxVerticesPerPoly + 2] = indices[t[2]];
                npolys++;
            }
        }

        if (npolys === 0) continue;

        // merge polygons
        if (maxVerticesPerPoly > 3) {
            while (true) {
                let bestMergeVal = 0;
                let bestPa = 0;
                let bestPb = 0;
                let bestEa = 0;
                let bestEb = 0;

                for (let j = 0; j < npolys - 1; j++) {
                    for (let k = j + 1; k < npolys; k++) {
                        const paStart = j * maxVerticesPerPoly;
                        const pbStart = k * maxVerticesPerPoly;
                        const result = getPolyMergeValue(
                            polys,
                            paStart,
                            pbStart,
                            mesh.vertices,
                            maxVerticesPerPoly,
                        );
                        if (result.value > bestMergeVal) {
                            bestMergeVal = result.value;
                            bestPa = j;
                            bestPb = k;
                            bestEa = result.ea;
                            bestEb = result.eb;
                        }
                    }
                }

                if (bestMergeVal > 0) {
                    const paStart = bestPa * maxVerticesPerPoly;
                    const pbStart = bestPb * maxVerticesPerPoly;
                    mergePolyVerts(
                        polys,
                        paStart,
                        pbStart,
                        bestEa,
                        bestEb,
                        tmpPolyStart,
                        maxVerticesPerPoly,
                    );

                    // move last poly to fill gap
                    for (let m = 0; m < maxVerticesPerPoly; m++) {
                        polys[pbStart + m] =
                            polys[(npolys - 1) * maxVerticesPerPoly + m];
                    }
                    npolys--;
                } else {
                    break;
                }
            }
        }

        // store polygons
        for (let j = 0; j < npolys; j++) {
            const pStart = mesh.nPolys * maxVerticesPerPoly * 2;
            const qStart = j * maxVerticesPerPoly;
            for (let k = 0; k < maxVerticesPerPoly; k++) {
                mesh.polys[pStart + k] = polys[qStart + k];
            }
            mesh.regions[mesh.nPolys] = cont.reg;
            mesh.areas[mesh.nPolys] = cont.area;
            mesh.nPolys++;

            if (mesh.nPolys > maxTris) {
                throw new Error(
                    `Too many polygons: ${mesh.nPolys} (max: ${maxTris})`,
                );
            }
        }
    }

    mesh.nVertices = vertexCount.value;

    // remove edge vertices
    for (let i = 0; i < mesh.nVertices; i++) {
        if (vflags[i]) {
            if (!canRemoveVertex(mesh, i)) {
                continue;
            }
            if (!removeVertex(mesh, i, maxTris)) {
                console.error(`Failed to remove edge vertex ${i}`);
                throw new Error(`Failed to remove edge vertex ${i}`);
            }
            // remove vertex - note: mesh.nVertices is already decremented inside removeVertex()!
            // fixup vertex flags
            for (let j = i; j < mesh.nVertices; j++) {
                vflags[j] = vflags[j + 1];
            }
            i--;
        }
    }

    // build mesh adjacency
    if (
        !buildMeshAdjacency(
            mesh.polys,
            mesh.nPolys,
            mesh.nVertices,
            maxVerticesPerPoly,
        )
    ) {
        throw new Error('Failed to build mesh adjacency');
    }

    // find portal edges
    findPortalEdges(mesh, contourSet.width, contourSet.height);

    // trim arrays to size
    mesh.polys.length = mesh.nPolys * maxVerticesPerPoly * 2;
    mesh.regions.length = mesh.nPolys;
    mesh.flags.length = mesh.nPolys;

    // allocate and initialize mesh flags array
    mesh.flags = new Array(mesh.nPolys).fill(0);

    return mesh;
};

const canRemoveVertex = (mesh: PolyMesh, remVertexIdx: number): boolean => {
    const nvp = mesh.maxVerticesPerPoly;

    // Count number of polygons to remove
    let numTouchedVerts = 0;
    let numRemainingEdges = 0;

    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * nvp * 2;
        const nv = countPolyVerts(mesh.polys, polyStart, nvp);
        let numRemoved = 0;
        let numVerts = 0;

        for (let j = 0; j < nv; j++) {
            if (mesh.polys[polyStart + j] === remVertexIdx) {
                numTouchedVerts++;
                numRemoved++;
            }
            numVerts++;
        }

        if (numRemoved) {
            numRemainingEdges += numVerts - (numRemoved + 1);
        }
    }

    // There would be too few edges remaining to create a polygon
    if (numRemainingEdges <= 2) {
        return false;
    }

    // Find edges which share the removed vertex
    const maxEdges = numTouchedVerts * 2;
    const edges: number[] = new Array(maxEdges * 3);
    let nedges = 0;

    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * nvp * 2;
        const nv = countPolyVerts(mesh.polys, polyStart, nvp);

        // Collect edges which touch the removed vertex
        for (let j = 0, k = nv - 1; j < nv; k = j++) {
            if (
                mesh.polys[polyStart + j] === remVertexIdx ||
                mesh.polys[polyStart + k] === remVertexIdx
            ) {
                // Arrange edge so that a=rem
                let a = mesh.polys[polyStart + j];
                let b = mesh.polys[polyStart + k];
                if (b === remVertexIdx) {
                    [a, b] = [b, a];
                }

                // Check if the edge exists
                let exists = false;
                for (let m = 0; m < nedges; m++) {
                    const e = m * 3;
                    if (edges[e + 1] === b) {
                        // Exists, increment vertex share count
                        edges[e + 2]++;
                        exists = true;
                        break;
                    }
                }

                // Add new edge
                if (!exists) {
                    const e = nedges * 3;
                    edges[e] = a;
                    edges[e + 1] = b;
                    edges[e + 2] = 1;
                    nedges++;
                }
            }
        }
    }

    // There should be no more than 2 open edges
    let numOpenEdges = 0;
    for (let i = 0; i < nedges; i++) {
        if (edges[i * 3 + 2] < 2) {
            numOpenEdges++;
        }
    }

    return numOpenEdges <= 2;
};

// Helper functions for hole building
const pushFront = (v: number, arr: number[], an: { value: number }) => {
    an.value++;
    for (let i = an.value - 1; i > 0; i--) {
        arr[i] = arr[i - 1];
    }
    arr[0] = v;
};

const pushBack = (v: number, arr: number[], an: { value: number }) => {
    arr[an.value] = v;
    an.value++;
};

const removeVertex = (
    mesh: PolyMesh,
    remVertexIdx: number,
    maxTris: number,
): boolean => {
    const nvp = mesh.maxVerticesPerPoly;

    // Count number of polygons to remove
    let numRemovedVerts = 0;
    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * nvp * 2;
        const nv = countPolyVerts(mesh.polys, polyStart, nvp);
        for (let j = 0; j < nv; j++) {
            if (mesh.polys[polyStart + j] === remVertexIdx) {
                numRemovedVerts++;
            }
        }
    }

    const edges: number[] = new Array(numRemovedVerts * nvp * 4);
    let nedges = 0;
    const hole: number[] = new Array(numRemovedVerts * nvp);
    let nhole = 0;
    const hreg: number[] = new Array(numRemovedVerts * nvp);
    let nhreg = 0;
    const harea: number[] = new Array(numRemovedVerts * nvp);
    let nharea = 0;

    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * nvp * 2;
        const nv = countPolyVerts(mesh.polys, polyStart, nvp);
        let hasRem = false;

        for (let j = 0; j < nv; j++) {
            if (mesh.polys[polyStart + j] === remVertexIdx) {
                hasRem = true;
                break;
            }
        }

        if (hasRem) {
            // Collect edges which do not touch the removed vertex
            for (let j = 0, k = nv - 1; j < nv; k = j++) {
                if (
                    mesh.polys[polyStart + j] !== remVertexIdx &&
                    mesh.polys[polyStart + k] !== remVertexIdx
                ) {
                    const e = nedges * 4;
                    edges[e] = mesh.polys[polyStart + k];
                    edges[e + 1] = mesh.polys[polyStart + j];
                    edges[e + 2] = mesh.regions[i];
                    edges[e + 3] = mesh.areas[i];
                    nedges++;
                }
            }

            // Remove the polygon
            const lastPolyStart = (mesh.nPolys - 1) * nvp * 2;
            if (polyStart !== lastPolyStart) {
                for (let j = 0; j < nvp * 2; j++) {
                    mesh.polys[polyStart + j] = mesh.polys[lastPolyStart + j];
                }
            }

            // Clear the last polygon
            for (let j = 0; j < nvp; j++) {
                mesh.polys[lastPolyStart + nvp + j] = MESH_NULL_IDX;
            }

            mesh.regions[i] = mesh.regions[mesh.nPolys - 1];
            mesh.areas[i] = mesh.areas[mesh.nPolys - 1];
            mesh.nPolys--;
            i--; // Reprocess this slot
        }
    }

    // Remove vertex
    for (let i = remVertexIdx; i < mesh.nVertices - 1; i++) {
        mesh.vertices[i * 3] = mesh.vertices[(i + 1) * 3];
        mesh.vertices[i * 3 + 1] = mesh.vertices[(i + 1) * 3 + 1];
        mesh.vertices[i * 3 + 2] = mesh.vertices[(i + 1) * 3 + 2];
    }
    mesh.nVertices--;

    // Adjust indices to match the removed vertex layout
    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * nvp * 2;
        const nv = countPolyVerts(mesh.polys, polyStart, nvp);
        for (let j = 0; j < nv; j++) {
            if (mesh.polys[polyStart + j] > remVertexIdx) {
                mesh.polys[polyStart + j]--;
            }
        }
    }

    for (let i = 0; i < nedges; i++) {
        if (edges[i * 4] > remVertexIdx) edges[i * 4]--;
        if (edges[i * 4 + 1] > remVertexIdx) edges[i * 4 + 1]--;
    }

    if (nedges === 0) {
        return true;
    }

    // Start with one vertex, keep appending connected segments
    const nholeRef = { value: 0 };
    const nhregRef = { value: 0 };
    const nhareaRef = { value: 0 };

    pushBack(edges[0], hole, nholeRef);
    pushBack(edges[2], hreg, nhregRef);
    pushBack(edges[3], harea, nhareaRef);

    nhole = nholeRef.value;
    nhreg = nhregRef.value;
    nharea = nhareaRef.value;

    while (nedges > 0) {
        let match = false;

        for (let i = 0; i < nedges; i++) {
            const ea = edges[i * 4];
            const eb = edges[i * 4 + 1];
            const r = edges[i * 4 + 2];
            const a = edges[i * 4 + 3];
            let add = false;

            if (hole[0] === eb) {
                // The segment matches the beginning of the hole boundary
                pushFront(ea, hole, nholeRef);
                pushFront(r, hreg, nhregRef);
                pushFront(a, harea, nhareaRef);
                add = true;
            } else if (hole[nhole - 1] === ea) {
                // The segment matches the end of the hole boundary
                pushBack(eb, hole, nholeRef);
                pushBack(r, hreg, nhregRef);
                pushBack(a, harea, nhareaRef);
                add = true;
            }

            if (add) {
                // The edge segment was added, remove it
                edges[i * 4] = edges[(nedges - 1) * 4];
                edges[i * 4 + 1] = edges[(nedges - 1) * 4 + 1];
                edges[i * 4 + 2] = edges[(nedges - 1) * 4 + 2];
                edges[i * 4 + 3] = edges[(nedges - 1) * 4 + 3];
                nedges--;
                match = true;
                i--;
            }

            nhole = nholeRef.value;
            nhreg = nhregRef.value;
            nharea = nhareaRef.value;
        }

        if (!match) {
            break;
        }
    }

    // Generate temp vertex array for triangulation
    const tris: number[] = new Array(nhole * 3);
    const tverts: number[] = new Array(nhole * 4);
    const thole: number[] = new Array(nhole);

    for (let i = 0; i < nhole; i++) {
        const pi = hole[i];
        tverts[i * 4] = mesh.vertices[pi * 3];
        tverts[i * 4 + 1] = mesh.vertices[pi * 3 + 1];
        tverts[i * 4 + 2] = mesh.vertices[pi * 3 + 2];
        tverts[i * 4 + 3] = 0;
        thole[i] = i;
    }

    // Triangulate the hole
    let ntris = triangulate(nhole, tverts, thole, tris);
    if (ntris < 0) {
        ntris = -ntris;
        console.warn('removeVertex: triangulate() returned bad results');
    }

    // Merge the hole triangles back to polygons
    const polys: number[] = new Array((ntris + 1) * nvp);
    const pregs: number[] = new Array(ntris);
    const pareas: number[] = new Array(ntris);

    polys.fill(MESH_NULL_IDX);

    // Build initial polygons
    let npolys = 0;
    for (let j = 0; j < ntris; j++) {
        const t = [tris[j * 3], tris[j * 3 + 1], tris[j * 3 + 2]];
        if (t[0] !== t[1] && t[0] !== t[2] && t[1] !== t[2]) {
            polys[npolys * nvp] = hole[t[0]];
            polys[npolys * nvp + 1] = hole[t[1]];
            polys[npolys * nvp + 2] = hole[t[2]];

            // If this polygon covers multiple region types then mark it as such
            if (hreg[t[0]] !== hreg[t[1]] || hreg[t[1]] !== hreg[t[2]]) {
                pregs[npolys] = MULTIPLE_REGS;
            } else {
                pregs[npolys] = hreg[t[0]];
            }

            pareas[npolys] = harea[t[0]];
            npolys++;
        }
    }

    if (npolys === 0) {
        return true;
    }

    // Merge polygons
    if (nvp > 3) {
        while (true) {
            // Find best polygons to merge
            let bestMergeVal = 0;
            let bestPa = 0;
            let bestPb = 0;
            let bestEa = 0;
            let bestEb = 0;

            for (let j = 0; j < npolys - 1; j++) {
                const pjStart = j * nvp;
                for (let k = j + 1; k < npolys; k++) {
                    const pkStart = k * nvp;
                    const result = getPolyMergeValue(
                        polys,
                        pjStart,
                        pkStart,
                        mesh.vertices,
                        nvp,
                    );
                    if (result.value > bestMergeVal) {
                        bestMergeVal = result.value;
                        bestPa = j;
                        bestPb = k;
                        bestEa = result.ea;
                        bestEb = result.eb;
                    }
                }
            }

            if (bestMergeVal > 0) {
                // Found best, merge
                const paStart = bestPa * nvp;
                const pbStart = bestPb * nvp;
                mergePolyVerts(
                    polys,
                    paStart,
                    pbStart,
                    bestEa,
                    bestEb,
                    ntris * nvp,
                    nvp,
                );

                if (pregs[bestPa] !== pregs[bestPb]) {
                    pregs[bestPa] = MULTIPLE_REGS;
                }

                const lastStart = (npolys - 1) * nvp;
                if (pbStart !== lastStart) {
                    for (let m = 0; m < nvp; m++) {
                        polys[pbStart + m] = polys[lastStart + m];
                    }
                }
                pregs[bestPb] = pregs[npolys - 1];
                pareas[bestPb] = pareas[npolys - 1];
                npolys--;
            } else {
                // Could not merge any polygons, stop
                break;
            }
        }
    }

    // Store polygons
    for (let i = 0; i < npolys; i++) {
        if (mesh.nPolys >= maxTris) break;

        const meshPolyStart = mesh.nPolys * nvp * 2;
        const polyStart = i * nvp;

        // Clear the polygon
        for (let j = 0; j < nvp * 2; j++) {
            mesh.polys[meshPolyStart + j] = MESH_NULL_IDX;
        }

        for (let j = 0; j < nvp; j++) {
            mesh.polys[meshPolyStart + j] = polys[polyStart + j];
        }

        mesh.regions[mesh.nPolys] = pregs[i];
        mesh.areas[mesh.nPolys] = pareas[i];
        mesh.nPolys++;

        if (mesh.nPolys > maxTris) {
            console.error(
                `removeVertex: Too many polygons ${mesh.nPolys} (max:${maxTris})`,
            );
            return false;
        }
    }

    return true;
};

export const findPortalEdges = (
    mesh: PolyMesh,
    width: number,
    height: number,
): void => {
    if (mesh.borderSize <= 0) {
        return;
    }

    const maxVerticesPerPoly = mesh.maxVerticesPerPoly;
    const _va: Vec3 = [0, 0, 0];
    const _vb: Vec3 = [0, 0, 0];

    for (let i = 0; i < mesh.nPolys; i++) {
        const polyStart = i * 2 * maxVerticesPerPoly;
        for (let j = 0; j < maxVerticesPerPoly; j++) {
            if (mesh.polys[polyStart + j] === MESH_NULL_IDX) break;
            // Skip connected edges
            if (
                mesh.polys[polyStart + maxVerticesPerPoly + j] !== MESH_NULL_IDX
            ) {
                continue;
            }

            let nj = j + 1;
            if (
                nj >= maxVerticesPerPoly ||
                mesh.polys[polyStart + nj] === MESH_NULL_IDX
            ) {
                nj = 0;
            }

            _va[0] = mesh.vertices[mesh.polys[polyStart + j] * 3];
            _va[1] = mesh.vertices[mesh.polys[polyStart + j] * 3 + 1];
            _va[2] = mesh.vertices[mesh.polys[polyStart + j] * 3 + 2];

            _vb[0] = mesh.vertices[mesh.polys[polyStart + nj] * 3];
            _vb[1] = mesh.vertices[mesh.polys[polyStart + nj] * 3 + 1];
            _vb[2] = mesh.vertices[mesh.polys[polyStart + nj] * 3 + 2];

            if (_va[0] === 0 && _vb[0] === 0) {
                mesh.polys[polyStart + maxVerticesPerPoly + j] =
                    POLY_NEIS_FLAG_EXT_LINK | 0;
            } else if (_va[2] === height && _vb[2] === height) {
                mesh.polys[polyStart + maxVerticesPerPoly + j] =
                    POLY_NEIS_FLAG_EXT_LINK | 1;
            } else if (_va[0] === width && _vb[0] === width) {
                mesh.polys[polyStart + maxVerticesPerPoly + j] =
                    POLY_NEIS_FLAG_EXT_LINK | 2;
            } else if (_va[2] === 0 && _vb[2] === 0) {
                mesh.polys[polyStart + maxVerticesPerPoly + j] =
                    POLY_NEIS_FLAG_EXT_LINK | 3;
            }
        }
    }
};
