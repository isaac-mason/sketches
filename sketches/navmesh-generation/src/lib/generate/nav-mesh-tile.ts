import type { Box3 } from '@/common/maaths';
import type { NavMeshPoly, NavMeshPolyDetail, NavMeshTile } from '../query';
import { MESH_NULL_IDX } from './common';
import type { PolyMesh } from './poly-mesh';
import type { PolyMeshDetail } from './poly-mesh-detail';
import { buildPolyNeighbours } from './poly-neighbours';

export type NavMeshTilePolys = Pick<NavMeshTile, 'vertices' | 'polys'>;

export const polyMeshToTilePolys = (polyMesh: PolyMesh): NavMeshTilePolys => {
    // copy polyMesh local space vertices
    const vertices: number[] = structuredClone(polyMesh.vertices);

    // create polys from input PolyMesh
    const nvp = polyMesh.maxVerticesPerPoly;
    const nPolys = polyMesh.vertices.length / nvp;

    const polys: NavMeshPoly[] = [];

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
    };
};

/**
 * Builds NavMeshTile polys from given polygons. Use this method when you are creating a nav mesh tile from external polygon data.
 *
 * Use @see polyMeshToTilePolys if you need to convert a PolyMesh to NavMeshTile NavMeshPoly's.
 *
 * Computes poly neighbours used for internal polygon edge neighbour linking, and finds portal edges used for nav mesh tile stitching.
 * @param polygons polygons
 * @param vertices polygon vertices in world space
 * @param maxVerticesPerPoly the maximum number of vertices per poly
 * @param borderSize the border size. if above 0, portal edges will be marked
 * @param bounds the bounds of the polygon vertices
 * @returns NavMeshTile polygons
 */
export const polygonsToNavMeshTilePolys = (
    polygons: Array<Omit<NavMeshPoly, 'neis'>>,
    vertices: number[],
    borderSize: number,
    bounds: Box3,
): NavMeshTilePolys => {
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
    };
};

export type NavMeshTileDetailMesh = Pick<NavMeshTile, 'detailMeshes' | 'detailVertices' | 'detailTriangles'>;

/**
 * Creates a detail mesh from the given polygon data using fan triangulation.
 * This is less precise than providing a detail mesh, but is acceptable for some use cases where accurate height data is not important.
 * @param polys 
 * @returns 
 */
export const polysToTileDetailMesh = (polys: NavMeshPoly[]): NavMeshTileDetailMesh => {
    const detailTriangles: number[] = [];
    const detailMeshes: NavMeshPolyDetail[] = [];

    let tbase = 0;

    for (const polyId in polys) {
        const poly = polys[polyId];
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

    return {
        detailMeshes,
        detailTriangles,
        detailVertices: [],
    };
};

/**
 * Converts a given PolyMeshDetail to the tile detail mesh format.
 * @param polys 
 * @param maxVerticesPerPoly 
 * @param polyMeshDetail 
 * @returns 
 */
export const polyMeshDetailToTileDetailMesh = (
    polys: NavMeshPoly[],
    maxVerticesPerPoly: number,
    polyMeshDetail: PolyMeshDetail,
) => {
    const detailMeshes: NavMeshPolyDetail[] = [];
    const detailVertices: number[] = [];

    // store detail meshes and vertices.
    // the nav polygon vertices are stored as the first vertices on each mesh.
    // we compress the mesh data by skipping them and using the navmesh coordinates.
    let vbase = 0;

    for (let i = 0; i < polys.length; i++) {
        const poly = polys[i];
        const nPolyVertices = poly.vertices.length;
        const nDetailVertices = polyMeshDetail.meshes[i * 4 + 1];
        const nAdditionalDetailVertices = nDetailVertices - nPolyVertices;
        const trianglesBase = polyMeshDetail.meshes[i * 4 + 2];
        const trianglesCount = polyMeshDetail.meshes[i * 4 + 3];

        const detailMesh: NavMeshPolyDetail = {
            verticesBase: vbase,
            verticesCount: nAdditionalDetailVertices,
            trianglesBase: trianglesBase,
            trianglesCount: trianglesCount,
        };

        detailMeshes[i] = detailMesh;

        if (nDetailVertices - nPolyVertices > 0) {
            for (let j = nPolyVertices; j < nDetailVertices; j++) {
                const detailVertIndex = (vbase + j) * 3;
                detailVertices.push(
                    polyMeshDetail.vertices[detailVertIndex],
                    polyMeshDetail.vertices[detailVertIndex + 1],
                    polyMeshDetail.vertices[detailVertIndex + 2],
                );
            }

            vbase += maxVerticesPerPoly - nPolyVertices;
        }
    }

    return {
        detailMeshes,
        detailVertices,
        detailTriangles: polyMeshDetail.triangles,
    };
};
