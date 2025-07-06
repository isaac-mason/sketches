import { vec3, box3, clamp, type Vec3, type Box3 } from '@/common/maaths';
import type { ArrayLike } from './common';

// Constants from recastnavigation
const RC_SPAN_MAX_HEIGHT = 0x1fff; // 8191
const RC_AXIS_X = 0;
const RC_AXIS_Y = 1;
const RC_AXIS_Z = 2;

export type HeightfieldSpan = {
    /** the lower limit of the span */
    min: number;
    /** the upper limit of the span */
    max: number;
    /** the area id assigned to the span */
    area: number;
    /** the next heightfield span */
    next?: HeightfieldSpan;
};

export type Heightfield = {
    /** the width of the heightfield (along x axis in cell units) */
    width: number;
    /** the height of the heightfield (along z axis in cell units) */
    height: number;
    /** the bounds in world space */
    bounds: Box3;
    /** the vertical size of each cell (minimum increment along y) */
    cellHeight: number;
    /** the vertical size of each cell (minimum increment along x and z) */
    cellSize: number;
    /** the heightfield of spans, (width*height) */
    spans: (HeightfieldSpan | null)[];
};

export const calculateGridSize = (
    bounds: Box3,
    cellSize: number,
): [width: number, height: number] => {
    const minBounds = bounds[0];
    const maxBounds = bounds[1];

    const width = Math.floor((maxBounds[0] - minBounds[0]) / cellSize + 0.5);
    const height = Math.floor((maxBounds[2] - minBounds[2]) / cellSize + 0.5);

    return [width, height];
};

export const createHeightfield = (
    width: number,
    height: number,
    bounds: Box3,
    cellSize: number,
    cellHeight: number,
): Heightfield => {
    const numSpans = width * height;

    const spans: (HeightfieldSpan | null)[] = new Array(numSpans).fill(null);

    return {
        width,
        height,
        spans,
        bounds,
        cellHeight,
        cellSize,
    };
};

/**
 * Adds a span to the heightfield. If the new span overlaps existing spans,
 * it will merge the new span with the existing ones.
 */
const addSpan = (
    heightfield: Heightfield,
    x: number,
    z: number,
    min: number,
    max: number,
    areaID: number,
    flagMergeThreshold: number,
): boolean => {
    // Create the new span
    const newSpan: HeightfieldSpan = {
        min,
        max,
        area: areaID,
        next: undefined,
    };

    const columnIndex = x + z * heightfield.width;
    let previousSpan: HeightfieldSpan | null = null;
    let currentSpan = heightfield.spans[columnIndex];

    // Insert the new span, possibly merging it with existing spans
    while (currentSpan != null) {
        if (currentSpan.min > newSpan.max) {
            // Current span is completely after the new span, break
            break;
        }

        if (currentSpan.max < newSpan.min) {
            // Current span is completely before the new span. Keep going
            previousSpan = currentSpan;
            currentSpan = currentSpan.next || null;
        } else {
            // The new span overlaps with an existing span. Merge them
            if (currentSpan.min < newSpan.min) {
                newSpan.min = currentSpan.min;
            }
            if (currentSpan.max > newSpan.max) {
                newSpan.max = currentSpan.max;
            }

            // Merge flags
            if (Math.abs(newSpan.max - currentSpan.max) <= flagMergeThreshold) {
                // Higher area ID numbers indicate higher resolution priority
                newSpan.area = Math.max(newSpan.area, currentSpan.area);
            }

            // Remove the current span since it's now merged with newSpan
            const next = currentSpan.next || null;
            if (previousSpan) {
                previousSpan.next = next || undefined;
            } else {
                heightfield.spans[columnIndex] = next;
            }
            currentSpan = next;
        }
    }

    // Insert new span after prev
    if (previousSpan != null) {
        newSpan.next = previousSpan.next;
        previousSpan.next = newSpan;
    } else {
        // This span should go before the others in the list
        newSpan.next = heightfield.spans[columnIndex] || undefined;
        heightfield.spans[columnIndex] = newSpan;
    }

    return true;
};

/**
 * Divides a convex polygon of max 12 vertices into two convex polygons
 * across a separating axis.
 */
const dividePoly = (
    inVerts: number[],
    inVertsCount: number,
    outVerts1: number[],
    outVerts2: number[],
    axisOffset: number,
    axis: number,
): [number, number] => {
    // How far positive or negative away from the separating axis is each vertex
    const inVertAxisDelta = _inVertAxisDelta;
    for (let inVert = 0; inVert < inVertsCount; ++inVert) {
        inVertAxisDelta[inVert] = axisOffset - inVerts[inVert * 3 + axis];
    }

    let poly1Vert = 0;
    let poly2Vert = 0;

    for (
        let inVertA = 0, inVertB = inVertsCount - 1;
        inVertA < inVertsCount;
        inVertB = inVertA, ++inVertA
    ) {
        // If the two vertices are on the same side of the separating axis
        const sameSide =
            inVertAxisDelta[inVertA] >= 0 === inVertAxisDelta[inVertB] >= 0;

        if (!sameSide) {
            const s =
                inVertAxisDelta[inVertB] /
                (inVertAxisDelta[inVertB] - inVertAxisDelta[inVertA]);
            outVerts1[poly1Vert * 3 + 0] =
                inVerts[inVertB * 3 + 0] +
                (inVerts[inVertA * 3 + 0] - inVerts[inVertB * 3 + 0]) * s;
            outVerts1[poly1Vert * 3 + 1] =
                inVerts[inVertB * 3 + 1] +
                (inVerts[inVertA * 3 + 1] - inVerts[inVertB * 3 + 1]) * s;
            outVerts1[poly1Vert * 3 + 2] =
                inVerts[inVertB * 3 + 2] +
                (inVerts[inVertA * 3 + 2] - inVerts[inVertB * 3 + 2]) * s;

            // Copy to second polygon
            outVerts2[poly2Vert * 3 + 0] = outVerts1[poly1Vert * 3 + 0];
            outVerts2[poly2Vert * 3 + 1] = outVerts1[poly1Vert * 3 + 1];
            outVerts2[poly2Vert * 3 + 2] = outVerts1[poly1Vert * 3 + 2];

            poly1Vert++;
            poly2Vert++;

            // Add the inVertA point to the right polygon. Do NOT add points that are on the dividing line
            // since these were already added above
            if (inVertAxisDelta[inVertA] > 0) {
                outVerts1[poly1Vert * 3 + 0] = inVerts[inVertA * 3 + 0];
                outVerts1[poly1Vert * 3 + 1] = inVerts[inVertA * 3 + 1];
                outVerts1[poly1Vert * 3 + 2] = inVerts[inVertA * 3 + 2];
                poly1Vert++;
            } else if (inVertAxisDelta[inVertA] < 0) {
                outVerts2[poly2Vert * 3 + 0] = inVerts[inVertA * 3 + 0];
                outVerts2[poly2Vert * 3 + 1] = inVerts[inVertA * 3 + 1];
                outVerts2[poly2Vert * 3 + 2] = inVerts[inVertA * 3 + 2];
                poly2Vert++;
            }
        } else {
            // Add the inVertA point to the right polygon. Addition is done even for points on the dividing line
            if (inVertAxisDelta[inVertA] >= 0) {
                outVerts1[poly1Vert * 3 + 0] = inVerts[inVertA * 3 + 0];
                outVerts1[poly1Vert * 3 + 1] = inVerts[inVertA * 3 + 1];
                outVerts1[poly1Vert * 3 + 2] = inVerts[inVertA * 3 + 2];
                poly1Vert++;
                if (inVertAxisDelta[inVertA] !== 0) {
                    continue;
                }
            }
            outVerts2[poly2Vert * 3 + 0] = inVerts[inVertA * 3 + 0];
            outVerts2[poly2Vert * 3 + 1] = inVerts[inVertA * 3 + 1];
            outVerts2[poly2Vert * 3 + 2] = inVerts[inVertA * 3 + 2];
            poly2Vert++;
        }
    }

    return [poly1Vert, poly2Vert];
};

const _triangleBounds = box3.create();

// Reusable buffers for polygon clipping to avoid allocations
const _inVerts = new Array(7 * 3);
const _inRow = new Array(7 * 3);
const _p1 = new Array(7 * 3);
const _p2 = new Array(7 * 3);

// Reusable buffer for dividePoly vertex axis deltas
const _inVertAxisDelta = new Array(12);

// Reusable Vec3 buffers for triangle vertices
const _v0 = vec3.create();
const _v1 = vec3.create();
const _v2 = vec3.create();

/**
 * Rasterize a single triangle to the heightfield
 */
const rasterizeTriangle = (
    v0: Vec3,
    v1: Vec3,
    v2: Vec3,
    areaID: number,
    heightfield: Heightfield,
    flagMergeThreshold: number,
): boolean => {
    // Calculate the bounding box of the triangle
    const triangleBounds = _triangleBounds;
    const triangleBoundsMin = triangleBounds[0];
    const triangleBoundsMax = triangleBounds[1];

    vec3.copy(_triangleBounds[0], v0);
    vec3.min(triangleBoundsMin, triangleBoundsMin, v1);
    vec3.min(triangleBoundsMin, triangleBoundsMin, v2);

    vec3.copy(triangleBoundsMax, v0);
    vec3.max(triangleBoundsMax, triangleBoundsMax, v1);
    vec3.max(triangleBoundsMax, triangleBoundsMax, v2);

    // If the triangle does not touch the bounding box of the heightfield, skip the triangle
    if (!box3.overlap(triangleBounds, heightfield.bounds)) {
        return true;
    }

    const heightfieldBoundsMin: Vec3 = heightfield.bounds[0];
    const heightfieldBoundsMax: Vec3 = heightfield.bounds[1];

    const w = heightfield.width;
    const h = heightfield.height;
    const by = heightfieldBoundsMax[1] - heightfieldBoundsMin[1];
    const cellSize = heightfield.cellSize;
    const cellHeight = heightfield.cellHeight;
    const inverseCellSize = 1.0 / cellSize;
    const inverseCellHeight = 1.0 / cellHeight;

    // Calculate the footprint of the triangle on the grid's z-axis
    let z0 = Math.floor(
        (triangleBoundsMin[2] - heightfieldBoundsMin[2]) * inverseCellSize,
    );
    let z1 = Math.floor(
        (triangleBoundsMax[2] - heightfieldBoundsMin[2]) * inverseCellSize,
    );

    // Use -1 rather than 0 to cut the polygon properly at the start of the tile
    z0 = clamp(z0, -1, h - 1);
    z1 = clamp(z1, 0, h - 1);

    // Clip the triangle into all grid cells it touches
    let inVerts = _inVerts;
    let inRow = _inRow;
    let p1 = _p1;
    let p2 = _p2;

    // Copy triangle vertices
    inVerts[0] = v0[0];
    inVerts[1] = v0[1];
    inVerts[2] = v0[2];
    inVerts[3] = v1[0];
    inVerts[4] = v1[1];
    inVerts[5] = v1[2];
    inVerts[6] = v2[0];
    inVerts[7] = v2[1];
    inVerts[8] = v2[2];

    let nvIn = 3;

    for (let z = z0; z <= z1; ++z) {
        // Clip polygon to row. Store the remaining polygon as well
        const cellZ = heightfieldBoundsMin[2] + z * cellSize;
        const [nvRow, nvIn2] = dividePoly(
            inVerts,
            nvIn,
            inRow,
            p1,
            cellZ + cellSize,
            RC_AXIS_Z,
        );

        // Swap arrays
        [inVerts, p1] = [p1, inVerts];
        nvIn = nvIn2;

        if (nvRow < 3) {
            continue;
        }
        if (z < 0) {
            continue;
        }

        // Find X-axis bounds of the row
        let minX = inRow[0];
        let maxX = inRow[0];
        for (let vert = 1; vert < nvRow; ++vert) {
            if (minX > inRow[vert * 3]) {
                minX = inRow[vert * 3];
            }
            if (maxX < inRow[vert * 3]) {
                maxX = inRow[vert * 3];
            }
        }

        let x0 = Math.floor((minX - heightfieldBoundsMin[0]) * inverseCellSize);
        let x1 = Math.floor((maxX - heightfieldBoundsMin[0]) * inverseCellSize);
        if (x1 < 0 || x0 >= w) {
            continue;
        }
        x0 = clamp(x0, -1, w - 1);
        x1 = clamp(x1, 0, w - 1);

        let nv2 = nvRow;

        for (let x = x0; x <= x1; ++x) {
            // Clip polygon to column. Store the remaining polygon as well
            const cx = heightfieldBoundsMin[0] + x * cellSize;
            const [nv, nv2New] = dividePoly(
                inRow,
                nv2,
                p1,
                p2,
                cx + cellSize,
                RC_AXIS_X,
            );

            // Swap arrays
            [inRow, p2] = [p2, inRow];
            nv2 = nv2New;

            if (nv < 3) {
                continue;
            }
            if (x < 0) {
                continue;
            }

            // Calculate min and max of the span
            let spanMin = p1[1];
            let spanMax = p1[1];
            for (let vert = 1; vert < nv; ++vert) {
                spanMin = Math.min(spanMin, p1[vert * 3 + 1]);
                spanMax = Math.max(spanMax, p1[vert * 3 + 1]);
            }
            spanMin -= heightfieldBoundsMin[1];
            spanMax -= heightfieldBoundsMin[1];

            // Skip the span if it's completely outside the heightfield bounding box
            if (spanMax < 0.0) {
                continue;
            }
            if (spanMin > by) {
                continue;
            }

            // Clamp the span to the heightfield bounding box
            if (spanMin < 0.0) {
                spanMin = 0;
            }
            if (spanMax > by) {
                spanMax = by;
            }

            // Snap the span to the heightfield height grid
            const spanMinCellIndex = clamp(
                Math.floor(spanMin * inverseCellHeight),
                0,
                RC_SPAN_MAX_HEIGHT,
            );
            const spanMaxCellIndex = clamp(
                Math.ceil(spanMax * inverseCellHeight),
                spanMinCellIndex + 1,
                RC_SPAN_MAX_HEIGHT,
            );

            if (
                !addSpan(
                    heightfield,
                    x,
                    z,
                    spanMinCellIndex,
                    spanMaxCellIndex,
                    areaID,
                    flagMergeThreshold,
                )
            ) {
                return false;
            }
        }
    }

    return true;
};

export const rasterizeTriangles = (
    heightfield: Heightfield,
    vertices: ArrayLike<number>,
    indices: ArrayLike<number>,
    triAreaIds: ArrayLike<number>,
    flagMergeThreshold = 1,
) => {
    const numTris = indices.length / 3;

    for (let triIndex = 0; triIndex < numTris; ++triIndex) {
        const i0 = indices[triIndex * 3 + 0];
        const i1 = indices[triIndex * 3 + 1];
        const i2 = indices[triIndex * 3 + 2];

        const v0 = vec3.set(_v0, vertices[i0 * 3], vertices[i0 * 3 + 1], vertices[i0 * 3 + 2]);
        const v1 = vec3.set(_v1, vertices[i1 * 3], vertices[i1 * 3 + 1], vertices[i1 * 3 + 2]);
        const v2 = vec3.set(_v2, vertices[i2 * 3], vertices[i2 * 3 + 1], vertices[i2 * 3 + 2]);

        const areaID = triAreaIds[triIndex];

        // Only rasterize walkable triangles (non-zero area IDs)
        if (areaID === 0) {
            continue;
        }

        if (
            !rasterizeTriangle(
                v0,
                v1,
                v2,
                areaID,
                heightfield,
                flagMergeThreshold,
            )
        ) {
            console.error('Failed to rasterize triangle');
            return false;
        }
    }

    return true;
};
