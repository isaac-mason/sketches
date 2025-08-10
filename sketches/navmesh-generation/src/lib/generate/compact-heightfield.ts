import type { Box3 } from '@/common/maaths';
import { DIR_OFFSETS, MAX_HEIGHT, MAX_LAYERS, NOT_CONNECTED, NULL_AREA } from "./common";
import type { Heightfield } from './heightfield';

export type CompactHeightfieldSpan = {
    /** the lower extent of the span. measured from the heightfields base. */
    y: number;
    /** the id of the region the span belongs to, or zero if not in a region */
    region: number;
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
    /** array containing distance field data, size = spanCount */
    distances: number[];
};

/**
 * Helper function to set connection data in a span
 */
export const setCon = (
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
export const getCon = (span: CompactHeightfieldSpan, dir: number): number => {
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
        distances: new Array(spanCount).fill(0),
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
            region: 0,
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
    const zStride = xSize;

    for (let z = 0; z < zSize; ++z) {
        for (let x = 0; x < xSize; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];

            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];

                for (let dir = 0; dir < 4; ++dir) {
                    setCon(span, dir, NOT_CONNECTED);

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


const MAX_DISTANCE = 255;

export const erodeWalkableArea = (
    walkableRadiusVoxels: number,
    compactHeightfield: CompactHeightfield,
) => {
    const xSize = compactHeightfield.width;
    const zSize = compactHeightfield.height;
    const zStride = xSize; // for readability

    // Initialize distance array
    const distanceToBoundary = new Uint8Array(compactHeightfield.spanCount);
    distanceToBoundary.fill(MAX_DISTANCE);

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
                    if (neighborConnection === NOT_CONNECTED) {
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

                if (getCon(span, 0) !== NOT_CONNECTED) {
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
                    if (getCon(aSpan, 3) !== NOT_CONNECTED) {
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

                if (getCon(span, 3) !== NOT_CONNECTED) {
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
                    if (getCon(aSpan, 2) !== NOT_CONNECTED) {
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

                if (getCon(span, 2) !== NOT_CONNECTED) {
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
                    if (getCon(aSpan, 1) !== NOT_CONNECTED) {
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

                if (getCon(span, 1) !== NOT_CONNECTED) {
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
                    if (getCon(aSpan, 0) !== NOT_CONNECTED) {
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

/**
 * Helper function to test if a point is inside a polygon (2D)
 */
const pointInPoly = (numVerts: number, verts: number[], point: number[]): boolean => {
    let inside = false;
    let j = numVerts - 1;
    
    for (let i = 0; i < numVerts; j = i++) {
        const xi = verts[i * 3];     // x coordinate of vertex i
        const zi = verts[i * 3 + 2]; // z coordinate of vertex i
        const xj = verts[j * 3];     // x coordinate of vertex j
        const zj = verts[j * 3 + 2]; // z coordinate of vertex j
        
        if (((zi > point[2]) !== (zj > point[2])) &&
            (point[0] < (xj - xi) * (point[2] - zi) / (zj - zi) + xi)) {
            inside = !inside;
        }
    }
    
    return inside;
};

/**
 * Marks spans in the heightfield that intersect the specified box area with the given area ID.
 */
export const markBoxArea = (
    boxMinBounds: number[],
    boxMaxBounds: number[],
    areaId: number,
    compactHeightfield: CompactHeightfield,
) => {
    const xSize = compactHeightfield.width;
    const zSize = compactHeightfield.height;
    const zStride = xSize; // For readability

    // Find the footprint of the box area in grid cell coordinates.
    let minX = Math.floor((boxMinBounds[0] - compactHeightfield.bounds[0][0]) / compactHeightfield.cellSize);
    const minY = Math.floor((boxMinBounds[1] - compactHeightfield.bounds[0][1]) / compactHeightfield.cellHeight);
    let minZ = Math.floor((boxMinBounds[2] - compactHeightfield.bounds[0][2]) / compactHeightfield.cellSize);
    let maxX = Math.floor((boxMaxBounds[0] - compactHeightfield.bounds[0][0]) / compactHeightfield.cellSize);
    const maxY = Math.floor((boxMaxBounds[1] - compactHeightfield.bounds[0][1]) / compactHeightfield.cellHeight);
    let maxZ = Math.floor((boxMaxBounds[2] - compactHeightfield.bounds[0][2]) / compactHeightfield.cellSize);

    // Early-out if the box is outside the bounds of the grid.
    if (maxX < 0) return;
    if (minX >= xSize) return;
    if (maxZ < 0) return;
    if (minZ >= zSize) return;

    // Clamp relevant bound coordinates to the grid.
    if (minX < 0) minX = 0;
    if (maxX >= xSize) maxX = xSize - 1;
    if (minZ < 0) minZ = 0;
    if (maxZ >= zSize) maxZ = zSize - 1;

    // Mark relevant cells.
    for (let z = minZ; z <= maxZ; ++z) {
        for (let x = minX; x <= maxX; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            const maxSpanIndex = cell.index + cell.count;
            
            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // Skip if the span is outside the box extents.
                if (span.y < minY || span.y > maxY) {
                    continue;
                }

                // Skip if the span has been removed.
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // Mark the span.
                compactHeightfield.areas[spanIndex] = areaId;
            }
        }
    }
};

/**
 * Marks spans in the heightfield that intersect the specified convex polygon area with the given area ID.
 */
export const markPolyArea = (
    verts: number[],
    numVerts: number,
    minY: number,
    maxY: number,
    areaId: number,
    compactHeightfield: CompactHeightfield,
) => {
    const xSize = compactHeightfield.width;
    const zSize = compactHeightfield.height;
    const zStride = xSize; // For readability

    // Compute the bounding box of the polygon
    const bmin = [verts[0], minY, verts[2]];
    const bmax = [verts[0], maxY, verts[2]];
    
    for (let i = 1; i < numVerts; ++i) {
        const vertIndex = i * 3;
        bmin[0] = Math.min(bmin[0], verts[vertIndex]);
        bmin[2] = Math.min(bmin[2], verts[vertIndex + 2]);
        bmax[0] = Math.max(bmax[0], verts[vertIndex]);
        bmax[2] = Math.max(bmax[2], verts[vertIndex + 2]);
    }

    // Compute the grid footprint of the polygon
    let minx = Math.floor((bmin[0] - compactHeightfield.bounds[0][0]) / compactHeightfield.cellSize);
    const miny = Math.floor((bmin[1] - compactHeightfield.bounds[0][1]) / compactHeightfield.cellHeight);
    let minz = Math.floor((bmin[2] - compactHeightfield.bounds[0][2]) / compactHeightfield.cellSize);
    let maxx = Math.floor((bmax[0] - compactHeightfield.bounds[0][0]) / compactHeightfield.cellSize);
    const maxy = Math.floor((bmax[1] - compactHeightfield.bounds[0][1]) / compactHeightfield.cellHeight);
    let maxz = Math.floor((bmax[2] - compactHeightfield.bounds[0][2]) / compactHeightfield.cellSize);

    // Early-out if the polygon lies entirely outside the grid.
    if (maxx < 0) return;
    if (minx >= xSize) return;
    if (maxz < 0) return;
    if (minz >= zSize) return;

    // Clamp the polygon footprint to the grid
    if (minx < 0) minx = 0;
    if (maxx >= xSize) maxx = xSize - 1;
    if (minz < 0) minz = 0;
    if (maxz >= zSize) maxz = zSize - 1;

    // TODO: Optimize.
    for (let z = minz; z <= maxz; ++z) {
        for (let x = minx; x <= maxx; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            const maxSpanIndex = cell.index + cell.count;
            
            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];

                // Skip if span is removed.
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    continue;
                }

                // Skip if y extents don't overlap.
                if (span.y < miny || span.y > maxy) {
                    continue;
                }

                const point = [
                    compactHeightfield.bounds[0][0] + (x + 0.5) * compactHeightfield.cellSize,
                    0,
                    compactHeightfield.bounds[0][2] + (z + 0.5) * compactHeightfield.cellSize
                ];
                
                if (pointInPoly(numVerts, verts, point)) {
                    compactHeightfield.areas[spanIndex] = areaId;
                }
            }
        }
    }
};

/**
 * Helper function to perform insertion sort on a small array
 */
const insertSort = (arr: number[], length: number) => {
    for (let i = 1; i < length; ++i) {
        const key = arr[i];
        let j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
};

const _neighborAreas = new Array(9);

/**
 * Applies a median filter to walkable area types (based on area id), removing noise.
 * filter is usually applied after applying area id's using functions
 * such as #markBoxArea, #markConvexPolyArea, and #markCylinderArea.
 */
export const medianFilterWalkableArea = (compactHeightfield: CompactHeightfield): boolean => {
    const xSize = compactHeightfield.width;
    const zSize = compactHeightfield.height;
    const zStride = xSize; // For readability

    // Create a temporary array to store the filtered areas
    const areas = new Uint8Array(compactHeightfield.spanCount);
    areas.fill(0xff);

    for (let z = 0; z < zSize; ++z) {
        for (let x = 0; x < xSize; ++x) {
            const cell = compactHeightfield.cells[x + z * zStride];
            const maxSpanIndex = cell.index + cell.count;
            
            for (let spanIndex = cell.index; spanIndex < maxSpanIndex; ++spanIndex) {
                const span = compactHeightfield.spans[spanIndex];
                
                if (compactHeightfield.areas[spanIndex] === NULL_AREA) {
                    areas[spanIndex] = compactHeightfield.areas[spanIndex];
                    continue;
                }

                // Collect neighbor areas (including center cell)
                for (let neighborIndex = 0; neighborIndex < 9; ++neighborIndex) {
                    _neighborAreas[neighborIndex] = compactHeightfield.areas[spanIndex];
                }

                // Check all 4 cardinal directions
                for (let dir = 0; dir < 4; ++dir) {
                    if (getCon(span, dir) === NOT_CONNECTED) {
                        continue;
                    }
                    
                    const aX = x + DIR_OFFSETS[dir][0];
                    const aZ = z + DIR_OFFSETS[dir][1];
                    const aIndex = compactHeightfield.cells[aX + aZ * zStride].index + getCon(span, dir);
                    
                    if (compactHeightfield.areas[aIndex] !== NULL_AREA) {
                        _neighborAreas[dir * 2 + 0] = compactHeightfield.areas[aIndex];
                    }

                    // Check diagonal neighbor
                    const aSpan = compactHeightfield.spans[aIndex];
                    const dir2 = (dir + 1) & 0x3;
                    const neighborConnection2 = getCon(aSpan, dir2);
                    
                    if (neighborConnection2 !== NOT_CONNECTED) {
                        const bX = aX + DIR_OFFSETS[dir2][0];
                        const bZ = aZ + DIR_OFFSETS[dir2][1];
                        const bIndex = compactHeightfield.cells[bX + bZ * zStride].index + neighborConnection2;
                        
                        if (compactHeightfield.areas[bIndex] !== NULL_AREA) {
                            _neighborAreas[dir * 2 + 1] = compactHeightfield.areas[bIndex];
                        }
                    }
                }
                
                // Sort and take median (middle value)
                insertSort(_neighborAreas, 9);
                areas[spanIndex] = _neighborAreas[4];
            }
        }
    }

    // Copy filtered areas back to the heightfield
    for (let i = 0; i < compactHeightfield.spanCount; ++i) {
        compactHeightfield.areas[i] = areas[i];
    }

    return true;
};
