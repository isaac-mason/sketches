import type { Vec3 } from '@/common/maaths';
import { MESH_NULL_IDX, POLY_NEIS_FLAG_EXT_LINK } from './common';

/** edge structure for mesh adjacency */
type Edge = {
    vert: [number, number];
    polyEdge: [number, number];
    poly: [number, number];
};

/**
 * Finds polygon edge neighbours.
 */
export const buildMeshAdjacency = (polygons: number[], vertexCount: number, maxVerticesPerPoly: number): { success: boolean, neis: number[] } => {
    const neis = new Array(polygons.length).fill(MESH_NULL_IDX);

    const polygonCount = polygons.length / maxVerticesPerPoly;
    const maxEdgeCount = polygonCount * maxVerticesPerPoly;
    const firstEdge = new Array(vertexCount).fill(MESH_NULL_IDX);
    const nextEdge = new Array(maxEdgeCount).fill(MESH_NULL_IDX);
    let edgeCount = 0;

    const edges: Edge[] = [];

    for (let i = 0; i < vertexCount; i++) {
        firstEdge[i] = MESH_NULL_IDX;
    }

    // build edges
    for (let i = 0; i < polygonCount; i++) {
        const polyStartIdx = i * maxVerticesPerPoly;
        for (let j = 0; j < maxVerticesPerPoly; j++) {
            if (polygons[polyStartIdx + j] === MESH_NULL_IDX) break;
            const v0 = polygons[polyStartIdx + j];
            const v1 =
                j + 1 >= maxVerticesPerPoly || polygons[polyStartIdx + j + 1] === MESH_NULL_IDX
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
        const polyStartIdx = i * maxVerticesPerPoly;
        for (let j = 0; j < maxVerticesPerPoly; j++) {
            if (polygons[polyStartIdx + j] === MESH_NULL_IDX) break;
            const v0 = polygons[polyStartIdx + j];
            const v1 =
                j + 1 >= maxVerticesPerPoly || polygons[polyStartIdx + j + 1] === MESH_NULL_IDX
                    ? polygons[polyStartIdx]
                    : polygons[polyStartIdx + j + 1];
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

    // store adjacency
    for (let i = 0; i < edgeCount; i++) {
        const e = edges[i];
        if (e.poly[0] !== e.poly[1]) {
            const p0Start = e.poly[0] * maxVerticesPerPoly;
            const p1Start = e.poly[1] * maxVerticesPerPoly;
            neis[p0Start + e.polyEdge[0]] = e.poly[1];
            neis[p1Start + e.polyEdge[1]] = e.poly[0];
        }
    }

    return { success: true, neis };
};

export const findPortalEdges = (
    polys: number[],
    maxVerticesPerPoly: number,
    vertices: number[],
    neis: number[],
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
): void => {
    const nPolys = polys.length / maxVerticesPerPoly;

    const va: Vec3 = [0, 0, 0];
    const vb: Vec3 = [0, 0, 0];

    for (let i = 0; i < nPolys; i++) {
        const polyStart = i * maxVerticesPerPoly;
        for (let j = 0; j < maxVerticesPerPoly; j++) {
            if (polys[polyStart + j] === MESH_NULL_IDX) break;

            // skip connected edges
            if (neis[polyStart + j] !== MESH_NULL_IDX) {
                continue;
            }

            let nj = j + 1;
            if (nj >= maxVerticesPerPoly || polys[polyStart + nj] === MESH_NULL_IDX) {
                nj = 0;
            }

            va[0] = vertices[polys[polyStart + j] * 3];
            va[1] = vertices[polys[polyStart + j] * 3 + 1];
            va[2] = vertices[polys[polyStart + j] * 3 + 2];

            vb[0] = vertices[polys[polyStart + nj] * 3];
            vb[1] = vertices[polys[polyStart + nj] * 3 + 1];
            vb[2] = vertices[polys[polyStart + nj] * 3 + 2];

            if (va[0] === minX && vb[0] === minX) {
                neis[polyStart + j] = POLY_NEIS_FLAG_EXT_LINK | 0;
            } else if (va[2] === maxZ && vb[2] === maxZ) {
                neis[polyStart + j] = POLY_NEIS_FLAG_EXT_LINK | 1;
            } else if (va[0] === maxX && vb[0] === maxX) {
                neis[polyStart + j] = POLY_NEIS_FLAG_EXT_LINK | 2;
            } else if (va[2] === minZ && vb[2] === minZ) {
                neis[polyStart + j] = POLY_NEIS_FLAG_EXT_LINK | 3;
            }
        }
    }
};
