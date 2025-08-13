import type { Box3 } from "@/common/maaths";
import type { PolyMesh } from "./poly-mesh";
import { buildMeshAdjacency, findPortalEdges } from "./poly-mesh";
import type { PolyMeshDetail } from "./poly-mesh-detail";
import { MESH_NULL_IDX } from "./common";

export const createPolyMeshesFromTriangleMesh = (
    positions: number[],
    indices: number[],
    regions?: number[],
    flags?: number[],
    areas?: number[],
    bounds?: Box3,
): {
    polyMesh: PolyMesh;
    polyMeshDetail: PolyMeshDetail;
} => {
    const numVertices = positions.length / 3;
    const numTriangles = indices.length / 3;
    
    if (numTriangles === 0) {
        const emptyMesh: PolyMesh = {
            vertices: [],
            polys: [],
            regions: [],
            flags: [],
            areas: [],
            nVertices: 0,
            nPolys: 0,
            maxVerticesPerPoly: 3,
            bounds: bounds || [
                [0, 0, 0],
                [0, 0, 0]
            ],
            cellSize: -1,
            cellHeight: -1,
            borderSize: -1,
            maxEdgeError: -1,
        };
        
        const emptyDetail: PolyMeshDetail = {
            meshes: [],
            vertices: [],
            triangles: [],
            nMeshes: 0,
            nVertices: 0,
            nTriangles: 0,
        };
        
        return { polyMesh: emptyMesh, polyMeshDetail: emptyDetail };
    }
    
    // Calculate bounds if not provided
    let meshBounds: Box3;
    if (bounds) {
        meshBounds = structuredClone(bounds);
    } else {
        meshBounds = [
            [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE],
            [-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE]
        ];
        
        for (let i = 0; i < numVertices; i++) {
            const x = positions[i * 3];
            const y = positions[i * 3 + 1];
            const z = positions[i * 3 + 2];
            
            meshBounds[0][0] = Math.min(meshBounds[0][0], x);
            meshBounds[0][1] = Math.min(meshBounds[0][1], y);
            meshBounds[0][2] = Math.min(meshBounds[0][2], z);
            meshBounds[1][0] = Math.max(meshBounds[1][0], x);
            meshBounds[1][1] = Math.max(meshBounds[1][1], y);
            meshBounds[1][2] = Math.max(meshBounds[1][2], z);
        }
    }
    
    // Create PolyMesh with triangular polygons (one per triangle)
    const maxVerticesPerPoly = 3;
    
    const polyMesh: PolyMesh = {
        vertices: new Array(numVertices * 3),
        polys: new Array(numTriangles * maxVerticesPerPoly * 2).fill(MESH_NULL_IDX),
        regions: new Array(numTriangles),
        flags: new Array(numTriangles),
        areas: new Array(numTriangles),
        nVertices: numVertices,
        nPolys: numTriangles,
        maxVerticesPerPoly,
        bounds: meshBounds,
        cellSize: -1,
        cellHeight: -1,
        borderSize: -1,
        maxEdgeError: -1,
    };
    
    // Copy vertices
    for (let i = 0; i < numVertices * 3; i++) {
        polyMesh.vertices[i] = positions[i];
    }
    
    // Create polygons from triangles
    for (let i = 0; i < numTriangles; i++) {
        const polyStart = i * maxVerticesPerPoly * 2;
        
        // Set triangle vertices
        polyMesh.polys[polyStart] = indices[i * 3];
        polyMesh.polys[polyStart + 1] = indices[i * 3 + 1];
        polyMesh.polys[polyStart + 2] = indices[i * 3 + 2];
        
        // Set polygon attributes
        polyMesh.regions[i] = regions ? regions[i] : 0;
        polyMesh.flags[i] = flags ? flags[i] : 0;
        polyMesh.areas[i] = areas ? areas[i] : 0;
    }
    
    // Build mesh adjacency (only post-processing allowed)
    buildMeshAdjacency(
        polyMesh.polys,
        polyMesh.nPolys,
        polyMesh.nVertices,
        maxVerticesPerPoly,
    );
    
    // // Find portal edges if boundary parameters are provided
    // if (width !== undefined && height !== undefined && borderSize !== undefined && borderSize > 0) {
    //     findPortalEdges(polyMesh, width, height);
    // }
    
    // Create PolyMeshDetail with one submesh per triangle
    const polyMeshDetail: PolyMeshDetail = {
        meshes: new Array(numTriangles * 4),
        vertices: new Array(numVertices * 3),
        triangles: new Array(numTriangles * 4),
        nMeshes: numTriangles,
        nVertices: numVertices,
        nTriangles: numTriangles,
    };
    
    // Copy vertices to detail mesh
    for (let i = 0; i < numVertices * 3; i++) {
        polyMeshDetail.vertices[i] = positions[i];
    }
    
    // Create one submesh and one triangle per input triangle
    for (let i = 0; i < numTriangles; i++) {
        // Set up submesh - each triangle gets its own submesh
        const meshStart = i * 4;
        polyMeshDetail.meshes[meshStart] = indices[i * 3]; // vertex start (first vertex of triangle)
        polyMeshDetail.meshes[meshStart + 1] = 3; // vertex count (always 3 for triangle)
        polyMeshDetail.meshes[meshStart + 2] = i; // triangle start (this triangle)
        polyMeshDetail.meshes[meshStart + 3] = 1; // triangle count (always 1)
        
        // Create triangle
        const triStart = i * 4;
        polyMeshDetail.triangles[triStart] = indices[i * 3];
        polyMeshDetail.triangles[triStart + 1] = indices[i * 3 + 1];
        polyMeshDetail.triangles[triStart + 2] = indices[i * 3 + 2];
        polyMeshDetail.triangles[triStart + 3] = 0; // No flags - no boundary information available
    }
    
    return { polyMesh, polyMeshDetail };
}