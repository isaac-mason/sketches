import type { Vec3 } from "../../../../../common/maaths";


/**
 * Calculates the closest point on a line segment to a given point in 2D (XZ plane)
 * @param closest Output parameter for the closest point
 * @param pt The point
 * @param p First endpoint of the segment
 * @param q Second endpoint of the segment
 */
export const closestPtSeg2d = (closest: Vec3, pt: Vec3, p: Vec3, q: Vec3): void => {
    const pqx = q[0] - p[0];
    const pqz = q[2] - p[2];
    const dx = pt[0] - p[0];
    const dz = pt[2] - p[2];

    const d = pqx * pqx + pqz * pqz;
    let t = pqx * dx + pqz * dz;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    closest[0] = p[0] + t * pqx;
    closest[1] = p[1]; // Keep original Y value from p
    closest[2] = p[2] + t * pqz;
};/**
 * Tests if a point is inside a polygon in 2D (XZ plane)
 * @param nvert Number of vertices in the polygon
 * @param verts Array of vertex coordinates [x,y,z,x,y,z,...]
 * @param p The point to test
 * @returns True if the point is inside the polygon
 */
export const pointInPoly = (nvert: number, verts: number[], p: Vec3): boolean => {
    let c = false;
    let j = nvert - 1;

    for (let i = 0; i < nvert; j = i++) {
        const vi = verts.slice(i * 3, i * 3 + 3);
        const vj = verts.slice(j * 3, j * 3 + 3);

        if (((vi[2] > p[2]) !== (vj[2] > p[2])) &&
            (p[0] < (vj[0] - vi[0]) * (p[2] - vi[2]) / (vj[2] - vi[2]) + vi[0])) {
            c = !c;
        }
    }

    return c;
};
// Helper functions for geometric calculations
/**
 * Calculates the squared distance from a point to a line segment in 2D (XZ plane)
 * @param pt The point
 * @param p First endpoint of the segment
 * @param q Second endpoint of the segment
 * @returns The squared distance
 */
export const distancePtSeg2dSqr = (pt: Vec3, p: Vec3, q: Vec3): number => {
    const pqx = q[0] - p[0];
    const pqz = q[2] - p[2];
    const dx = pt[0] - p[0];
    const dz = pt[2] - p[2];

    const d = pqx * pqx + pqz * pqz;
    let t = pqx * dx + pqz * dz;
    if (d > 0) t /= d;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;

    const closestX = p[0] + t * pqx;
    const closestZ = p[2] + t * pqz;

    const distX = closestX - pt[0];
    const distZ = closestZ - pt[2];

    return distX * distX + distZ * distZ;
};
/**
 * Calculates the height at a point using barycentric coordinates on a triangle
 * @param v0 First vertex of triangle
 * @param v1 Second vertex of triangle
 * @param v2 Third vertex of triangle
 * @param pos Position to calculate height for
 * @returns Height at position, or null if point is not inside triangle
 */
export const getHeightAtPoint = (v0: Vec3, v1: Vec3, v2: Vec3, pos: Vec3): number | null => {
    // Calculate barycentric coordinates
    const denom = (v1[2] - v2[2]) * (v0[0] - v2[0]) + (v2[0] - v1[0]) * (v0[2] - v2[2]);
    if (Math.abs(denom) < 1e-8) return null;

    const a = ((v1[2] - v2[2]) * (pos[0] - v2[0]) + (v2[0] - v1[0]) * (pos[2] - v2[2])) / denom;
    const b = ((v2[2] - v0[2]) * (pos[0] - v2[0]) + (v0[0] - v2[0]) * (pos[2] - v2[2])) / denom;
    const c = 1 - a - b;

    // Check if point is inside triangle
    if (a >= 0 && b >= 0 && c >= 0) {
        return a * v0[1] + b * v1[1] + c * v2[1];
    }

    return null;
};

