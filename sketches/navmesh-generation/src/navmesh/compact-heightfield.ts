import type { Box3 } from "@/common/maaths";
import type { Heightfield } from "./heightfield";

export type CompactHeightfieldSpan = {
    /** the lower extent of the span. measured from the heightfields base. */
    y: number;
    /** the id of the region the span belongs to, or zero if not in a region */
    reg: number;
    /** packed neighbour connection data */
    con: number;
    /** the height of the span, measured from y */
    h: number;
}

export type CompactHeightfieldCell = {
    /** index to the first span in the column */
    index: number;
    /** number of spans in the column */
    count: number;
}

export type CompactHeightfield = {
    /** the width of the heightfield (along x axis in cell units) */
    width: number;
    /** the height of the heightfield (along z axis in cell units) */
    height: number;
    /** the number of spans in the heightfield */
    spanCount: number;
    /** the walkable height used during the build of the heightfield */
    walkableHeightVoxels: number;
    /** the walkable climb used during the build of the heightfield */
    walkableClimbVoxels: number;
    /** the AABB border size used during the build of the heightfield */
    borderSize: number;
    /** the maxiumum distance value of any span within the heightfield */
    maxDistance: number;
    /** the maximum region id of any span within the heightfield */
    maxRegions: number;
    /** the heightfield bounds in world space */
    bounds: Box3;
    /** the size of each cell */
    cellSize: number;
    /** the height of each cell */
    cellHeight: number;
    /** array of cells, size = width*height */
    cells: CompactHeightfieldCell[];
    /** array of spans, size = spanCount */
    spans: CompactHeightfieldSpan[];
    /** array containing area id data, size = spanCount */
    areas: number[];
};

export const buildCompactHeightfield = (
    walkableHeightVoxels: number,
    walkableClimbVoxels: number,
    heightfield: Heightfield,
): CompactHeightfield => {
    const compactHeightfield: CompactHeightfield = {
        width: heightfield.width,
        height: heightfield.height,
        spanCount: 0,
        walkableHeightVoxels,
        walkableClimbVoxels,
        borderSize: 0,
        maxDistance: 0,
        maxRegions: 0,
        bounds: structuredClone(heightfield.bounds),
        cellSize: heightfield.cellSize,
        cellHeight: heightfield.cellHeight,
        cells: new Array(heightfield.width * heightfield.height).fill(null).map(() => {
            return {
                index: 0,
                count: 0,
            };
        }),
        spans: [],
        areas: [],
    };



    return compactHeightfield;
}