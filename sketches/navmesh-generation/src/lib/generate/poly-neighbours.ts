import type { Vec3 } from '@/common/maaths';
import type { NavMeshPoly } from '../query';
import { MESH_NULL_IDX, POLY_NEIS_FLAG_EXT_LINK } from './common';

/** edge structure for mesh adjacency */
type Edge = {
    vert: [number, number];
    polyEdge: [number, number];
    poly: [number, number];
};

/**
 * Finds polygon edge neighbours, populates the neis array for each polygon.
 */
export const buildMeshAdjacency = (
    polys: NavMeshPoly[],
    vertexCount: number,
): void => {
    const polygonCount = polys.length;
    const maxEdgeCount = polys.reduce((sum, poly) => sum + poly.vertices.length, 0);
    const firstEdge = new Array(vertexCount).fill(MESH_NULL_IDX);
    const nextEdge = new Array(maxEdgeCount).fill(MESH_NULL_IDX);
    let edgeCount = 0;

    const edges: Edge[] = [];

    for (let i = 0; i < vertexCount; i++) {
        firstEdge[i] = MESH_NULL_IDX;
    }

    // build edges
    for (let i = 0; i < polygonCount; i++) {
        const poly = polys[i];
        for (let j = 0; j < poly.vertices.length; j++) {
            const v0 = poly.vertices[j];
            const v1 = poly.vertices[(j + 1) % poly.vertices.length];
            
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
        const poly = polys[i];
        for (let j = 0; j < poly.vertices.length; j++) {
            const v0 = poly.vertices[j];
            const v1 = poly.vertices[(j + 1) % poly.vertices.length];
            
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
            polys[e.poly[0]].neis[e.polyEdge[0]] = e.poly[1];
            polys[e.poly[1]].neis[e.polyEdge[1]] = e.poly[0];
        }
    }
};

export const findPortalEdges = (
    polys: NavMeshPoly[],
    vertices: number[],
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
): void => {
    const va: Vec3 = [0, 0, 0];
    const vb: Vec3 = [0, 0, 0];

    for (let i = 0; i < polys.length; i++) {
        const poly = polys[i];
        for (let j = 0; j < poly.vertices.length; j++) {
            // skip connected edges
            if (poly.neis[j] !== MESH_NULL_IDX) {
                continue;
            }

            const nj = (j + 1) % poly.vertices.length;

            va[0] = vertices[poly.vertices[j] * 3];
            va[1] = vertices[poly.vertices[j] * 3 + 1];
            va[2] = vertices[poly.vertices[j] * 3 + 2];

            vb[0] = vertices[poly.vertices[nj] * 3];
            vb[1] = vertices[poly.vertices[nj] * 3 + 1];
            vb[2] = vertices[poly.vertices[nj] * 3 + 2];

            if (va[0] === minX && vb[0] === minX) {
                poly.neis[j] = POLY_NEIS_FLAG_EXT_LINK | 0;
            } else if (va[2] === maxZ && vb[2] === maxZ) {
                poly.neis[j] = POLY_NEIS_FLAG_EXT_LINK | 1;
            } else if (va[0] === maxX && vb[0] === maxX) {
                poly.neis[j] = POLY_NEIS_FLAG_EXT_LINK | 2;
            } else if (va[2] === minZ && vb[2] === minZ) {
                poly.neis[j] = POLY_NEIS_FLAG_EXT_LINK | 3;
            }
        }
    }
};

export const finalizePolyNeighbours = (polys: NavMeshPoly[]) => {
    for (const poly of polys) {
        for (let i = 0; i < poly.neis.length; i++) {
            const neiValue = poly.neis[i];

            if (neiValue & POLY_NEIS_FLAG_EXT_LINK) {
                // border or portal edge
                const dir = neiValue & 0xf;
                if (dir === 0xf) {
                    poly.neis[i] = 0;
                } else if (dir === 0) {
                    poly.neis[i] = POLY_NEIS_FLAG_EXT_LINK | 4; // Portal x-
                } else if (dir === 1) {
                    poly.neis[i] = POLY_NEIS_FLAG_EXT_LINK | 2; // Portal z+
                } else if (dir === 2) {
                    poly.neis[i] = POLY_NEIS_FLAG_EXT_LINK | 0; // Portal x+
                } else if (dir === 3) {
                    poly.neis[i] = POLY_NEIS_FLAG_EXT_LINK | 6; // Portal z-
                } else {
                    // TODO: how to handle this case?
                    poly.neis[i] = 0;
                }
            } else {
                // normal internal connection (add 1 to convert from 0-based to 1-based indexing)
                poly.neis[i] = neiValue + 1;
            }
        }
    }
};

export const buildPolyNeighbours = (
    polys: NavMeshPoly[],
    vertices: number[],
    borderSize: number,
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number
) => {
    // initialize neis arrays for all polygons
    for (const poly of polys) {
        poly.neis = new Array(poly.vertices.length).fill(MESH_NULL_IDX);
    }

    // build adjacency information, finds internal neighbours for each polygon edge
    buildMeshAdjacency(polys, vertices.length / 3);

    // find portal edges
    if (borderSize > 0) {
        findPortalEdges(polys, vertices, minX, minZ, maxX, maxZ);
    }

    // final poly neis formatting
    finalizePolyNeighbours(polys);
};
