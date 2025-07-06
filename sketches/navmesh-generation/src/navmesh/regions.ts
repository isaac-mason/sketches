import type { CompactHeightfield } from './compact-heightfield';
import { getCon, NOT_CONNECTED } from './compact-heightfield';
import { DIR_OFFSETS } from './common';

/**
 * Calculate distance field using a two-pass distance transform algorithm
 */
const calculateDistanceField = (
    compactHeightfield: CompactHeightfield,
    distances: number[],
): number => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    // Initialize distance values to maximum
    distances.fill(0xffff);

    // Mark boundary cells
    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];
                const area = compactHeightfield.areas[i];

                let neighborCount = 0;
                for (let dir = 0; dir < 4; ++dir) {
                    if (getCon(span, dir) !== NOT_CONNECTED) {
                        const ax = x + DIR_OFFSETS[dir][0];
                        const ay = y + DIR_OFFSETS[dir][1];
                        const ai =
                            compactHeightfield.cells[ax + ay * w].index +
                            getCon(span, dir);
                        if (area === compactHeightfield.areas[ai]) {
                            neighborCount++;
                        }
                    }
                }
                if (neighborCount !== 4) {
                    distances[i] = 0;
                }
            }
        }
    }

    // Pass 1: Forward pass
    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];

                if (getCon(span, 0) !== NOT_CONNECTED) {
                    // (-1,0) - West
                    const ax = x + DIR_OFFSETS[0][0];
                    const ay = y + DIR_OFFSETS[0][1];
                    const ai =
                        compactHeightfield.cells[ax + ay * w].index +
                        getCon(span, 0);
                    const aSpan = compactHeightfield.spans[ai];
                    if (distances[ai] + 2 < distances[i]) {
                        distances[i] = distances[ai] + 2;
                    }

                    // (-1,-1) - Northwest
                    if (getCon(aSpan, 3) !== NOT_CONNECTED) {
                        const aax = ax + DIR_OFFSETS[3][0];
                        const aay = ay + DIR_OFFSETS[3][1];
                        const aai =
                            compactHeightfield.cells[aax + aay * w].index +
                            getCon(aSpan, 3);
                        if (distances[aai] + 3 < distances[i]) {
                            distances[i] = distances[aai] + 3;
                        }
                    }
                }

                if (getCon(span, 3) !== NOT_CONNECTED) {
                    // (0,-1) - North
                    const ax = x + DIR_OFFSETS[3][0];
                    const ay = y + DIR_OFFSETS[3][1];
                    const ai =
                        compactHeightfield.cells[ax + ay * w].index +
                        getCon(span, 3);
                    const aSpan = compactHeightfield.spans[ai];
                    if (distances[ai] + 2 < distances[i]) {
                        distances[i] = distances[ai] + 2;
                    }

                    // (1,-1) - Northeast
                    if (getCon(aSpan, 2) !== NOT_CONNECTED) {
                        const aax = ax + DIR_OFFSETS[2][0];
                        const aay = ay + DIR_OFFSETS[2][1];
                        const aai =
                            compactHeightfield.cells[aax + aay * w].index +
                            getCon(aSpan, 2);
                        if (distances[aai] + 3 < distances[i]) {
                            distances[i] = distances[aai] + 3;
                        }
                    }
                }
            }
        }
    }

    // Pass 2: Backward pass
    for (let y = h - 1; y >= 0; --y) {
        for (let x = w - 1; x >= 0; --x) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];

                if (getCon(span, 2) !== NOT_CONNECTED) {
                    // (1,0) - East
                    const ax = x + DIR_OFFSETS[2][0];
                    const ay = y + DIR_OFFSETS[2][1];
                    const ai =
                        compactHeightfield.cells[ax + ay * w].index +
                        getCon(span, 2);
                    const aSpan = compactHeightfield.spans[ai];
                    if (distances[ai] + 2 < distances[i]) {
                        distances[i] = distances[ai] + 2;
                    }

                    // (1,1) - Southeast
                    if (getCon(aSpan, 1) !== NOT_CONNECTED) {
                        const aax = ax + DIR_OFFSETS[1][0];
                        const aay = ay + DIR_OFFSETS[1][1];
                        const aai =
                            compactHeightfield.cells[aax + aay * w].index +
                            getCon(aSpan, 1);
                        if (distances[aai] + 3 < distances[i]) {
                            distances[i] = distances[aai] + 3;
                        }
                    }
                }

                if (getCon(span, 1) !== NOT_CONNECTED) {
                    // (0,1) - South
                    const ax = x + DIR_OFFSETS[1][0];
                    const ay = y + DIR_OFFSETS[1][1];
                    const ai =
                        compactHeightfield.cells[ax + ay * w].index +
                        getCon(span, 1);
                    const aSpan = compactHeightfield.spans[ai];
                    if (distances[ai] + 2 < distances[i]) {
                        distances[i] = distances[ai] + 2;
                    }

                    // (-1,1) - Southwest
                    if (getCon(aSpan, 0) !== NOT_CONNECTED) {
                        const aax = ax + DIR_OFFSETS[0][0];
                        const aay = ay + DIR_OFFSETS[0][1];
                        const aai =
                            compactHeightfield.cells[aax + aay * w].index +
                            getCon(aSpan, 0);
                        if (distances[aai] + 3 < distances[i]) {
                            distances[i] = distances[aai] + 3;
                        }
                    }
                }
            }
        }
    }

    // Find maximum distance
    let maxDist = 0;
    for (let i = 0; i < compactHeightfield.spanCount; ++i) {
        maxDist = Math.max(distances[i], maxDist);
    }

    return maxDist;
};

/**
 * Apply box blur filter to smooth distance values
 */
const boxBlur = (
    compactHeightfield: CompactHeightfield,
    threshold: number,
    src: number[],
    dst: number[],
): number[] => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    const scaledThreshold = threshold * 2;

    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];
                const cd = src[i];

                if (cd <= scaledThreshold) {
                    dst[i] = cd;
                    continue;
                }

                let d = cd;
                for (let dir = 0; dir < 4; ++dir) {
                    if (getCon(span, dir) !== NOT_CONNECTED) {
                        const ax = x + DIR_OFFSETS[dir][0];
                        const ay = y + DIR_OFFSETS[dir][1];
                        const ai =
                            compactHeightfield.cells[ax + ay * w].index +
                            getCon(span, dir);
                        d += src[ai];

                        const aSpan = compactHeightfield.spans[ai];
                        const dir2 = (dir + 1) & 0x3;
                        if (getCon(aSpan, dir2) !== NOT_CONNECTED) {
                            const ax2 = ax + DIR_OFFSETS[dir2][0];
                            const ay2 = ay + DIR_OFFSETS[dir2][1];
                            const ai2 =
                                compactHeightfield.cells[ax2 + ay2 * w].index +
                                getCon(aSpan, dir2);
                            d += src[ai2];
                        } else {
                            d += cd;
                        }
                    } else {
                        d += cd * 2;
                    }
                }
                dst[i] = Math.floor((d + 5) / 9);
            }
        }
    }

    return dst;
};

export const buildDistanceField = (compactHeightfield: CompactHeightfield) => {
    // Create temporary array for blurring
    const dst = new Array(compactHeightfield.spanCount).fill(0);

    // Calculate distance field directly into the heightfield's distances array
    const maxDist = calculateDistanceField(
        compactHeightfield,
        compactHeightfield.distances,
    );
    compactHeightfield.maxDistance = maxDist;

    // Apply box blur
    const result = boxBlur(
        compactHeightfield,
        1,
        compactHeightfield.distances,
        dst,
    );

    // If the result is the destination array, copy it back to the heightfield
    if (result === dst) {
        for (let i = 0; i < compactHeightfield.spanCount; i++) {
            compactHeightfield.distances[i] = dst[i];
        }
    }
};
