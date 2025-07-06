import { NULL_AREA } from './area';
import { DIR_OFFSETS } from './common';
import {
    type CompactHeightfield,
    getCon,
    NOT_CONNECTED,
} from './compact-heightfield';

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

export const buildRegions = (
    compactHeightfield: CompactHeightfield,
    borderSize: number,
    minRegionAre: number,
    mergeRegionArea: number,
) => {
    
}