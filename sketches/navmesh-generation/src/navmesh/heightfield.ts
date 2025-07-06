import type { Box3 } from '@/common/maaths';

export type HeightfieldSpan = {
    /** the lower limit of the span */
    min: number;
    /** the upper limit of the span */
    max: number;
    /** the area id assigned to the span */
    area: number;
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
    spans: HeightfieldSpan[];
};

export const createHeightfield = (
    width: number,
    height: number,
    bounds: Box3,
    cellSize: number,
    cellHeight: number,
): Heightfield => {
    const numSpans = width * height;

    const spans: HeightfieldSpan[] = new Array(numSpans).fill(null).map(() => ({
        min: 0,
        max: 0,
        area: 0,
    }));

    return {
        width,
        height,
        spans,
        bounds,
        cellHeight,
        cellSize,
    };
};

export const rasterizeWalkableTriangles = (
    heightfield: Heightfield,
    vertices: number[],
    indices: number[],
    triAreaIds: number[],
) => {
    
}