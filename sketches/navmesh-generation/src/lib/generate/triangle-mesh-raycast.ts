import { type Vec3, vec3 } from '@/common/maaths';

/**
 * Represents a ray with origin and direction
 */
export type Ray = {
    origin: Vec3;
    direction: Vec3;
}

/**
 * Result of a ray-triangle intersection
 */
export type RaycastHit = {
    /** Distance along the ray where intersection occurred */
    distance: number;
    /** World position of the intersection point */
    point: Vec3;
    /** Face normal at the intersection point */
    normal: Vec3;
    /** Barycentric coordinates (u, v, w) where w = 1 - u - v */
    barycentric: Vec3;
    /** Index of the triangle that was hit (triangle index, not vertex index) */
    triangleIndex: number;
}

/**
 * Configuration for raycasting
 */
export type RaycastOptions = {
    /** Maximum distance to check for intersections. Default: Number.POSITIVE_INFINITY */
    maxDistance?: number;
    /** Whether to cull back-facing triangles. Default: true */
    cullBackFace?: boolean;
    /** Minimum distance to avoid self-intersection. Default: 0.0001 */
    minDistance?: number;
}

// Temporary vectors for raycast calculations
const _edge1 = vec3.create();
const _edge2 = vec3.create();
const _h = vec3.create();
const _s = vec3.create();
const _q = vec3.create();
const _point = vec3.create();
const _normal = vec3.create();
const _extent = vec3.create();
const _v0 = vec3.create();
const _v1 = vec3.create();
const _v2 = vec3.create();
const _min = vec3.create();
const _max = vec3.create();

/**
 * Ray-triangle intersection using Möller-Trumbore algorithm
 * @param ray The ray to test
 * @param v0 First vertex of the triangle
 * @param v1 Second vertex of the triangle
 * @param v2 Third vertex of the triangle
 * @param options Raycast options
 * @returns Hit result or null if no intersection
 */
export const rayTriangleIntersection = (
    out: RaycastHit,
    ray: Ray,
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
    options: RaycastOptions = {}
): RaycastHit | null => {
    const { maxDistance = Number.POSITIVE_INFINITY, cullBackFace = true, minDistance = 0.0001 } = options;

    // Calculate edges
    vec3.subtract(_edge1, v1, v0);
    vec3.subtract(_edge2, v2, v0);

    // Calculate h = direction × edge2
    vec3.cross(_h, ray.direction, _edge2);

    // Calculate determinant
    const a = vec3.dot(_edge1, _h);

    // Check if ray is parallel to triangle
    if (a > -0.00001 && a < 0.00001) {
        return null;
    }

    // Cull back-facing triangles if enabled
    if (cullBackFace && a < 0) {
        return null;
    }

    const f = 1.0 / a;

    // Calculate s = origin - v0
    vec3.subtract(_s, ray.origin, v0);

    // Calculate u parameter
    const u = f * vec3.dot(_s, _h);

    // Check if intersection is outside triangle
    if (u < 0.0 || u > 1.0) {
        return null;
    }

    // Calculate q = s × edge1
    vec3.cross(_q, _s, _edge1);

    // Calculate v parameter
    const v = f * vec3.dot(ray.direction, _q);

    // Check if intersection is outside triangle
    if (v < 0.0 || u + v > 1.0) {
        return null;
    }

    // Calculate t (distance along ray)
    const t = f * vec3.dot(_edge2, _q);

    // Check if intersection is within valid distance range
    if (t < minDistance || t > maxDistance) {
        return null;
    }

    // Calculate intersection point
    vec3.scaleAndAdd(_point, ray.origin, ray.direction, t);

    // Calculate normal
    vec3.cross(_normal, _edge1, _edge2);
    vec3.normalize(_normal, _normal);

    // Calculate barycentric coordinates
    const w = 1.0 - u - v;
    const barycentric: Vec3 = [u, v, w];

    out.distance = t;
    vec3.copy(out.point, _point);
    vec3.copy(out.normal, _normal);
    vec3.copy(out.barycentric, barycentric);
    out.triangleIndex = -1;

    return out;
}

/**
 * Get a point along a ray at a given distance
 * @param out Output vector to store the result
 * @param ray The ray
 * @param distance Distance along the ray
 * @returns The output vector for chaining
 */
export const getPointOnRay = (out: Vec3, ray: Ray, distance: number): Vec3 => {
    vec3.scaleAndAdd(out, ray.origin, ray.direction, distance);
    return out;
}

/**
 * Axis-Aligned Bounding Box
 */
export type AABB = {
    min: Vec3;
    max: Vec3;
}

/**
 * Test ray intersection with axis-aligned bounding box
 */
export const rayAABBIntersection = (ray: Ray, aabb: AABB, maxDistance: number): boolean => {
    let tmin = 0;
    let tmax = maxDistance;

    for (let i = 0; i < 3; i++) {
        if (Math.abs(ray.direction[i]) < 1e-8) {
            // Ray is parallel to slab
            if (ray.origin[i] < aabb.min[i] || ray.origin[i] > aabb.max[i]) {
                return false;
            }
        } else {
            const invDir = 1.0 / ray.direction[i];
            let t0 = (aabb.min[i] - ray.origin[i]) * invDir;
            let t1 = (aabb.max[i] - ray.origin[i]) * invDir;

            if (invDir < 0) {
                [t0, t1] = [t1, t0];
            }

            tmin = Math.max(tmin, t0);
            tmax = Math.min(tmax, t1);

            if (tmin > tmax) {
                return false;
            }
        }
    }

    return tmax >= 0;
}

// ============================================================================
// Triangle Mesh Raycasting - Optimized for Nav Mesh Generation
// ============================================================================

/**
 * Triangle with precomputed spatial data - optimized for nav mesh generation
 */
export type Triangle = {
    v0: Vec3;
    v1: Vec3;
    v2: Vec3;
    index: number;
    bounds: AABB;
    centroid: Vec3;
}

/**
 * BVH Node for triangles
 */
export type TriangleBVHNode = {
    bounds: AABB;
    // Leaf node
    triangles?: Triangle[];
    // Internal node
    left?: TriangleBVHNode;
    right?: TriangleBVHNode;
}

/**
 * Triangle mesh with prebuilt BVH for fast raycasting
 */
export type TriangleMesh = {
    triangles: Triangle[];
    bvh: TriangleBVHNode | null;
}

/**
 * Create a triangle with precomputed bounds and centroid
 */
export const createTriangle = (v0: Vec3, v1: Vec3, v2: Vec3, index: number): Triangle => {
    const triangle = {
        v0: vec3.clone(v0),
        v1: vec3.clone(v1),
        v2: vec3.clone(v2),
        index
    };
    
    const bounds = calculateTriangleBounds(triangle);
    const centroid = calculateTriangleCentroid(triangle);
    
    return {
        ...triangle,
        bounds,
        centroid
    };
}

/**
 * Calculate triangle bounds directly
 */
const calculateTriangleBounds = (triangle: Pick<Triangle, 'v0' | 'v1' | 'v2'>): AABB => {
    const { v0, v1, v2 } = triangle;
    
    vec3.set(_min,
        Math.min(v0[0], v1[0], v2[0]),
        Math.min(v0[1], v1[1], v2[1]),
        Math.min(v0[2], v1[2], v2[2])
    );
    
    vec3.set(_max,
        Math.max(v0[0], v1[0], v2[0]),
        Math.max(v0[1], v1[1], v2[1]),
        Math.max(v0[2], v1[2], v2[2])
    );
    
    return {
        min: vec3.clone(_min),
        max: vec3.clone(_max)
    };
}

/**
 * Calculate triangle centroid directly
 */
const calculateTriangleCentroid = (triangle: Pick<Triangle, 'v0' | 'v1' | 'v2'>): Vec3 => {
    const { v0, v1, v2 } = triangle;
    return [
        (v0[0] + v1[0] + v2[0]) / 3,
        (v0[1] + v1[1] + v2[1]) / 3,
        (v0[2] + v1[2] + v2[2]) / 3
    ];
}

/**
 * Create triangle mesh from positions and indices with prebuilt BVH
 */
export const createTriangleMesh = (
    positions: number[],
    indices: number[],
    maxTrianglesPerLeaf = 8
): TriangleMesh => {
    if (positions.length === 0 || indices.length === 0) {
        return { triangles: [], bvh: null };
    }

    if (indices.length % 3 !== 0) {
        throw new Error('Indices array length must be a multiple of 3');
    }

    if (positions.length % 3 !== 0) {
        throw new Error('Positions array length must be a multiple of 3');
    }

    // Create triangles with precomputed spatial data
    const triangles: Triangle[] = [];

    for (let i = 0; i < indices.length; i += 3) {
        const i0 = indices[i] * 3;
        const i1 = indices[i + 1] * 3;
        const i2 = indices[i + 2] * 3;

        vec3.set(_v0, positions[i0], positions[i0 + 1], positions[i0 + 2]);
        vec3.set(_v1, positions[i1], positions[i1 + 1], positions[i1 + 2]);
        vec3.set(_v2, positions[i2], positions[i2 + 1], positions[i2 + 2]);

        triangles.push(createTriangle(_v0, _v1, _v2, Math.floor(i / 3)));
    }

    // Build BVH
    const bvh = triangles.length > 0 ? buildTriangleBVH(triangles, 0, 20, maxTrianglesPerLeaf) : null;

    return { triangles, bvh };
}

/**
 * Build BVH for triangles using median split on longest axis
 */
const buildTriangleBVH = (
    triangles: Triangle[],
    depth: number,
    maxDepth: number,
    maxTrianglesPerLeaf: number
): TriangleBVHNode => {
    // Calculate bounding box for all triangles
    const bounds = calculateTrianglesBounds(triangles);

    // Create leaf if stopping criteria met
    if (triangles.length <= maxTrianglesPerLeaf || depth >= maxDepth) {
        return { bounds, triangles: [...triangles] };
    }

    // Find longest axis
    vec3.subtract(_extent, bounds.max, bounds.min);
    let axis = 0;
    if (_extent[1] > _extent[0]) axis = 1;
    if (_extent[2] > _extent[axis]) axis = 2;

    // Sort triangles by centroid on chosen axis
    triangles.sort((a, b) => a.centroid[axis] - b.centroid[axis]);

    // Split at median
    const mid = Math.floor(triangles.length / 2);
    const left = triangles.slice(0, mid);
    const right = triangles.slice(mid);

    return {
        bounds,
        left: buildTriangleBVH(left, depth + 1, maxDepth, maxTrianglesPerLeaf),
        right: buildTriangleBVH(right, depth + 1, maxDepth, maxTrianglesPerLeaf)
    };
}

/**
 * Calculate bounding box for array of triangles
 */
const calculateTrianglesBounds = (triangles: Triangle[]): AABB => {
    if (triangles.length === 0) {
        return { min: [0, 0, 0], max: [0, 0, 0] };
    }

    const firstBounds = triangles[0].bounds;
    vec3.copy(_min, firstBounds.min);
    vec3.copy(_max, firstBounds.max);

    for (let i = 1; i < triangles.length; i++) {
        const bounds = triangles[i].bounds;
        for (let j = 0; j < 3; j++) {
            _min[j] = Math.min(_min[j], bounds.min[j]);
            _max[j] = Math.max(_max[j], bounds.max[j]);
        }
    }

    return { 
        min: vec3.clone(_min), 
        max: vec3.clone(_max) 
    };
}

/**
 * Raycast against triangle mesh - optimized for nav mesh generation
 */
export const raycastTriangleMesh = (
    mesh: TriangleMesh,
    ray: Ray,
    options: RaycastOptions = {}
): RaycastHit | null => {
    if (!mesh.bvh) return null;
    return raycastBVHNode(ray, mesh.bvh, options);
}

/**
 * Raycast against BVH node
 */
const raycastBVHNode = (
    ray: Ray,
    node: TriangleBVHNode,
    options: RaycastOptions
): RaycastHit | null => {
    // Test ray against bounding box
    const maxDistance = options.maxDistance || Number.POSITIVE_INFINITY;
    if (!rayAABBIntersection(ray, node.bounds, maxDistance)) {
        return null;
    }

    // Leaf node - test triangles
    if (node.triangles) {
        let closestHit: RaycastHit | null = null;
        let closestDistance = maxDistance;

        for (const triangle of node.triangles) {
            const hit = rayTriangleIntersection(_tempHit, ray, triangle.v0, triangle.v1, triangle.v2, {
                ...options,
                maxDistance: closestDistance
            });

            if (hit && hit.distance < closestDistance) {
                closestDistance = hit.distance;
                hit.triangleIndex = triangle.index;
                // Clone the temp hit if it's the closest so far
                if (!closestHit) {
                    closestHit = {
                        distance: hit.distance,
                        point: vec3.clone(hit.point),
                        normal: vec3.clone(hit.normal),
                        barycentric: vec3.clone(hit.barycentric),
                        triangleIndex: hit.triangleIndex
                    };
                } else {
                    closestHit.distance = hit.distance;
                    vec3.copy(closestHit.point, hit.point);
                    vec3.copy(closestHit.normal, hit.normal);
                    vec3.copy(closestHit.barycentric, hit.barycentric);
                    closestHit.triangleIndex = hit.triangleIndex;
                }
            }
        }

        return closestHit;
    }

    // Internal node - test children
    const leftHit = node.left ? raycastBVHNode(ray, node.left, options) : null;
    const rightHit = node.right ? raycastBVHNode(ray, node.right, options) : null;

    if (!leftHit) return rightHit;
    if (!rightHit) return leftHit;
    return leftHit.distance < rightHit.distance ? leftHit : rightHit;
}

// Temporary hit object for reuse in BVH traversal
const _tempHit: RaycastHit = {
    distance: 0,
    point: vec3.create(),
    normal: vec3.create(),
    barycentric: vec3.create(),
    triangleIndex: -1
};

/**
 * Raycast against triangle mesh and return all hits - for nav mesh generation
 */
export const raycastTriangleMeshAll = (
    mesh: TriangleMesh,
    ray: Ray,
    options: RaycastOptions = {}
): RaycastHit[] => {
    if (!mesh.bvh) return [];
    
    const hits: RaycastHit[] = [];
    raycastBVHNodeAll(ray, mesh.bvh, hits, options);
    return hits.sort((a, b) => a.distance - b.distance);
}

/**
 * Raycast against BVH node and collect all hits
 */
const raycastBVHNodeAll = (
    ray: Ray,
    node: TriangleBVHNode,
    hits: RaycastHit[],
    options: RaycastOptions
): void => {
    // Test ray against bounding box
    const maxDistance = options.maxDistance || Number.POSITIVE_INFINITY;
    if (!rayAABBIntersection(ray, node.bounds, maxDistance)) {
        return;
    }

    // Leaf node - test triangles
    if (node.triangles) {
        for (const triangle of node.triangles) {
            const hit = rayTriangleIntersection(_tempHit, ray, triangle.v0, triangle.v1, triangle.v2, options);
            if (hit) {
                hit.triangleIndex = triangle.index;
                // Clone the temp hit to add to results
                hits.push({
                    distance: hit.distance,
                    point: vec3.clone(hit.point),
                    normal: vec3.clone(hit.normal),
                    barycentric: vec3.clone(hit.barycentric),
                    triangleIndex: hit.triangleIndex
                });
            }
        }
        return;
    }

    // Internal node - test children
    if (node.left) raycastBVHNodeAll(ray, node.left, hits, options);
    if (node.right) raycastBVHNodeAll(ray, node.right, hits, options);
}
