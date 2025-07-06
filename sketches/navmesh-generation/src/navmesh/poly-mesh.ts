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
    verts: number[],
    firstVert: number[],
    nextVert: number[],
    nv: { value: number }
): number => {
    const bucket = computeVertexHash(x, 0, z);
    let i = firstVert[bucket];

    while (i !== -1) {
        const vx = verts[i * 3];
        const vy = verts[i * 3 + 1];
        const vz = verts[i * 3 + 2];
        if (vx === x && Math.abs(vy - y) <= 2 && vz === z) {
            return i;
        }
        i = nextVert[i];
    }

    // Could not find, create new
    i = nv.value;
    nv.value++;
    verts[i * 3] = x;
    verts[i * 3 + 1] = y;
    verts[i * 3 + 2] = z;
    nextVert[i] = firstVert[bucket];
    firstVert[bucket] = i;

    return i;
};

// Helper functions for polygon operations
const prev = (i: number, n: number): number => i - 1 >= 0 ? i - 1 : n - 1;
const next = (i: number, n: number): number => i + 1 < n ? i + 1 : 0;

const area2 = (a: number[], b: number[], c: number[]): number => {
    return (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
};

const xorb = (x: boolean, y: boolean): boolean => !x !== !y;

const left = (a: number[], b: number[], c: number[]): boolean => area2(a, b, c) < 0;
const leftOn = (a: number[], b: number[], c: number[]): boolean => area2(a, b, c) <= 0;
const collinear = (a: number[], b: number[], c: number[]): boolean => area2(a, b, c) === 0;

const intersectProp = (a: number[], b: number[], c: number[], d: number[]): boolean => {
    if (collinear(a, b, c) || collinear(a, b, d) || collinear(c, d, a) || collinear(c, d, b)) {
        return false;
    }
    return xorb(left(a, b, c), left(a, b, d)) && xorb(left(c, d, a), left(c, d, b));
};

const between = (a: number[], b: number[], c: number[]): boolean => {
    if (!collinear(a, b, c)) return false;
    if (a[0] !== b[0]) {
        return ((a[0] <= c[0]) && (c[0] <= b[0])) || ((a[0] >= c[0]) && (c[0] >= b[0]));
    }
    return ((a[2] <= c[2]) && (c[2] <= b[2])) || ((a[2] >= c[2]) && (c[2] >= b[2]));
};

const intersect = (a: number[], b: number[], c: number[], d: number[]): boolean => {
    if (intersectProp(a, b, c, d)) return true;
    return between(a, b, c) || between(a, b, d) || between(c, d, a) || between(c, d, b);
};

const vequal = (a: number[], b: number[]): boolean => a[0] === b[0] && a[2] === b[2];

const diagonalie = (i: number, j: number, n: number, verts: number[], indices: number[]): boolean => {
    const d0 = [
        verts[(indices[i] & 0x0fffffff) * 4],
        verts[(indices[i] & 0x0fffffff) * 4 + 1],
        verts[(indices[i] & 0x0fffffff) * 4 + 2]
    ];
    const d1 = [
        verts[(indices[j] & 0x0fffffff) * 4],
        verts[(indices[j] & 0x0fffffff) * 4 + 1],
        verts[(indices[j] & 0x0fffffff) * 4 + 2]
    ];

    for (let k = 0; k < n; k++) {
        const k1 = next(k, n);
        if (!((k === i) || (k1 === i) || (k === j) || (k1 === j))) {
            const p0 = [
                verts[(indices[k] & 0x0fffffff) * 4],
                verts[(indices[k] & 0x0fffffff) * 4 + 1],
                verts[(indices[k] & 0x0fffffff) * 4 + 2]
            ];
            const p1 = [
                verts[(indices[k1] & 0x0fffffff) * 4],
                verts[(indices[k1] & 0x0fffffff) * 4 + 1],
                verts[(indices[k1] & 0x0fffffff) * 4 + 2]
            ];

            if (vequal(d0, p0) || vequal(d1, p0) || vequal(d0, p1) || vequal(d1, p1)) {
                continue;
            }

            if (intersect(d0, d1, p0, p1)) {
                return false;
            }
        }
    }
    return true;
};

const inCone = (i: number, j: number, n: number, verts: number[], indices: number[]): boolean => {
    const pi = [
        verts[(indices[i] & 0x0fffffff) * 4],
        verts[(indices[i] & 0x0fffffff) * 4 + 1],
        verts[(indices[i] & 0x0fffffff) * 4 + 2]
    ];
    const pj = [
        verts[(indices[j] & 0x0fffffff) * 4],
        verts[(indices[j] & 0x0fffffff) * 4 + 1],
        verts[(indices[j] & 0x0fffffff) * 4 + 2]
    ];
    const pi1 = [
        verts[(indices[next(i, n)] & 0x0fffffff) * 4],
        verts[(indices[next(i, n)] & 0x0fffffff) * 4 + 1],
        verts[(indices[next(i, n)] & 0x0fffffff) * 4 + 2]
    ];
    const pin1 = [
        verts[(indices[prev(i, n)] & 0x0fffffff) * 4],
        verts[(indices[prev(i, n)] & 0x0fffffff) * 4 + 1],
        verts[(indices[prev(i, n)] & 0x0fffffff) * 4 + 2]
    ];

    if (leftOn(pin1, pi, pi1)) {
        return left(pi, pj, pin1) && left(pj, pi, pi1);
    }
    return !(leftOn(pi, pj, pi1) && leftOn(pj, pi, pin1));
};

const diagonal = (i: number, j: number, n: number, verts: number[], indices: number[]): boolean => {
    return inCone(i, j, n, verts, indices) && diagonalie(i, j, n, verts, indices);
};

const triangulate = (n: number, verts: number[], indices: number[], tris: number[]): number => {
    let ntris = 0;
    let dst = 0;

    // Mark removable vertices
    for (let i = 0; i < n; i++) {
        const i1 = next(i, n);
        const i2 = next(i1, n);
        if (diagonal(i, i2, n, verts, indices)) {
            indices[i1] |= 0x80000000;
        }
    }

    let nv = n;
    while (nv > 3) {
        let minLen = -1;
        let mini = -1;

        for (let i = 0; i < nv; i++) {
            const i1 = next(i, nv);
            if (indices[i1] & 0x80000000) {
                const p0 = [
                    verts[(indices[i] & 0x0fffffff) * 4],
                    verts[(indices[i] & 0x0fffffff) * 4 + 1],
                    verts[(indices[i] & 0x0fffffff) * 4 + 2]
                ];
                const p2 = [
                    verts[(indices[next(i1, nv)] & 0x0fffffff) * 4],
                    verts[(indices[next(i1, nv)] & 0x0fffffff) * 4 + 1],
                    verts[(indices[next(i1, nv)] & 0x0fffffff) * 4 + 2]
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
                if (diagonal(i, i2, nv, verts, indices)) { // Using loose version would be better but simplified
                    const p0 = [
                        verts[(indices[i] & 0x0fffffff) * 4],
                        verts[(indices[i] & 0x0fffffff) * 4 + 1],
                        verts[(indices[i] & 0x0fffffff) * 4 + 2]
                    ];
                    const p2 = [
                        verts[(indices[next(i2, nv)] & 0x0fffffff) * 4],
                        verts[(indices[next(i2, nv)] & 0x0fffffff) * 4 + 1],
                        verts[(indices[next(i2, nv)] & 0x0fffffff) * 4 + 2]
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

        tris[dst++] = indices[i] & 0x0fffffff;
        tris[dst++] = indices[i1] & 0x0fffffff;
        tris[dst++] = indices[i2] & 0x0fffffff;
        ntris++;

        // Remove vertex
        nv--;
        for (let k = i1; k < nv; k++) {
            indices[k] = indices[k + 1];
        }

        if (i1 >= nv) i1 = 0;
        const iPrev = prev(i1, nv);

        // Update diagonal flags
        if (diagonal(prev(iPrev, nv), i1, nv, verts, indices)) {
            indices[iPrev] |= 0x80000000;
        } else {
            indices[iPrev] &= 0x0fffffff;
        }

        if (diagonal(iPrev, next(i1, nv), nv, verts, indices)) {
            indices[i1] |= 0x80000000;
        } else {
            indices[i1] &= 0x0fffffff;
        }
    }

    // Final triangle
    tris[dst++] = indices[0] & 0x0fffffff;
    tris[dst++] = indices[1] & 0x0fffffff;
    tris[dst++] = indices[2] & 0x0fffffff;
    ntris++;

    return ntris;
};

const countPolyVerts = (p: number[], maxVerticesPerPoly: number): number => {
    for (let i = 0; i < maxVerticesPerPoly; i++) {
        if (p[i] === MESH_NULL_IDX) return i;
    }
    return maxVerticesPerPoly;
};

const uleft = (a: number[], b: number[], c: number[]): boolean => {
    return (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]) < 0;
};

const getPolyMergeValue = (
    pa: number[],
    pb: number[],
    verts: number[],
    maxVerticesPerPoly: number
): { value: number; ea: number; eb: number } => {
    const na = countPolyVerts(pa, maxVerticesPerPoly);
    const nb = countPolyVerts(pb, maxVerticesPerPoly);

    if (na + nb - 2 > maxVerticesPerPoly) {
        return { value: -1, ea: -1, eb: -1 };
    }

    let ea = -1;
    let eb = -1;

    // Check if polygons share an edge
    for (let i = 0; i < na; i++) {
        let va0 = pa[i];
        let va1 = pa[(i + 1) % na];
        if (va0 > va1) [va0, va1] = [va1, va0];

        for (let j = 0; j < nb; j++) {
            let vb0 = pb[j];
            let vb1 = pb[(j + 1) % nb];
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
    const va = pa[(ea + na - 1) % na];
    const vb = pa[ea];
    const vc = pb[(eb + 2) % nb];
    if (!uleft([verts[va * 3], 0, verts[va * 3 + 2]], 
               [verts[vb * 3], 0, verts[vb * 3 + 2]], 
               [verts[vc * 3], 0, verts[vc * 3 + 2]])) {
        return { value: -1, ea: -1, eb: -1 };
    }

    const va2 = pb[(eb + nb - 1) % nb];
    const vb2 = pb[eb];
    const vc2 = pa[(ea + 2) % na];
    if (!uleft([verts[va2 * 3], 0, verts[va2 * 3 + 2]], 
               [verts[vb2 * 3], 0, verts[vb2 * 3 + 2]], 
               [verts[vc2 * 3], 0, verts[vc2 * 3 + 2]])) {
        return { value: -1, ea: -1, eb: -1 };
    }

    const vaEdge = pa[ea];
    const vbEdge = pa[(ea + 1) % na];
    const dx = verts[vaEdge * 3] - verts[vbEdge * 3];
    const dy = verts[vaEdge * 3 + 2] - verts[vbEdge * 3 + 2];

    return { value: dx * dx + dy * dy, ea, eb };
};

const mergePolyVerts = (
    pa: number[],
    pb: number[],
    ea: number,
    eb: number,
    tmp: number[],
    maxVerticesPerPoly: number
): void => {
    const na = countPolyVerts(pa, maxVerticesPerPoly);
    const nb = countPolyVerts(pb, maxVerticesPerPoly);

    tmp.fill(MESH_NULL_IDX);
    let n = 0;

    // Add pa
    for (let i = 0; i < na - 1; i++) {
        tmp[n++] = pa[(ea + 1 + i) % na];
    }
    // Add pb
    for (let i = 0; i < nb - 1; i++) {
        tmp[n++] = pb[(eb + 1 + i) % nb];
    }

    for (let i = 0; i < maxVerticesPerPoly; i++) {
        pa[i] = tmp[i];
    }
};

const buildMeshAdjacency = (
    polys: number[],
    npolys: number,
    nverts: number,
    vertsPerPoly: number
): boolean => {
    const maxEdgeCount = npolys * vertsPerPoly;
    const firstEdge = new Array(nverts + maxEdgeCount).fill(MESH_NULL_IDX);
    const nextEdge = firstEdge.slice(nverts);
    let edgeCount = 0;

    const edges: Edge[] = [];

    for (let i = 0; i < nverts; i++) {
        firstEdge[i] = MESH_NULL_IDX;
    }

    // Build edges
    for (let i = 0; i < npolys; i++) {
        const tStart = i * vertsPerPoly * 2;
        for (let j = 0; j < vertsPerPoly; j++) {
            if (polys[tStart + j] === MESH_NULL_IDX) break;
            const v0 = polys[tStart + j];
            const v1 = (j + 1 >= vertsPerPoly || polys[tStart + j + 1] === MESH_NULL_IDX) ? polys[tStart] : polys[tStart + j + 1];
            if (v0 < v1) {
                const edge: Edge = {
                    vert: [v0, v1],
                    poly: [i, i],
                    polyEdge: [j, 0]
                };
                edges[edgeCount] = edge;
                nextEdge[edgeCount] = firstEdge[v0];
                firstEdge[v0] = edgeCount;
                edgeCount++;
            }
        }
    }

    // Match edges
    for (let i = 0; i < npolys; i++) {
        const tStart = i * vertsPerPoly * 2;
        for (let j = 0; j < vertsPerPoly; j++) {
            if (polys[tStart + j] === MESH_NULL_IDX) break;
            const v0 = polys[tStart + j];
            const v1 = (j + 1 >= vertsPerPoly || polys[tStart + j + 1] === MESH_NULL_IDX) ? polys[tStart] : polys[tStart + j + 1];
            if (v0 > v1) {
                for (let e = firstEdge[v1]; e !== MESH_NULL_IDX; e = nextEdge[e]) {
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
            const p0Start = e.poly[0] * vertsPerPoly * 2;
            const p1Start = e.poly[1] * vertsPerPoly * 2;
            polys[p0Start + vertsPerPoly + e.polyEdge[0]] = e.poly[1];
            polys[p1Start + vertsPerPoly + e.polyEdge[1]] = e.poly[0];
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
        maxEdgeError: contourSet.maxError
    };

    const vflags = new Array(maxVertices).fill(0);
    const nextVert = new Array(maxVertices).fill(0);
    const firstVert = new Array(VERTEX_BUCKET_COUNT).fill(-1);
    const indices = new Array(maxVertsPerCont);
    const tris = new Array(maxVertsPerCont * 3);
    const polys = new Array((maxVertsPerCont + 1) * maxVerticesPerPoly).fill(MESH_NULL_IDX);
    const tmpPoly = polys.slice(maxVertsPerCont * maxVerticesPerPoly);

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
                cont.vertices[j * 4 + 3]
            ];
            indices[j] = addVertex(v[0], v[1], v[2], mesh.vertices, firstVert, nextVert, nv);
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
                        const pj = polys.slice(j * maxVerticesPerPoly, (j + 1) * maxVerticesPerPoly);
                        const pk = polys.slice(k * maxVerticesPerPoly, (k + 1) * maxVerticesPerPoly);
                        const result = getPolyMergeValue(pj, pk, mesh.vertices, maxVerticesPerPoly);
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
                    const pa = polys.slice(bestPa * maxVerticesPerPoly, (bestPa + 1) * maxVerticesPerPoly);
                    const pb = polys.slice(bestPb * maxVerticesPerPoly, (bestPb + 1) * maxVerticesPerPoly);
                    mergePolyVerts(pa, pb, bestEa, bestEb, tmpPoly, maxVerticesPerPoly);
                    
                    // Copy merged poly back to the original array
                    for (let m = 0; m < maxVerticesPerPoly; m++) {
                        polys[bestPa * maxVerticesPerPoly + m] = pa[m];
                    }

                    // Move last poly to fill gap
                    for (let m = 0; m < maxVerticesPerPoly; m++) {
                        polys[bestPb * maxVerticesPerPoly + m] = polys[(npolys - 1) * maxVerticesPerPoly + m];
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
                throw new Error(`Too many polygons: ${mesh.nPolys} (max: ${maxTris})`);
            }
        }
    }

    mesh.nVertices = nv.value;

    // Build mesh adjacency
    if (!buildMeshAdjacency(mesh.polys, mesh.nPolys, mesh.nVertices, maxVerticesPerPoly)) {
        throw new Error('Failed to build mesh adjacency');
    }

    return mesh;
};
