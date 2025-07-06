import type { Box3 } from '@/common/maaths';
import { ContourSet } from './contour-set';
import { CompactHeightfield } from './compact-heightfield';

/**
 * Represents a polygon mesh suitable for use in building a navigation mesh.
 */
export type PolyMesh = {
    /** The mesh vertices. Form: (x, y, z) * nverts */
    vertices: number[];
    /** Polygon and neighbor data. Length: maxpolys * 2 * nvp */
    polys: number[];
    /** The region id assigned to each polygon. Length: maxpolys */
    regs: number[];
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
    cs: number;
    /** The height of each cell. (The minimum increment along the y-axis.) */
    ch: number;
    /** The AABB border size used to generate the source data from which the mesh was derived */
    borderSize: number;
    /** The max error of the polygon edges in the mesh */
    maxEdgeError: number;
};

/**
 * Contains triangle meshes that represent detailed height data associated
 * with the polygons in its associated polygon mesh object.
 */
export type PolyMeshDetail = {
    /** The sub-mesh data. Size: 4*nMeshes */
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

export const buildPolyMesh = (
    contourSet: ContourSet,
    maxVerticesPerPoly: number,   
): PolyMesh => {

}

export const buildPolyMeshDetail = (
    polyMesh: PolyMesh,
    compactHeightfield: CompactHeightfield,
    sampleDist: number,
    sampleMaxError: number,
): PolyMeshDetail => {

}