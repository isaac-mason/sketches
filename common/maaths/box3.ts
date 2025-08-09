import type { Box3, Plane3, Sphere3, Triangle3, Vec3 } from './types';
import * as vec3 from './vec3';

/**
 * Create a new empty Box3 with "min" set to positive infinity and "max" set to negative infinity
 * @returns A new Box3
 */
export function create(): Box3 {
    return [
        [
            Number.POSITIVE_INFINITY,
            Number.POSITIVE_INFINITY,
            Number.POSITIVE_INFINITY,
        ],
        [
            Number.NEGATIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
            Number.NEGATIVE_INFINITY,
        ],
    ];
}

/**
 * Check whether two bounding boxes intersect
 */
export function intersectsBox3(boxA: Box3, boxB: Box3): boolean {
    const [minA, maxA] = boxA;
    const [minB, maxB] = boxB;

    return (
        minA[0] <= maxB[0] &&
        maxA[0] >= minB[0] &&
        minA[1] <= maxB[1] &&
        maxA[1] >= minB[1] &&
        minA[2] <= maxB[2] &&
        maxA[2] >= minB[2]
    );
}

const _center: Vec3 = [0, 0, 0];
const _extents: Vec3 = [0, 0, 0];
const _v0: Vec3 = [0, 0, 0];
const _v1: Vec3 = [0, 0, 0];
const _v2: Vec3 = [0, 0, 0];
const _f0: Vec3 = [0, 0, 0];
const _f1: Vec3 = [0, 0, 0];
const _f2: Vec3 = [0, 0, 0];
const _triangleNormal: Vec3 = [0, 0, 0];
const _closestPoint: Vec3 = [0, 0, 0];

const _axesCross: number[] = new Array(27); // 9 axes * 3 components
const _axesBoxFaces: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const _axisTriangle: number[] = [0, 0, 0];

function _satForAxes(axes: number[], axisCount: number): boolean {
    for (let i = 0; i < axisCount; i++) {
        const ax = axes[i * 3 + 0];
        const ay = axes[i * 3 + 1];
        const az = axes[i * 3 + 2];
        // Skip degenerate axis (may occur if triangle edges parallel to axes)
        if (ax === 0 && ay === 0 && az === 0) continue;

        // Project triangle vertices
        const p0 = _v0[0] * ax + _v0[1] * ay + _v0[2] * az;
        const p1 = _v1[0] * ax + _v1[1] * ay + _v1[2] * az;
        const p2 = _v2[0] * ax + _v2[1] * ay + _v2[2] * az;
        let minP = p0;
        let maxP = p0;
        if (p1 < minP) minP = p1;
        else if (p1 > maxP) maxP = p1;
        if (p2 < minP) minP = p2;
        else if (p2 > maxP) maxP = p2;

        // Project AABB (centered at origin) radius onto axis
        const r =
            _extents[0] * Math.abs(ax) +
            _extents[1] * Math.abs(ay) +
            _extents[2] * Math.abs(az);
        if (maxP < -r || minP > r) return false; // Separating axis found
    }
    return true;
}

export function intersectsTriangle3(box: Box3, triangle: Triangle3): boolean {
    const min = box[0];
    const max = box[1];

    // Empty box quick reject
    if (min[0] > max[0] || min[1] > max[1] || min[2] > max[2]) return false;

    // Center ( (min+max) * 0.5 ) and half-extents ( max - center )
    _center[0] = (min[0] + max[0]) * 0.5;
    _center[1] = (min[1] + max[1]) * 0.5;
    _center[2] = (min[2] + max[2]) * 0.5;
    _extents[0] = max[0] - _center[0];
    _extents[1] = max[1] - _center[1];
    _extents[2] = max[2] - _center[2];

    // Translate triangle vertices so box center = origin
    _v0[0] = triangle[0][0] - _center[0];
    _v0[1] = triangle[0][1] - _center[1];
    _v0[2] = triangle[0][2] - _center[2];
    _v1[0] = triangle[1][0] - _center[0];
    _v1[1] = triangle[1][1] - _center[1];
    _v1[2] = triangle[1][2] - _center[2];
    _v2[0] = triangle[2][0] - _center[0];
    _v2[1] = triangle[2][1] - _center[1];
    _v2[2] = triangle[2][2] - _center[2];

    // Edge vectors f0 = v1 - v0, etc.
    _f0[0] = _v1[0] - _v0[0];
    _f0[1] = _v1[1] - _v0[1];
    _f0[2] = _v1[2] - _v0[2];
    _f1[0] = _v2[0] - _v1[0];
    _f1[1] = _v2[1] - _v1[1];
    _f1[2] = _v2[2] - _v1[2];
    _f2[0] = _v0[0] - _v2[0];
    _f2[1] = _v0[1] - _v2[1];
    _f2[2] = _v0[2] - _v2[2];

    // 9 cross-product axes between AABB axes (x,y,z) and triangle edges
    // First trio (x cross f) => components (0,-fz,fy)
    _axesCross[0] = 0;
    _axesCross[1] = -_f0[2];
    _axesCross[2] = _f0[1];
    _axesCross[3] = 0;
    _axesCross[4] = -_f1[2];
    _axesCross[5] = _f1[1];
    _axesCross[6] = 0;
    _axesCross[7] = -_f2[2];
    _axesCross[8] = _f2[1];
    // Second trio (y cross f) => (fz,0,-fx)
    _axesCross[9] = _f0[2];
    _axesCross[10] = 0;
    _axesCross[11] = -_f0[0];
    _axesCross[12] = _f1[2];
    _axesCross[13] = 0;
    _axesCross[14] = -_f1[0];
    _axesCross[15] = _f2[2];
    _axesCross[16] = 0;
    _axesCross[17] = -_f2[0];
    // Third trio (z cross f) => (-fy,fx,0)
    _axesCross[18] = -_f0[1];
    _axesCross[19] = _f0[0];
    _axesCross[20] = 0;
    _axesCross[21] = -_f1[1];
    _axesCross[22] = _f1[0];
    _axesCross[23] = 0;
    _axesCross[24] = -_f2[1];
    _axesCross[25] = _f2[0];
    _axesCross[26] = 0;

    if (!_satForAxes(_axesCross, 9)) return false;

    // AABB face normals
    if (!_satForAxes(_axesBoxFaces, 3)) return false;

    // Triangle face normal
    vec3.cross(_triangleNormal, _f0, _f1);
    _axisTriangle[0] = _triangleNormal[0];
    _axisTriangle[1] = _triangleNormal[1];
    _axisTriangle[2] = _triangleNormal[2];
    return _satForAxes(_axisTriangle, 1);
}

/**
 * Test intersection between axis-aligned bounding box and a sphere.
 * Sphere format: [centerVec3, radius]
 */
export function intersectsSphere3(box: Box3, sphere: Sphere3): boolean {
    const min = box[0];
    const max = box[1];
    const center = sphere[0];
    const radius = sphere[1];
    // Clamp center to box to obtain closest point
    _closestPoint[0] =
        center[0] < min[0] ? min[0] : center[0] > max[0] ? max[0] : center[0];
    _closestPoint[1] =
        center[1] < min[1] ? min[1] : center[1] > max[1] ? max[1] : center[1];
    _closestPoint[2] =
        center[2] < min[2] ? min[2] : center[2] > max[2] ? max[2] : center[2];
    const dx = _closestPoint[0] - center[0];
    const dy = _closestPoint[1] - center[1];
    const dz = _closestPoint[2] - center[2];
    return dx * dx + dy * dy + dz * dz <= radius * radius;
}

/**
 * Test intersection between axis-aligned bounding box and plane.
 * Plane format: [normalVec3, constant]; plane equation: normal.dot(p) + constant = 0
 */
export function intersectsPlane3(box: Box3, plane: Plane3): boolean {
    const min = box[0];
    const max = box[1];
    const normal = plane[0];
    const constant = plane[1];

    // Select extreme points along plane normal
    let minDot = 0;
    let maxDot = 0;

    if (normal[0] > 0) {
        minDot = normal[0] * min[0];
        maxDot = normal[0] * max[0];
    } else {
        minDot = normal[0] * max[0];
        maxDot = normal[0] * min[0];
    }
    if (normal[1] > 0) {
        minDot += normal[1] * min[1];
        maxDot += normal[1] * max[1];
    } else {
        minDot += normal[1] * max[1];
        maxDot += normal[1] * min[1];
    }
    if (normal[2] > 0) {
        minDot += normal[2] * min[2];
        maxDot += normal[2] * max[2];
    } else {
        minDot += normal[2] * max[2];
        maxDot += normal[2] * min[2];
    }

    // Plane intersection occurs if the interval [minDot + constant, maxDot + constant] straddles zero
    return minDot + constant <= 0 && maxDot + constant >= 0;
}
