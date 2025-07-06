import type { Box3 } from '@/common/maaths';
import type { ContourSet } from './contour-set';

/**
 * Represents a polygon mesh suitable for use in building a navigation mesh.
 */
export type PolyMesh = {
    /** The mesh vertices. Form: (x, y, z) * nverts */
    vertices: number[];
    /** Polygon and neighbor data. Length: maxpolys * 2 * nvp */
    polys: number[];
    /** The region id assigned to each polygon. Length: maxpolys */
    regions: number[];
    /** The user defined flags for each polygon. Length: maxpolys */
    flags: number[];
    /** The area id assigned to each polygon. Length: maxpolys */
    areas: number[];
    /** The number of vertices */
    nVertices: number;
    /** The number of polygons */
    nPolys: number;
    /** The number of allocated polygons */
    maxPolys: number;
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

// Constants
export const MESH_NULL_IDX = 0xffff;
export const BORDER_VERTEX = 0x10000;
const VERTEX_BUCKET_COUNT = 1 << 12;
const RC_MULTIPLE_REGS = 0;

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

const vequal = (vertexA: number[], vertexB: number[]): boolean =>
    vertexA[0] === vertexB[0] && vertexA[2] === vertexB[2];

const diagonalie = (
    startVertexIdx: number,
    endVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const diagonalStart = [
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[startVertexIdx] & 0x0fffffff) * 4 + 2],
    ];
    const diagonalEnd = [
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[endVertexIdx] & 0x0fffffff) * 4 + 2],
    ];

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
            const edgeStart = [
                vertices[(vertexIndices[k] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k] & 0x0fffffff) * 4 + 2],
            ];
            const edgeEnd = [
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 1],
                vertices[(vertexIndices[k1] & 0x0fffffff) * 4 + 2],
            ];

            if (
                vequal(diagonalStart, edgeStart) ||
                vequal(diagonalEnd, edgeStart) ||
                vequal(diagonalStart, edgeEnd) ||
                vequal(diagonalEnd, edgeEnd)
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

const inCone = (
    coneVertexIdx: number,
    testVertexIdx: number,
    polygonVertexCount: number,
    vertices: number[],
    vertexIndices: number[],
): boolean => {
    const coneVertex = [
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[coneVertexIdx] & 0x0fffffff) * 4 + 2],
    ];
    const testVertex = [
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 1],
        vertices[(vertexIndices[testVertexIdx] & 0x0fffffff) * 4 + 2],
    ];
    const nextVertex = [
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
    ];
    const prevVertex = [
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
    ];

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
                const p0 = [
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4],
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 1],
                    vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 2],
                ];
                const p2 = [
                    vertices[(vertexIndices[next(i1, nv)] & 0x0fffffff) * 4],
                    vertices[
                        (vertexIndices[next(i1, nv)] & 0x0fffffff) * 4 + 1
                    ],
                    vertices[
                        (vertexIndices[next(i1, nv)] & 0x0fffffff) * 4 + 2
                    ],
                ];

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
                if (diagonal(i, i2, nv, vertices, vertexIndices)) {
                    // Using loose version would be better but simplified
                    const p0 = [
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4],
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 1],
                        vertices[(vertexIndices[i] & 0x0fffffff) * 4 + 2],
                    ];
                    const p2 = [
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4
                        ],
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4 + 1
                        ],
                        vertices[
                            (vertexIndices[next(i2, nv)] & 0x0fffffff) * 4 + 2
                        ],
                    ];
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

const buildMeshAdjacency = (
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

    // Build edges
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

    // Match edges
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

    // Store adjacency
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
    // Calculate sizes
    let maxVertices = 0;
    let maxTris = 0;
    let maxVertsPerCont = 0;

    for (let i = 0; i < contourSet.contours.length; i++) {
        const cont = contourSet.contours[i];
        if (cont.nVertices < 3) continue;
        maxVertices += cont.nVertices;
        maxTris += cont.nVertices - 2;
        maxVertsPerCont = Math.max(maxVertsPerCont, cont.nVertices);
    }

    if (maxVertices >= 0xfffe) {
        throw new Error(`Too many vertices: ${maxVertices}`);
    }

    // Initialize mesh
    const mesh: PolyMesh = {
        vertices: new Array(maxVertices * 3).fill(0),
        polys: new Array(maxTris * maxVerticesPerPoly * 2).fill(MESH_NULL_IDX),
        regions: new Array(maxTris).fill(0),
        flags: new Array(maxTris).fill(0),
        areas: new Array(maxTris).fill(0),
        nVertices: 0,
        nPolys: 0,
        maxPolys: maxTris,
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

    const nv = { value: 0 };

    // Process each contour
    for (let i = 0; i < contourSet.contours.length; i++) {
        const cont = contourSet.contours[i];

        if (cont.nVertices < 3) continue;

        // Create indices
        for (let j = 0; j < cont.nVertices; j++) {
            indices[j] = j;
        }

        // Triangulate contour
        let ntris = triangulate(cont.nVertices, cont.vertices, indices, tris);
        if (ntris <= 0) {
            console.warn(`Bad triangulation for contour ${i}`);
            ntris = Math.abs(ntris);
        }

        // Add vertices
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
                nv,
            );
            if (v[3] & BORDER_VERTEX) {
                vflags[indices[j]] = 1;
            }
        }

        // Build initial polygons
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

        // Merge polygons
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

                    // Move last poly to fill gap
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

        // Store polygons
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

    mesh.nVertices = nv.value;

    // Build mesh adjacency
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

    return mesh;
};
