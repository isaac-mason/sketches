import type { Box3 } from '@/common/maaths';
import type { Heightfield } from './heightfield';
import { NULL_AREA } from './area';

export type CompactHeightfieldSpan = {
    /** the lower extent of the span. measured from the heightfields base. */
    y: number;
    /** the id of the region the span belongs to, or zero if not in a region */
    reg: number;
    /** packed neighbour connection data */
    con: number;
    /** the height of the span, measured from y */
    h: number;
};

export type CompactHeightfieldCell = {
    /** index to the first span in the column */
    index: number;
    /** number of spans in the column */
    count: number;
};

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

// Constants from recastnavigation
const RC_NOT_CONNECTED = 0x3f; // 63
const MAX_HEIGHT = 0xffff;
const MAX_LAYERS = RC_NOT_CONNECTED - 1;

// Direction offsets for 4-directional neighbor access (N, E, S, W)
const DIR_OFFSETS = [
    [0, -1], // North (negative Z)
    [1, 0], // East (positive X)
    [0, 1], // South (positive Z)
    [-1, 0], // West (negative X)
];

/**
 * Helper function to set connection data in a span
 */
const setCon = (
    span: CompactHeightfieldSpan,
    dir: number,
    layerIndex: number,
) => {
    const shift = dir * 6; // 6 bits per direction
    const mask = 0x3f << shift; // 6-bit mask
    span.con = (span.con & ~mask) | ((layerIndex & 0x3f) << shift);
};

/**
 * Helper function to get connection data from a span
 */
const getCon = (span: CompactHeightfieldSpan, dir: number): number => {
    const shift = dir * 6; // 6 bits per direction
    return (span.con >> shift) & 0x3f;
};

/**
 * Count the number of walkable spans in the heightfield
 */
const getHeightFieldSpanCount = (heightfield: Heightfield): number => {
    const numCols = heightfield.width * heightfield.height;
    let spanCount = 0;

    for (let columnIndex = 0; columnIndex < numCols; ++columnIndex) {
        let span = heightfield.spans[columnIndex];
        while (span != null) {
            if (span.area !== NULL_AREA) {
                spanCount++;
            }
            span = span.next || null;
        }
    }

    return spanCount;
};

export const buildCompactHeightfield = (
    walkableHeightVoxels: number,
    walkableClimbVoxels: number,
    heightfield: Heightfield,
): CompactHeightfield => {
    const xSize = heightfield.width;
    const zSize = heightfield.height;
    const spanCount = getHeightFieldSpanCount(heightfield);

    // Fill in header
    const compactHeightfield: CompactHeightfield = {
        width: xSize,
        height: zSize,
        spanCount,
        walkableHeightVoxels,
        walkableClimbVoxels,
        borderSize: 0,
        maxDistance: 0,
        maxRegions: 0,
        bounds: structuredClone(heightfield.bounds),
        cellSize: heightfield.cellSize,
        cellHeight: heightfield.cellHeight,
        cells: new Array(xSize * zSize),
        spans: new Array(spanCount),
        areas: new Array(spanCount),
    };

    // Adjust upper bound to account for walkable height
    compactHeightfield.bounds[1][1] +=
        walkableHeightVoxels * heightfield.cellHeight;

    // Initialize cells
    for (let i = 0; i < xSize * zSize; i++) {
        compactHeightfield.cells[i] = {
            index: 0,
            count: 0,
        };
    }

    // Initialize spans
    for (let i = 0; i < spanCount; i++) {
        compactHeightfield.spans[i] = {
            y: 0,
            reg: 0,
            con: 0,
            h: 0,
        };
        compactHeightfield.areas[i] = NULL_AREA;
    }

    // Fill in cells and spans
    let currentCellIndex = 0;
    const numColumns = xSize * zSize;

    for (let columnIndex = 0; columnIndex < numColumns; ++columnIndex) {
        let span = heightfield.spans[columnIndex];

        // If there are no spans at this cell, just leave the data to index=0, count=0.
        if (span == null) {
            continue;
        }

        const cell = compactHeightfield.cells[columnIndex];
        cell.index = currentCellIndex;
        cell.count = 0;

        while (span != null) {
            if (span.area !== NULL_AREA) {
                const bot = span.max;
                const top = span.next ? span.next.min : MAX_HEIGHT;

                compactHeightfield.spans[currentCellIndex].y = Math.min(
                    Math.max(bot, 0),
                    0xffff,
                );
                compactHeightfield.spans[currentCellIndex].h = Math.min(
                    Math.max(top - bot, 0),
                    0xff,
                );
                compactHeightfield.areas[currentCellIndex] = span.area;

                currentCellIndex++;
                cell.count++;
            }
            span = span.next || null;
        }
    }

    // Find neighbour connections
    let maxLayerIndex = 0;
    const zStride = xSize; // for readability

    for (let z = 0; z < zSize; ++z) {
        for (let x = 0; x < xSize; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];

            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];

                for (let dir = 0; dir < 4; ++dir) {
                    setCon(span, dir, RC_NOT_CONNECTED);

                    const neighborX = x + DIR_OFFSETS[dir][0];
                    const neighborZ = z + DIR_OFFSETS[dir][1];

                    // First check that the neighbour cell is in bounds.
                    if (
                        neighborX < 0 ||
                        neighborZ < 0 ||
                        neighborX >= xSize ||
                        neighborZ >= zSize
                    ) {
                        continue;
                    }

                    // Iterate over all neighbour spans and check if any of them is
                    // accessible from current cell.
                    const neighborCell =
                        compactHeightfield.cells[
                            neighborX + neighborZ * zStride
                        ];

                    for (
                        let k = neighborCell.index;
                        k < neighborCell.index + neighborCell.count;
                        ++k
                    ) {
                        const neighborSpan = compactHeightfield.spans[k];
                        const bot = Math.max(span.y, neighborSpan.y);
                        const top = Math.min(
                            span.y + span.h,
                            neighborSpan.y + neighborSpan.h,
                        );

                        // Check that the gap between the spans is walkable,
                        // and that the climb height between the gaps is not too high.
                        if (
                            top - bot >= walkableHeightVoxels &&
                            Math.abs(neighborSpan.y - span.y) <=
                                walkableClimbVoxels
                        ) {
                            // Mark direction as walkable.
                            const layerIndex = k - neighborCell.index;
                            if (layerIndex < 0 || layerIndex > MAX_LAYERS) {
                                maxLayerIndex = Math.max(
                                    maxLayerIndex,
                                    layerIndex,
                                );
                                continue;
                            }
                            setCon(span, dir, layerIndex);
                            break;
                        }
                    }
                }
            }
        }
    }

    if (maxLayerIndex > MAX_LAYERS) {
        console.warn(
            `buildCompactHeightfield: Heightfield has too many layers ${maxLayerIndex} (max: ${MAX_LAYERS})`,
        );
    }

    return compactHeightfield;
};

export const erodeWalkableArea = (
    walkableRadiusVoxels: number,
    compactHeightfield: CompactHeightfield,
) => {
    const xSize = compactHeightfield.width;
    const zSize = compactHeightfield.height;
    const zStride = xSize; // For readability

    // Initialize distance array - 0xff means maximum distance (255)
    const distanceToBoundary = new Uint8Array(compactHeightfield.spanCount);
    distanceToBoundary.fill(0xff);

    // Mark boundary cells
    for (let z = 0; z < zSize; ++z) {
        for (let x = 0; x < xSize; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            for (
                let spanIndex = cell.index;
                spanIndex < cell.index + cell.count;
                ++spanIndex
            ) {
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    distanceToBoundary[spanIndex] = 0;
                    continue;
                }

                const span = compactHeightfield.spans[spanIndex];

                // Check that there is a non-null adjacent span in each of the 4 cardinal directions
                let neighborCount = 0;
                for (let direction = 0; direction < 4; ++direction) {
                    const neighborConnection = getCon(span, direction);
                    if (neighborConnection === RC_NOT_CONNECTED) {
                        break;
                    }

                    const neighborX = x + DIR_OFFSETS[direction][0];
                    const neighborZ = z + DIR_OFFSETS[direction][1];
                    const neighborSpanIndex =
                        compactHeightfield.cells[
                            neighborX + neighborZ * zStride
                        ].index + neighborConnection;

                    if (
                        compactHeightfield.areas[neighborSpanIndex] ===
                        NULL_AREA
                    ) {
                        break;
                    }
                    neighborCount++;
                }

                // At least one missing neighbour, so this is a boundary cell
                if (neighborCount !== 4) {
                    distanceToBoundary[spanIndex] = 0;
                }
            }
        }
    }

    // Pass 1: Forward pass (top-left to bottom-right)
    for (let z = 0; z < zSize; ++z) {
        for (let x = 0; x < xSize; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            const maxSpanIndex = cell.index + cell.count;

            for (
                let spanIndex = cell.index;
                spanIndex < maxSpanIndex;
                ++spanIndex
            ) {
                const span = compactHeightfield.spans[spanIndex];

                if (getCon(span, 0) !== RC_NOT_CONNECTED) {
                    // (-1,0) - West neighbor
                    const aX = x + DIR_OFFSETS[0][0];
                    const aY = z + DIR_OFFSETS[0][1];
                    const aIndex =
                        compactHeightfield.cells[aX + aY * xSize].index +
                        getCon(span, 0);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(
                        distanceToBoundary[aIndex] + 2,
                        255,
                    );
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (-1,-1) - Northwest diagonal
                    if (getCon(aSpan, 3) !== RC_NOT_CONNECTED) {
                        const bX = aX + DIR_OFFSETS[3][0];
                        const bY = aY + DIR_OFFSETS[3][1];
                        const bIndex =
                            compactHeightfield.cells[bX + bY * xSize].index +
                            getCon(aSpan, 3);
                        newDistance = Math.min(
                            distanceToBoundary[bIndex] + 3,
                            255,
                        );
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }

                if (getCon(span, 3) !== RC_NOT_CONNECTED) {
                    // (0,-1) - North neighbor
                    const aX = x + DIR_OFFSETS[3][0];
                    const aY = z + DIR_OFFSETS[3][1];
                    const aIndex =
                        compactHeightfield.cells[aX + aY * xSize].index +
                        getCon(span, 3);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(
                        distanceToBoundary[aIndex] + 2,
                        255,
                    );
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (1,-1) - Northeast diagonal
                    if (getCon(aSpan, 2) !== RC_NOT_CONNECTED) {
                        const bX = aX + DIR_OFFSETS[2][0];
                        const bY = aY + DIR_OFFSETS[2][1];
                        const bIndex =
                            compactHeightfield.cells[bX + bY * xSize].index +
                            getCon(aSpan, 2);
                        newDistance = Math.min(
                            distanceToBoundary[bIndex] + 3,
                            255,
                        );
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }
            }
        }
    }

    // Pass 2: Backward pass (bottom-right to top-left)
    for (let z = zSize - 1; z >= 0; --z) {
        for (let x = xSize - 1; x >= 0; --x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            const maxSpanIndex = cell.index + cell.count;

            for (
                let spanIndex = cell.index;
                spanIndex < maxSpanIndex;
                ++spanIndex
            ) {
                const span = compactHeightfield.spans[spanIndex];

                if (getCon(span, 2) !== RC_NOT_CONNECTED) {
                    // (1,0) - East neighbor
                    const aX = x + DIR_OFFSETS[2][0];
                    const aY = z + DIR_OFFSETS[2][1];
                    const aIndex =
                        compactHeightfield.cells[aX + aY * xSize].index +
                        getCon(span, 2);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(
                        distanceToBoundary[aIndex] + 2,
                        255,
                    );
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (1,1) - Southeast diagonal
                    if (getCon(aSpan, 1) !== RC_NOT_CONNECTED) {
                        const bX = aX + DIR_OFFSETS[1][0];
                        const bY = aY + DIR_OFFSETS[1][1];
                        const bIndex =
                            compactHeightfield.cells[bX + bY * xSize].index +
                            getCon(aSpan, 1);
                        newDistance = Math.min(
                            distanceToBoundary[bIndex] + 3,
                            255,
                        );
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }

                if (getCon(span, 1) !== RC_NOT_CONNECTED) {
                    // (0,1) - South neighbor
                    const aX = x + DIR_OFFSETS[1][0];
                    const aY = z + DIR_OFFSETS[1][1];
                    const aIndex =
                        compactHeightfield.cells[aX + aY * xSize].index +
                        getCon(span, 1);
                    const aSpan = compactHeightfield.spans[aIndex];
                    let newDistance = Math.min(
                        distanceToBoundary[aIndex] + 2,
                        255,
                    );
                    if (newDistance < distanceToBoundary[spanIndex]) {
                        distanceToBoundary[spanIndex] = newDistance;
                    }

                    // (-1,1) - Southwest diagonal
                    if (getCon(aSpan, 0) !== RC_NOT_CONNECTED) {
                        const bX = aX + DIR_OFFSETS[0][0];
                        const bY = aY + DIR_OFFSETS[0][1];
                        const bIndex =
                            compactHeightfield.cells[bX + bY * xSize].index +
                            getCon(aSpan, 0);
                        newDistance = Math.min(
                            distanceToBoundary[bIndex] + 3,
                            255,
                        );
                        if (newDistance < distanceToBoundary[spanIndex]) {
                            distanceToBoundary[spanIndex] = newDistance;
                        }
                    }
                }
            }
        }
    }

    // Erode areas that are too close to boundaries
    const minBoundaryDistance = walkableRadiusVoxels * 2;
    for (
        let spanIndex = 0;
        spanIndex < compactHeightfield.spanCount;
        ++spanIndex
    ) {
        if (distanceToBoundary[spanIndex] < minBoundaryDistance) {
            compactHeightfield.areas[spanIndex] = NULL_AREA;
        }
    }
};
