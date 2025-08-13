import { type Box3, type Vec3, vec3 } from '@/common/maaths';
import { NULL_AREA, WALKABLE_AREA } from './common';
import type { ArrayLike } from './common';

const _edge0 = vec3.create();
const _edge1 = vec3.create();

/**
 * Calculates the normal vector of a triangle
 * @param inV0 First vertex [x, y, z]
 * @param inV1 Second vertex [x, y, z]
 * @param inV2 Third vertex [x, y, z]
 * @param outFaceNormal Output normal vector [x, y, z]
 */
const calcTriNormal = (inV0: Vec3, inV1: Vec3, inV2: Vec3, outFaceNormal: Vec3) => {
    // Calculate edge vectors: e0 = v1 - v0, e1 = v2 - v0
    vec3.subtract(_edge0, inV1, inV0);
    vec3.subtract(_edge1, inV2, inV0);

    // Calculate cross product: faceNormal = e0 × e1
    vec3.cross(outFaceNormal, _edge0, _edge1);

    // Normalize the result
    vec3.normalize(outFaceNormal, outFaceNormal);
};

const _triangleNormal = vec3.create();
const _v0 = vec3.create();
const _v1 = vec3.create();
const _v2 = vec3.create();

/**
 * Marks triangles as walkable based on their slope angle
 * @param inVertices Array of vertex coordinates [x0, y0, z0, x1, y1, z1, ...]
 * @param inIndices Array of triangle indices [i0, i1, i2, i3, i4, i5, ...]
 * @param outTriAreaIds Output array of triangle area IDs, with a length equal to inIndices.length / 3
 * @param walkableSlopeAngle Maximum walkable slope angle in degrees (default: 45)
 */
export const markWalkableTriangles = (
    inVertices: ArrayLike<number>,
    inIndices: ArrayLike<number>,
    outTriAreaIds: ArrayLike<number>,
    walkableSlopeAngle = 45.0,
) => {
    // Convert walkable slope angle to threshold using cosine
    const walkableThr = Math.cos((walkableSlopeAngle / 180.0) * Math.PI);

    const numTris = inIndices.length / 3;

    for (let i = 0; i < numTris; ++i) {
        const triStartIndex = i * 3;

        const i0 = inIndices[triStartIndex];
        const i1 = inIndices[triStartIndex + 1];
        const i2 = inIndices[triStartIndex + 2];

        const v0 = vec3.fromBuffer(_v0, inVertices, i0 * 3);
        const v1 = vec3.fromBuffer(_v1, inVertices, i1 * 3);
        const v2 = vec3.fromBuffer(_v2, inVertices, i2 * 3);

        calcTriNormal(v0, v1, v2, _triangleNormal);

        if (_triangleNormal[1] > walkableThr) {
            outTriAreaIds[i] = WALKABLE_AREA;
        }
    }
};

/**
 * Clears (sets to NULL_AREA) triangles whose slope exceeds the walkable limit.
 * Mirrors markWalkableTriangles but does the inverse operation.
 * @param inVertices Array of vertex coordinates [x0, y0, z0, ...]
 * @param inIndices Array of triangle indices [i0, i1, i2, ...]
 * @param inOutTriAreaIds In/out array of triangle area IDs (modified in place)
 * @param walkableSlopeAngle Maximum walkable slope angle in degrees (default: 45)
 */
export const clearUnwalkableTriangles = (
    inVertices: ArrayLike<number>,
    inIndices: ArrayLike<number>,
    inOutTriAreaIds: ArrayLike<number>,
    walkableSlopeAngle = 45.0,
) => {
    const walkableThr = Math.cos((walkableSlopeAngle / 180.0) * Math.PI);
    const numTris = inIndices.length / 3;
    for (let i = 0; i < numTris; ++i) {
        const triStartIndex = i * 3;
        const i0 = inIndices[triStartIndex];
        const i1 = inIndices[triStartIndex + 1];
        const i2 = inIndices[triStartIndex + 2];

        const v0 = vec3.fromBuffer(_v0, inVertices, i0 * 3);
        const v1 = vec3.fromBuffer(_v1, inVertices, i1 * 3);
        const v2 = vec3.fromBuffer(_v2, inVertices, i2 * 3);

        calcTriNormal(v0, v1, v2, _triangleNormal);

        if (_triangleNormal[1] <= walkableThr) {
            inOutTriAreaIds[i] = NULL_AREA;
        }
    }
};

export const calculateMeshBounds = (outBounds: Box3, inVertices: ArrayLike<number>, inIndices: ArrayLike<number>): Box3 => {
    outBounds[0][0] = Number.POSITIVE_INFINITY;
    outBounds[0][1] = Number.POSITIVE_INFINITY;
    outBounds[0][2] = Number.POSITIVE_INFINITY;

    outBounds[1][0] = Number.NEGATIVE_INFINITY;
    outBounds[1][1] = Number.NEGATIVE_INFINITY;
    outBounds[1][2] = Number.NEGATIVE_INFINITY;

    const numTris = inIndices.length / 3;

    for (let i = 0; i < numTris; ++i) {
        const triStartIndex = i * 3;

        for (let j = 0; j < 3; ++j) {
            const index = inIndices[triStartIndex + j];
            const x = inVertices[index * 3];
            const y = inVertices[index * 3 + 1];
            const z = inVertices[index * 3 + 2];

            outBounds[0][0] = Math.min(outBounds[0][0], x);
            outBounds[0][1] = Math.min(outBounds[0][1], y);
            outBounds[0][2] = Math.min(outBounds[0][2], z);

            outBounds[1][0] = Math.max(outBounds[1][0], x);
            outBounds[1][1] = Math.max(outBounds[1][1], y);
            outBounds[1][2] = Math.max(outBounds[1][2], z);
        }
    }

    return outBounds;
};
