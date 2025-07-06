import type { Box3 } from '@/common/maaths';
import type { ContourSet } from './contour-set';
import type { CompactHeightfield } from './compact-heightfield';
import type { PolyMesh } from './poly-mesh';

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

export const buildPolyMeshDetail = (
    polyMesh: PolyMesh,
    compactHeightfield: CompactHeightfield,
    sampleDist: number,
    sampleMaxError: number,
): PolyMeshDetail => {
    
};
