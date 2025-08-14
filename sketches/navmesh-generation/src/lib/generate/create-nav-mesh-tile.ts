import type { Box3 } from '@/common/maaths';
import type { NavMeshTile, NavMeshPolyDetail, NavMeshPoly } from '../query';
import { MESH_NULL_IDX } from './common';
import { buildNavMeshBvTree } from '../query/nav-mesh-bv-tree';
import type { PolyMesh } from './poly-mesh';
import { buildPolyNeighbours } from './poly-neighbours';

export type NavMeshTilePolys = {
    /** the nav mesh polygon vertices in world space, [x1, y1, z1, ...] */
    vertices: number[];

    /** the nav mesh polygons */
    polys: NavMeshPoly[];

    /** max vertices per poly */
    maxVerticesPerPoly: number;
}

export const polyMeshToNavMeshTilePolys = (polyMesh: PolyMesh): NavMeshTilePolys => {
    const nVertices = polyMesh.vertices.length / 3;
    const vertices: number[] = [];

    // get vertices
    for (let i = 0; i < nVertices; i++) {
        const vertexIndex = i * 3;
        vertices.push(
            polyMesh.vertices[vertexIndex],
            polyMesh.vertices[vertexIndex + 1],
            polyMesh.vertices[vertexIndex + 2],
        );
    }

    const nvp = polyMesh.maxVerticesPerPoly;
    const nPolys = polyMesh.vertices.length / nvp;

    const polys: NavMeshPoly[] = [];

    // create polys from input data
    for (let i = 0; i < nPolys; i++) {
        const poly: NavMeshPoly = {
            vertices: [],
            neis: [],
            flags: polyMesh.flags[i],
            area: polyMesh.areas[i],
        };

        // extract polygon data for this polygon
        const polyStart = i * nvp;
        const vertIndices = polyMesh.polys.slice(polyStart, polyStart + nvp);

        // build vertex indices and neighbor data
        for (let j = 0; j < nvp; j++) {
            const vertIndex = vertIndices[j];
            if (vertIndex === MESH_NULL_IDX) break;

            poly.vertices.push(vertIndex);
        }

        polys.push(poly);
    }

    // build poly neighbours information
    buildPolyNeighbours(polys, vertices, polyMesh.borderSize, 0, 0, polyMesh.localWidth, polyMesh.localHeight);

    // convert vertices to world space
    // we do this after buildPolyNeighbours so that neighbour calculation can be done with quantized values
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i] = polyMesh.bounds[0][0] + vertices[i] * polyMesh.cellSize;
        vertices[i + 1] = polyMesh.bounds[0][1] + vertices[i + 1] * polyMesh.cellHeight;
        vertices[i + 2] = polyMesh.bounds[0][2] + vertices[i + 2] * polyMesh.cellSize;
    }

    return {
        vertices,
        polys,
        maxVerticesPerPoly: nvp,
    };   
}

/**
 * Builds NavMeshTile polys from given polygons. Use this method when you are creating a nav mesh tile from external polygon data.
 * 
 * Use @see polyMeshToNavMeshTilePolys if you need to convert a PolyMesh to NavMeshTile NavMeshPoly's.
 * 
 * Computes poly neighbours used for internal polygon edge neighbour linking, and finds portal edges used for nav mesh tile stitching. 
 * @param polygons polygons
 * @param vertices polygon vertices in world space
 * @param maxVerticesPerPoly the maximum number of vertices per poly
 * @param borderSize the border size. if above 0, portal edges will be marked
 * @param bounds the bounds of the polygon vertices
 * @returns NavMeshTile polygons
 */
export const polygonsToNavMeshTilePolys = (polygons: Array<Omit<NavMeshPoly, "neis">>, vertices: number[], maxVerticesPerPoly: number, borderSize: number, bounds: Box3): NavMeshTilePolys => {
    const polys: NavMeshPoly[] = [];

    for (const poly of polygons) {
        polys.push({
            vertices: poly.vertices,
            neis: [],
            flags: poly.flags,
            area: poly.area,
        });
    }

    const minX = bounds[0][0];
    const minZ = bounds[0][2];
    const maxX = bounds[1][0];
    const maxZ = bounds[1][2];

    buildPolyNeighbours(polys, vertices, borderSize, minX, maxX, minZ, maxZ);

    return {
        vertices,
        polys,
        maxVerticesPerPoly
    };
}

/** the source data used to create a navigation mesh tile */
export type NavMeshTileParams = {
    /** the nav mesh polygon vertices in world space, [x1, y1, z1, ...] */
    vertices: number[];

    /** the nav mesh polygons */
    polys: NavMeshPoly[];

    /** the maximum number of vertices per poly */
    maxVerticesPerPoly: number;

    /** (optional) height detail attributes */
    detailMesh?: {
        /** the detail mesh sub-mesh data */
        detailMeshes: number[];

        /** the detail mesh vertices, [x1, y1, z1, ...] */
        detailVertices: number[];

        /** the detail mesh triangles, [a1, b1, c1, a2, b2, c2, ...] */
        detailTriangles: number[];
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

    /** 
     * The xz-plane cell size.
     * If the tile was generated with voxelization, it should be the voxel cell size.
     * If the tile was created with a different method, use a value that approximates the level of precision required for the tile.
     */
    cellSize: number;

    /** 
     * The y-axis cell size.
     * If the tile was generated with voxelization, it should be the voxel cell size.
     * If the tile was created with a different method, use a value that approximates the level of precision required for the tile.
     */
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
    if (params.vertices.length <= 0) {
        return {
            success: false,
            status: CreateNavMeshTileStatus.EMPTY_VERTS,
            tile: undefined,
        };
    }

    if (params.polys.length <= 0) {
        return {
            success: false,
            status: CreateNavMeshTileStatus.EMPTY_POLYS,
            tile: undefined,
        };
    }

    const tile: NavMeshTile = {
        id: -1,
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

    // store vertices
    tile.vertices = structuredClone(params.vertices);

    // store polys
    tile.polys = structuredClone(params.polys);

    // build bv tree if requested
    if (params.buildBvTree) {
        buildNavMeshBvTree(tile);
    }

    if (!params.detailMesh) {
        // create detail triangles if not provided
        createDetailMeshFromPolys(tile);
    } else {
        // store detail meshes and vertices.
        // the nav polygon vertices are stored as the first vertices on each mesh.
        // we compress the mesh data by skipping them and using the navmesh coordinates.
        let vbase = 0;

        for (let i = 0; i < tile.polys.length; i++) {
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

                vbase += params.maxVerticesPerPoly - nPolyVertices;
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

        // create detail mesh descriptor for this polygon
        const detailMesh: NavMeshPolyDetail = {
            verticesBase: 0, // no additional detail vertices when triangulating from polys
            verticesCount: 0, // no additional detail vertices when triangulating from polys
            trianglesBase: tbase, // starting triangle index
            trianglesCount: nv - 2, // number of triangles in fan triangulation
        };

        detailMeshes[polyId] = detailMesh;

        // triangulate polygon using fan triangulation (local indices within the polygon)
        for (let j = 2; j < nv; j++) {
            // create triangle using vertex 0 and two consecutive vertices
            detailTriangles.push(0); // first vertex (local index)
            detailTriangles.push(j - 1); // previous vertex (local index)
            detailTriangles.push(j); // current vertex (local index)

            // edge flags - bit for each edge that belongs to poly boundary
            let edgeFlags = 1 << 2; // edge 2 is always a polygon boundary
            if (j === 2) edgeFlags |= 1 << 0; // first triangle, edge 0 is boundary
            if (j === nv - 1) edgeFlags |= 1 << 4; // last triangle, edge 1 is boundary

            detailTriangles.push(edgeFlags);
            tbase++;
        }
    }

    tile.detailMeshes = detailMeshes;
    tile.detailTriangles = detailTriangles;
    
    // no additional detail vertices needed when triangulating from polygon vertices
    tile.detailVertices = [];
};
