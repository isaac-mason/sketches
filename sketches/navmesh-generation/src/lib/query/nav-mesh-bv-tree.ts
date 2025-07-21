import type { Box3, Vec3 } from '@/common/maaths';
import type { NavMeshTile, NavMeshBvNode } from "./nav-mesh";

const compareItemX = (a: NavMeshBvNode, b: NavMeshBvNode): number => {
    if (a.bounds[0][0] < b.bounds[0][0]) return -1;
    if (a.bounds[0][0] > b.bounds[0][0]) return 1;
    return 0;
};

const compareItemY = (a: NavMeshBvNode, b: NavMeshBvNode): number => {
    if (a.bounds[0][1] < b.bounds[0][1]) return -1;
    if (a.bounds[0][1] > b.bounds[0][1]) return 1;
    return 0;
};

const compareItemZ = (a: NavMeshBvNode, b: NavMeshBvNode): number => {
    if (a.bounds[0][2] < b.bounds[0][2]) return -1;
    if (a.bounds[0][2] > b.bounds[0][2]) return 1;
    return 0;
};

const calcExtends = (items: NavMeshBvNode[], imin: number, imax: number): Box3 => {
    const bounds: Box3 = [
        [items[imin].bounds[0][0], items[imin].bounds[0][1], items[imin].bounds[0][2]],
        [items[imin].bounds[1][0], items[imin].bounds[1][1], items[imin].bounds[1][2]]
    ];
    
    for (let i = imin + 1; i < imax; ++i) {
        const it = items[i];
        if (it.bounds[0][0] < bounds[0][0]) bounds[0][0] = it.bounds[0][0];
        if (it.bounds[0][1] < bounds[0][1]) bounds[0][1] = it.bounds[0][1];
        if (it.bounds[0][2] < bounds[0][2]) bounds[0][2] = it.bounds[0][2];
        
        if (it.bounds[1][0] > bounds[1][0]) bounds[1][0] = it.bounds[1][0];
        if (it.bounds[1][1] > bounds[1][1]) bounds[1][1] = it.bounds[1][1];
        if (it.bounds[1][2] > bounds[1][2]) bounds[1][2] = it.bounds[1][2];
    }
    
    return bounds;
};

const longestAxis = (x: number, y: number, z: number): number => {
    let axis = 0;
    let maxVal = x;
    if (y > maxVal) {
        axis = 1;
        maxVal = y;
    }
    if (z > maxVal) {
        axis = 2;
    }
    return axis;
};

const subdivide = (items: NavMeshBvNode[], imin: number, imax: number, curNode: { value: number }, nodes: NavMeshBvNode[]): void => {
    const inum = imax - imin;
    const icur = curNode.value;
    
    const node: NavMeshBvNode = {
        bounds: [
            [0, 0, 0],
            [0, 0, 0]
        ],
        i: 0
    };
    nodes[curNode.value++] = node;
    
    if (inum === 1) {
        // Leaf
        node.bounds[0][0] = items[imin].bounds[0][0];
        node.bounds[0][1] = items[imin].bounds[0][1];
        node.bounds[0][2] = items[imin].bounds[0][2];
        
        node.bounds[1][0] = items[imin].bounds[1][0];
        node.bounds[1][1] = items[imin].bounds[1][1];
        node.bounds[1][2] = items[imin].bounds[1][2];
        
        node.i = items[imin].i;
    } else {
        // Split
        const extents = calcExtends(items, imin, imax);
        node.bounds[0][0] = extents[0][0];
        node.bounds[0][1] = extents[0][1];
        node.bounds[0][2] = extents[0][2];
        node.bounds[1][0] = extents[1][0];
        node.bounds[1][1] = extents[1][1];
        node.bounds[1][2] = extents[1][2];
        
        const axis = longestAxis(
            node.bounds[1][0] - node.bounds[0][0],
            node.bounds[1][1] - node.bounds[0][1],
            node.bounds[1][2] - node.bounds[0][2]
        );
        
        if (axis === 0) {
            // Sort along x-axis
            const segment = items.slice(imin, imax);
            segment.sort(compareItemX);
            for (let i = 0; i < segment.length; i++) {
                items[imin + i] = segment[i];
            }
        } else if (axis === 1) {
            // Sort along y-axis
            const segment = items.slice(imin, imax);
            segment.sort(compareItemY);
            for (let i = 0; i < segment.length; i++) {
                items[imin + i] = segment[i];
            }
        } else {
            // Sort along z-axis
            const segment = items.slice(imin, imax);
            segment.sort(compareItemZ);
            for (let i = 0; i < segment.length; i++) {
                items[imin + i] = segment[i];
            }
        }
        
        const isplit = imin + Math.floor(inum / 2);
        
        // Left
        subdivide(items, imin, isplit, curNode, nodes);
        // Right
        subdivide(items, isplit, imax, curNode, nodes);
        
        const iescape = curNode.value - icur;
        // Negative index means escape.
        node.i = -iescape;
    }
};

/**
 * Builds a bounding volume tree for the given nav mesh tile.
 * @param navMeshTile the nav mesh tile to build the BV tree for
 * @returns 
 */
export const buildNavMeshBvTree = (navMeshTile: NavMeshTile): void => {
    // Build tree
    const quantFactor = 1 / navMeshTile.cellSize;
    const items: NavMeshBvNode[] = new Array(navMeshTile.polys.length);
    
    // Calculate bounds for each polygon
    for (let i = 0; i < navMeshTile.polys.length; i++) {
        const item: NavMeshBvNode = {
            bounds: [
                [0, 0, 0],
                [0, 0, 0]
            ],
            i: i
        };
        
        // Use detail meshes if available, otherwise use polygon vertices
        if (navMeshTile.detailMeshes.length > 0 && navMeshTile.detailVertices.length > 0) {
            // Use detail mesh vertices for more accurate bounds
            const detailMesh = navMeshTile.detailMeshes[i];
            const vb = detailMesh.verticesBase;
            const ndv = detailMesh.verticesCount;
            
            if (ndv > 0) {
                // Get first detail vertex
                const firstVertIndex = vb * 3;
                const bmin: Vec3 = [
                    navMeshTile.detailVertices[firstVertIndex],
                    navMeshTile.detailVertices[firstVertIndex + 1],
                    navMeshTile.detailVertices[firstVertIndex + 2]
                ];
                const bmax: Vec3 = [
                    navMeshTile.detailVertices[firstVertIndex],
                    navMeshTile.detailVertices[firstVertIndex + 1],
                    navMeshTile.detailVertices[firstVertIndex + 2]
                ];
                
                // Find min/max across all detail vertices
                for (let j = 1; j < ndv; j++) {
                    const vertIndex = (vb + j) * 3;
                    const x = navMeshTile.detailVertices[vertIndex];
                    const y = navMeshTile.detailVertices[vertIndex + 1];
                    const z = navMeshTile.detailVertices[vertIndex + 2];
                    
                    if (x < bmin[0]) bmin[0] = x;
                    if (y < bmin[1]) bmin[1] = y;
                    if (z < bmin[2]) bmin[2] = z;
                    
                    if (x > bmax[0]) bmax[0] = x;
                    if (y > bmax[1]) bmax[1] = y;
                    if (z > bmax[2]) bmax[2] = z;
                }
                
                // BV-tree uses cellSize for all dimensions, quantize relative to tile bounds
                item.bounds[0][0] = (bmin[0] - navMeshTile.bounds[0][0]) * quantFactor;
                item.bounds[0][1] = (bmin[1] - navMeshTile.bounds[0][1]) * quantFactor;
                item.bounds[0][2] = (bmin[2] - navMeshTile.bounds[0][2]) * quantFactor;
                
                item.bounds[1][0] = (bmax[0] - navMeshTile.bounds[0][0]) * quantFactor;
                item.bounds[1][1] = (bmax[1] - navMeshTile.bounds[0][1]) * quantFactor;
                item.bounds[1][2] = (bmax[2] - navMeshTile.bounds[0][2]) * quantFactor;
            }
        } else {
            // Use polygon vertices
            const poly = navMeshTile.polys[i];
            const nvp = poly.vertices.length;
            
            if (nvp > 0) {
                // Get first vertex
                const firstVertIndex = poly.vertices[0] * 3;
                const bmin: Vec3 = [
                    navMeshTile.vertices[firstVertIndex],
                    navMeshTile.vertices[firstVertIndex + 1],
                    navMeshTile.vertices[firstVertIndex + 2]
                ];
                const bmax: Vec3 = [
                    navMeshTile.vertices[firstVertIndex],
                    navMeshTile.vertices[firstVertIndex + 1],
                    navMeshTile.vertices[firstVertIndex + 2]
                ];
                
                // Find min/max across all polygon vertices
                for (let j = 1; j < nvp; j++) {
                    const vertIndex = poly.vertices[j] * 3;
                    const x = navMeshTile.vertices[vertIndex];
                    const y = navMeshTile.vertices[vertIndex + 1];
                    const z = navMeshTile.vertices[vertIndex + 2];
                    
                    if (x < bmin[0]) bmin[0] = x;
                    if (y < bmin[1]) bmin[1] = y;
                    if (z < bmin[2]) bmin[2] = z;
                    
                    if (x > bmax[0]) bmax[0] = x;
                    if (y > bmax[1]) bmax[1] = y;
                    if (z > bmax[2]) bmax[2] = z;
                }
                
                // Remap y coordinate using cellHeight to cellSize ratio
                bmin[1] = Math.floor(bmin[1] * navMeshTile.cellHeight / navMeshTile.cellSize);
                bmax[1] = Math.ceil(bmax[1] * navMeshTile.cellHeight / navMeshTile.cellSize);
                
                // Quantize bounds
                item.bounds[0][0] = bmin[0];
                item.bounds[0][1] = bmin[1];
                item.bounds[0][2] = bmin[2];
                
                item.bounds[1][0] = bmax[0];
                item.bounds[1][1] = bmax[1];
                item.bounds[1][2] = bmax[2];
            }
        }
        
        items[i] = item;
    }
    
    const curNode = { value: 0 };
    const nodes: NavMeshBvNode[] = new Array(navMeshTile.polys.length * 2);
    
    subdivide(items, 0, navMeshTile.polys.length, curNode, nodes);
    
    // Trim the nodes array to actual size
    const trimmedNodes = nodes.slice(0, curNode.value);
    
    navMeshTile.bvTree = {
        nodes: trimmedNodes,
        quantFactor: quantFactor
    };
};
