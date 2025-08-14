import type { Box3 } from '@/common/maaths';
import type { NavMeshTile, NavMeshPolyDetail, NavMeshPoly } from '../query';
import { MESH_NULL_IDX, POLY_NEIS_FLAG_EXT_LINK } from './common';
import { buildNavMeshBvTree } from '../query/nav-mesh-bv-tree';
import { NodeType } from '../query/nav-mesh';

/** the source data used to create a navigation mesh tile */
export type NavMeshTileParams = {
    /** the polygon mesh parameters */
    polyMesh: {
        /** the polygon mesh vertices, [x1, y1, z1, ...], in local tile cell space */
        vertices: number[];

        /** the polygon vertex indices */
        polys: number[];

        /** the polygon edge neighbors */
        neis: number[];

        /** the polygon flags */
        polyFlags: number[];

        /** the polygon area ids */
        polyAreas: number[];

        /** the maximum number of vertices per polygon [Limit: >= 3] */
        maxVerticesPerPoly: number;
    };

    /** (optional) height detail attributes */
    detailMesh?: {
        /** the detail mesh sub-mesh data */
        detailMeshes: number[];

        /** the detail mesh vertices, [x1, y1, z1, ...] */
        detailVertices: number[];

        /** the number of vertices in the detail mesh */
        nVertices: number;

        /** the detail mesh triangles, [a1, b1, c1, a2, b2, c2, ...] */
        detailTriangles: number[];

        /** the number of triangles in the detail mesh */
        nTriangles: number;
    };

    /** the user defined id of the tile */
    userId: number;

    /** the tile'x x-grid location within the multi-tile destination mesh (along the x axis) */
    tileX: number;

    /** the tile's y-grid location within the multi-tile destination mesh (along the z axis) */
    tileY: number;

    /** the tile's layer within the layered destination mesh (along the y axis) */
    tileLayer: number;

    /** the bounds of the tile */
    bounds: Box3;

    /** whether to build a bounding volume tree for the tile */
    buildBvTree: boolean;

    /** the xz-plane cell size of the polygon mesh */
    cellSize: number;

    /** the y-axis cell height of the polygon mesh */
    cellHeight: number;

    /** the agent height in world units */
    walkableHeight: number;

    /** the agent radius in world units */
    walkableRadius: number;

    /** the agent maximum traversable ledge. Up/Down in world units */
    walkableClimb: number;
};

export enum CreateNavMeshTileStatus {
    EMPTY_VERTS = 0,
    EMPTY_POLYS = 1,
    SUCCESS = 2,
}

export type CreateNavMeshTileResult = {
    success: boolean;
    status: CreateNavMeshTileStatus;
    tile: NavMeshTile | undefined;
};

export const createNavMeshTile = (params: NavMeshTileParams): CreateNavMeshTileResult => {
    if (params.polyMesh.vertices.length <= 0) {
        return {
            success: false,
            status: CreateNavMeshTileStatus.EMPTY_VERTS,
            tile: undefined,
        };
    }

    if (params.polyMesh.polys.length <= 0) {
        return {
            success: false,
            status: CreateNavMeshTileStatus.EMPTY_POLYS,
            tile: undefined,
        };
    }

    const nvp = params.polyMesh.maxVerticesPerPoly;

    const nVertices = params.polyMesh.vertices.length / 3;
    const nPolys = params.polyMesh.polys.length / nvp;

    const tile: NavMeshTile = {
        id: 0,
        tileX: params.tileX,
        tileY: params.tileY,
        tileLayer: params.tileLayer,
        bounds: structuredClone(params.bounds),
        vertices: [],
        detailMeshes: [],
        detailVertices: [],
        detailTriangles: [],
        polys: [],
        bvTree: null,
        cellSize: params.cellSize,
        cellHeight: params.cellHeight,
        walkableClimb: params.walkableClimb,
        walkableHeight: params.walkableHeight,
        walkableRadius: params.walkableRadius,
    };

    const cellSize = params.cellSize;
    const cellHeight = params.cellHeight;

    // store vertices, transforming to world space
    for (let i = 0; i < nVertices; i++) {
        const vertexIndex = i * 3;
        tile.vertices.push(
            params.bounds[0][0] + params.polyMesh.vertices[vertexIndex] * cellSize,
            params.bounds[0][1] + params.polyMesh.vertices[vertexIndex + 1] * cellHeight,
            params.bounds[0][2] + params.polyMesh.vertices[vertexIndex + 2] * cellSize,
        );
    }


    // create polys from input data
    for (let i = 0; i < nPolys; i++) {
        const poly: NavMeshPoly = {
            type: NodeType.GROUND_POLY,
            vertices: [],
            neis: [],
            flags: params.polyMesh.polyFlags[i],
            area: params.polyMesh.polyAreas[i],
        };

        // extract polygon data for this polygon
        const polyStart = i * nvp;
        const vertIndices = params.polyMesh.polys.slice(polyStart, polyStart + nvp);
        const neiData = params.polyMesh.neis.slice(polyStart, polyStart + nvp);

        // build vertex indices and neighbor data
        for (let j = 0; j < nvp; j++) {
            const vertIndex = vertIndices[j];
            if (vertIndex === MESH_NULL_IDX) break;

            poly.vertices.push(vertIndex);

            const neiValue = neiData[j];

            if (neiValue & POLY_NEIS_FLAG_EXT_LINK) {
                // border or portal edge
                const dir = neiValue & 0xf;
                if (dir === 0xf) {
                    poly.neis.push(0);
                } else if (dir === 0) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 4); // Portal x-
                } else if (dir === 1) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 2); // Portal z+
                } else if (dir === 2) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 0); // Portal x+
                } else if (dir === 3) {
                    poly.neis.push(POLY_NEIS_FLAG_EXT_LINK | 6); // Portal z-
                } else {
                    // TODO: how to handle this case?
                    poly.neis.push(0);
                }
            } else {
                // normal internal connection (add 1 to convert from 0-based to 1-based indexing)
                poly.neis.push(neiValue + 1);
            }
        }

        tile.polys.push(poly);
    }

    // build bv tree if requested
    if (params.buildBvTree) {
        buildNavMeshBvTree(tile);
    }

    if (!params.detailMesh) {
        // create detail triangles if not provided
        createDetailMeshFromPolys(tile);
    } else {
        // Store detail meshes and vertices.
        // The nav polygon vertices are stored as the first vertices on each mesh.
        // We compress the mesh data by skipping them and using the navmesh coordinates.
        let vbase = 0;

        for (let i = 0; i < nPolys; i++) {
            const poly = tile.polys[i];
            const nPolyVertices = poly.vertices.length;
            const nDetailVertices = params.detailMesh.detailMeshes[i * 4 + 1];
            const nAdditionalDetailVertices = nDetailVertices - nPolyVertices;
            const trianglesBase = params.detailMesh.detailMeshes[i * 4 + 2];
            const trianglesCount = params.detailMesh.detailMeshes[i * 4 + 3];

            const detailMesh: NavMeshPolyDetail = {
                verticesBase: vbase,
                verticesCount: nAdditionalDetailVertices,
                trianglesBase: trianglesBase,
                trianglesCount: trianglesCount,
            };

            tile.detailMeshes[i] = detailMesh;

            if (nDetailVertices - nPolyVertices > 0) {
                for (let j = nPolyVertices; j < nDetailVertices; j++) {
                    const detailVertIndex = (vbase + j) * 3;
                    tile.detailVertices.push(
                        params.detailMesh.detailVertices[detailVertIndex],
                        params.detailMesh.detailVertices[detailVertIndex + 1],
                        params.detailMesh.detailVertices[detailVertIndex + 2],
                    );
                }

                vbase += params.polyMesh.maxVerticesPerPoly - nPolyVertices;
            }
        }

        // store triangles
        tile.detailTriangles = params.detailMesh.detailTriangles;
    }

    return {
        success: true,
        status: CreateNavMeshTileStatus.SUCCESS,
        tile: tile,
    };
};

const createDetailMeshFromPolys = (tile: NavMeshTile) => {
    const detailTriangles: number[] = [];
    const detailMeshes: NavMeshPolyDetail[] = [];

    let tbase = 0;

    for (const polyId in tile.polys) {
        const poly = tile.polys[polyId];
        const nv = poly.vertices.length;

        // Create detail mesh descriptor for this polygon
        const detailMesh: NavMeshPolyDetail = {
            verticesBase: 0, // No additional detail vertices when triangulating from polys
            verticesCount: 0, // No additional detail vertices when triangulating from polys
            trianglesBase: tbase, // Starting triangle index
            trianglesCount: nv - 2, // Number of triangles in fan triangulation
        };

        detailMeshes[polyId] = detailMesh;

        // Triangulate polygon using fan triangulation (local indices within the polygon)
        for (let j = 2; j < nv; j++) {
            // Create triangle using vertex 0 and two consecutive vertices
            detailTriangles.push(0); // first vertex (local index)
            detailTriangles.push(j - 1); // previous vertex (local index)
            detailTriangles.push(j); // current vertex (local index)

            // Edge flags - bit for each edge that belongs to poly boundary
            let edgeFlags = 1 << 2; // edge 2 is always a polygon boundary
            if (j === 2) edgeFlags |= 1 << 0; // first triangle, edge 0 is boundary
            if (j === nv - 1) edgeFlags |= 1 << 4; // last triangle, edge 1 is boundary

            detailTriangles.push(edgeFlags);
            tbase++;
        }
    }

    tile.detailMeshes = detailMeshes;
    tile.detailTriangles = detailTriangles;
    // No additional detail vertices needed when triangulating from polygon vertices
    tile.detailVertices = [];
};
