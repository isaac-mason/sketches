import { BuildContext, type BuildContextState } from './build-context';
import { NOT_CONNECTED } from './common';
import { BORDER_REG, DIR_OFFSETS } from './common';
import { NULL_AREA } from "./common";
import type { CompactHeightfield } from './compact-heightfield';
import { getCon } from './compact-heightfield';

const LOG_NB_STACKS = 3;
const NB_STACKS = 1 << LOG_NB_STACKS;
const EXPAND_ITERS = 8;

/**
 * Calculate distance field using a two-pass distance transform algorithm
 */
const calculateDistanceField = (
    compactHeightfield: CompactHeightfield,
    distances: number[],
): number => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    // initialize distance values to maximum
    distances.fill(0xffff);

    // mark boundary cells
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

    // pass 1: Forward pass
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

    // pass 2: Backward pass
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

    // find maximum distance
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
    srcDistances: number[],
    dstDistances: number[],
): void => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    const scaledThreshold = threshold * 2;

    for (let y = 0; y < h; ++y) {
        for (let x = 0; x < w; ++x) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; ++i) {
                const span = compactHeightfield.spans[i];
                const cd = srcDistances[i];

                if (cd <= scaledThreshold) {
                    dstDistances[i] = cd;
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
                        d += srcDistances[ai];

                        const aSpan = compactHeightfield.spans[ai];
                        const dir2 = (dir + 1) & 0x3;
                        if (getCon(aSpan, dir2) !== NOT_CONNECTED) {
                            const ax2 = ax + DIR_OFFSETS[dir2][0];
                            const ay2 = ay + DIR_OFFSETS[dir2][1];
                            const ai2 =
                                compactHeightfield.cells[ax2 + ay2 * w].index +
                                getCon(aSpan, dir2);
                            d += srcDistances[ai2];
                        } else {
                            d += cd;
                        }
                    } else {
                        d += cd * 2;
                    }
                }
                dstDistances[i] = Math.floor((d + 5) / 9);
            }
        }
    }
};

export const buildDistanceField = (compactHeightfield: CompactHeightfield): void => {
    // create temporary array for blurring
    const tempDistances = new Array(compactHeightfield.spanCount).fill(0);

    // calculate distance field directly into the heightfield's distances array
    const maxDist = calculateDistanceField(
        compactHeightfield,
        compactHeightfield.distances,
    );
    compactHeightfield.maxDistance = maxDist;

    // apply box blur
    boxBlur(compactHeightfield, 1, compactHeightfield.distances, tempDistances);

    // copy the box blur result back to the heightfield
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        compactHeightfield.distances[i] = tempDistances[i];
    }
};

type LevelStackEntry = {
    x: number;
    y: number;
    index: number;
};

export const buildRegions = (
    ctx: BuildContextState,
    compactHeightfield: CompactHeightfield,
    borderSize: number,
    minRegionArea: number,
    mergeRegionArea: number,
): boolean => {
    // region building constants
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    // initialize region and distance buffers
    const srcReg = new Array(compactHeightfield.spanCount).fill(0);
    const srcDist = new Array(compactHeightfield.spanCount).fill(0);

    let regionId = 1;
    let level = (compactHeightfield.maxDistance + 1) & ~1;

    // initialize level stacks
    const lvlStacks: LevelStackEntry[][] = [];
    for (let i = 0; i < NB_STACKS; i++) {
        lvlStacks[i] = [];
    }
    const stack: LevelStackEntry[] = [];

    // paint border regions if border size is specified
    if (borderSize > 0) {
        const bw = Math.min(w, borderSize);
        const bh = Math.min(h, borderSize);

        // paint border rectangles
        paintRectRegion(
            0,
            bw,
            0,
            h,
            regionId | BORDER_REG,
            compactHeightfield,
            srcReg,
        );
        regionId++;
        paintRectRegion(
            w - bw,
            w,
            0,
            h,
            regionId | BORDER_REG,
            compactHeightfield,
            srcReg,
        );
        regionId++;
        paintRectRegion(
            0,
            w,
            0,
            bh,
            regionId | BORDER_REG,
            compactHeightfield,
            srcReg,
        );
        regionId++;
        paintRectRegion(
            0,
            w,
            h - bh,
            h,
            regionId | BORDER_REG,
            compactHeightfield,
            srcReg,
        );
        regionId++;
    }

    compactHeightfield.borderSize = borderSize;

    let sId = -1;
    while (level > 0) {
        level = level >= 2 ? level - 2 : 0;
        sId = (sId + 1) & (NB_STACKS - 1);

        if (sId === 0) {
            sortCellsByLevel(
                level,
                compactHeightfield,
                srcReg,
                NB_STACKS,
                lvlStacks,
                1,
            );
        } else {
            appendStacks(lvlStacks[sId - 1], lvlStacks[sId], srcReg);
        }

        // expand current regions until no empty connected cells found
        expandRegions(
            EXPAND_ITERS,
            level,
            compactHeightfield,
            srcReg,
            srcDist,
            lvlStacks[sId],
            false,
        );

        // mark new regions with IDs
        for (let j = 0; j < lvlStacks[sId].length; j++) {
            const current = lvlStacks[sId][j];
            const x = current.x;
            const y = current.y;
            const i = current.index;

            if (i >= 0 && srcReg[i] === 0) {
                if (
                    floodRegion(
                        x,
                        y,
                        i,
                        level,
                        regionId,
                        compactHeightfield,
                        srcReg,
                        srcDist,
                        stack,
                    )
                ) {
                    if (regionId === 0xffff) {
                        BuildContext.error(ctx, "Region ID overflow");
                        return false;
                    }
                    regionId++;
                }
            }
        }
    }

    // expand current regions until no empty connected cells found
    expandRegions(
        EXPAND_ITERS * 8,
        0,
        compactHeightfield,
        srcReg,
        srcDist,
        stack,
        true,
    );

    // merge regions and filter out small regions
    const overlaps: number[] = [];
    compactHeightfield.maxRegions = regionId;

    if (
        !mergeAndFilterRegions(
            minRegionArea,
            mergeRegionArea,
            compactHeightfield,
            srcReg,
            overlaps,
        )
    ) {
        BuildContext.error(ctx, "Failed to merge and filter regions")
        return false;
    }

    // write the result to compact heightfield spans
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        compactHeightfield.spans[i].region = srcReg[i];
    }

    return true;
};

/**
 * Paint a rectangular region with the given region ID
 */
const paintRectRegion = (
    minx: number,
    maxx: number,
    miny: number,
    maxy: number,
    regId: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
) => {
    const w = compactHeightfield.width;
    for (let y = miny; y < maxy; y++) {
        for (let x = minx; x < maxx; x++) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; i++) {
                if (compactHeightfield.areas[i] !== NULL_AREA) {
                    srcReg[i] = regId;
                }
            }
        }
    }
};

/**
 * Sort cells by their distance level into stacks
 */
const sortCellsByLevel = (
    startLevel: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    nbStacks: number,
    stacks: { x: number; y: number; index: number }[][],
    logLevelsPerStack: number,
) => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;
    const adjustedStartLevel = startLevel >> logLevelsPerStack;

    // Clear all stacks
    for (let j = 0; j < nbStacks; j++) {
        stacks[j].length = 0;
    }

    // Put all cells in the level range into appropriate stacks
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; i++) {
                if (
                    compactHeightfield.areas[i] === NULL_AREA ||
                    srcReg[i] !== 0
                ) {
                    continue;
                }

                const level =
                    compactHeightfield.distances[i] >> logLevelsPerStack;
                let sId = adjustedStartLevel - level;
                if (sId >= nbStacks) {
                    continue;
                }
                if (sId < 0) {
                    sId = 0;
                }

                stacks[sId].push({ x, y, index: i });
            }
        }
    }
};

/**
 * Append entries from source stack to destination stack
 */
const appendStacks = (
    srcStack: { x: number; y: number; index: number }[],
    dstStack: { x: number; y: number; index: number }[],
    srcReg: number[],
) => {
    for (let j = 0; j < srcStack.length; j++) {
        const entry = srcStack[j];
        if (entry.index < 0 || srcReg[entry.index] !== 0) {
            continue;
        }
        dstStack.push(entry);
    }
};

/**
 * Flood fill a region starting from a given point
 */
const floodRegion = (
    x: number,
    y: number,
    i: number,
    level: number,
    r: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    srcDist: number[],
    stack: { x: number; y: number; index: number }[],
): boolean => {
    const w = compactHeightfield.width;
    const area = compactHeightfield.areas[i];

    // Flood fill mark region
    stack.length = 0;
    stack.push({ x, y, index: i });
    srcReg[i] = r;
    srcDist[i] = 0;

    const lev = level >= 2 ? level - 2 : 0;
    let count = 0;

    while (stack.length > 0) {
        const current = stack.pop()!;
        const cx = current.x;
        const cy = current.y;
        const ci = current.index;

        const span = compactHeightfield.spans[ci];

        // Check if any neighbors already have a valid region set
        let ar = 0;
        for (let dir = 0; dir < 4; dir++) {
            if (getCon(span, dir) !== NOT_CONNECTED) {
                const ax = cx + DIR_OFFSETS[dir][0];
                const ay = cy + DIR_OFFSETS[dir][1];
                const ai =
                    compactHeightfield.cells[ax + ay * w].index +
                    getCon(span, dir);

                if (compactHeightfield.areas[ai] !== area) {
                    continue;
                }

                const nr = srcReg[ai];
                if (nr & BORDER_REG) {
                    continue;
                }
                if (nr !== 0 && nr !== r) {
                    ar = nr;
                    break;
                }

                const aSpan = compactHeightfield.spans[ai];
                const dir2 = (dir + 1) & 0x3;
                if (getCon(aSpan, dir2) !== NOT_CONNECTED) {
                    const ax2 = ax + DIR_OFFSETS[dir2][0];
                    const ay2 = ay + DIR_OFFSETS[dir2][1];
                    const ai2 =
                        compactHeightfield.cells[ax2 + ay2 * w].index +
                        getCon(aSpan, dir2);

                    if (compactHeightfield.areas[ai2] !== area) {
                        continue;
                    }

                    const nr2 = srcReg[ai2];
                    if (nr2 !== 0 && nr2 !== r) {
                        ar = nr2;
                        break;
                    }
                }
            }
        }

        if (ar !== 0) {
            srcReg[ci] = 0;
            continue;
        }

        count++;

        // Expand neighbors
        for (let dir = 0; dir < 4; dir++) {
            if (getCon(span, dir) !== NOT_CONNECTED) {
                const ax = cx + DIR_OFFSETS[dir][0];
                const ay = cy + DIR_OFFSETS[dir][1];
                const ai =
                    compactHeightfield.cells[ax + ay * w].index +
                    getCon(span, dir);

                if (compactHeightfield.areas[ai] !== area) {
                    continue;
                }
                if (
                    compactHeightfield.distances[ai] >= lev &&
                    srcReg[ai] === 0
                ) {
                    srcReg[ai] = r;
                    srcDist[ai] = 0;
                    stack.push({ x: ax, y: ay, index: ai });
                }
            }
        }
    }

    return count > 0;
};

type DirtyEntry = {
    index: number;
    region: number;
    distance2: number;
};

/**
 * Expand regions iteratively
 */
const expandRegions = (
    maxIter: number,
    level: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    srcDist: number[],
    stack: { x: number; y: number; index: number }[],
    fillStack: boolean,
) => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;

    if (fillStack) {
        // Find cells revealed by the raised level
        stack.length = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const cell = compactHeightfield.cells[x + y * w];
                for (let i = cell.index; i < cell.index + cell.count; i++) {
                    if (
                        compactHeightfield.distances[i] >= level &&
                        srcReg[i] === 0 &&
                        compactHeightfield.areas[i] !== NULL_AREA
                    ) {
                        stack.push({ x, y, index: i });
                    }
                }
            }
        }
    } else {
        // Mark cells which already have a region
        for (let j = 0; j < stack.length; j++) {
            const i = stack[j].index;
            if (srcReg[i] !== 0) {
                stack[j].index = -1;
            }
        }
    }

    const dirtyEntries: DirtyEntry[] = [];
    let iter = 0;

    while (stack.length > 0) {
        let failed = 0;
        dirtyEntries.length = 0;

        for (let j = 0; j < stack.length; j++) {
            const x = stack[j].x;
            const y = stack[j].y;
            const i = stack[j].index;

            if (i < 0) {
                failed++;
                continue;
            }

            let r = srcReg[i];
            let d2 = 0xffff;
            const area = compactHeightfield.areas[i];
            const span = compactHeightfield.spans[i];

            for (let dir = 0; dir < 4; dir++) {
                if (getCon(span, dir) === NOT_CONNECTED) continue;

                const ax = x + DIR_OFFSETS[dir][0];
                const ay = y + DIR_OFFSETS[dir][1];
                const ai =
                    compactHeightfield.cells[ax + ay * w].index +
                    getCon(span, dir);

                if (compactHeightfield.areas[ai] !== area) continue;

                if (srcReg[ai] > 0 && (srcReg[ai] & BORDER_REG) === 0) {
                    if (srcDist[ai] + 2 < d2) {
                        r = srcReg[ai];
                        d2 = srcDist[ai] + 2;
                    }
                }
            }

            if (r) {
                stack[j].index = -1; // mark as used
                dirtyEntries.push({ index: i, region: r, distance2: d2 });
            } else {
                failed++;
            }
        }

        // Copy entries that differ to keep them in sync
        for (let i = 0; i < dirtyEntries.length; i++) {
            const entry = dirtyEntries[i];
            srcReg[entry.index] = entry.region;
            srcDist[entry.index] = entry.distance2;
        }

        if (failed === stack.length) {
            break;
        }

        if (level > 0) {
            iter++;
            if (iter >= maxIter) {
                break;
            }
        }
    }
};

/**
 * Region data structure for merging and filtering
 */
type Region = {
    spanCount: number;
    id: number;
    areaType: number;
    remap: boolean;
    visited: boolean;
    overlap: boolean;
    connectsToBorder: boolean;
    ymin: number;
    ymax: number;
    connections: number[];
    floors: number[];
};

/**
 * Merge and filter regions based on size criteria
 */
const mergeAndFilterRegions = (
    minRegionArea: number,
    mergeRegionSize: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    overlaps: number[],
): boolean => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;
    const nreg = compactHeightfield.maxRegions + 1;

    // Construct regions
    const regions: Region[] = [];
    for (let i = 0; i < nreg; i++) {
        regions.push({
            spanCount: 0,
            id: i,
            areaType: 0,
            remap: false,
            visited: false,
            overlap: false,
            connectsToBorder: false,
            ymin: 0xffff,
            ymax: 0,
            connections: [],
            floors: [],
        });
    }

    // Find edge of a region and find connections around the contour
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = compactHeightfield.cells[x + y * w];
            for (let i = cell.index; i < cell.index + cell.count; i++) {
                const r = srcReg[i];
                if (r === 0 || r >= nreg) continue;

                const reg = regions[r];
                reg.spanCount++;

                // Update floors
                for (let j = cell.index; j < cell.index + cell.count; j++) {
                    if (i === j) continue;
                    const floorId = srcReg[j];
                    if (floorId === 0 || floorId >= nreg) continue;
                    if (floorId === r) {
                        reg.overlap = true;
                    }
                    addUniqueFloorRegion(reg, floorId);
                }

                // Have found contour
                if (reg.connections.length > 0) continue;

                reg.areaType = compactHeightfield.areas[i];

                // Check if this cell is next to a border
                let ndir = -1;
                for (let dir = 0; dir < 4; dir++) {
                    if (isSolidEdge(compactHeightfield, srcReg, x, y, i, dir)) {
                        ndir = dir;
                        break;
                    }
                }

                if (ndir !== -1) {
                    // The cell is at border - walk around the contour to find all neighbors
                    walkContour(
                        x,
                        y,
                        i,
                        ndir,
                        compactHeightfield,
                        srcReg,
                        reg.connections,
                    );
                }
            }
        }
    }

    // Remove too small regions
    const stack: number[] = [];
    const trace: number[] = [];

    for (let i = 0; i < nreg; i++) {
        const reg = regions[i];
        if (reg.id === 0 || reg.id & BORDER_REG) continue;
        if (reg.spanCount === 0) continue;
        if (reg.visited) continue;

        // Count the total size of all connected regions
        let connectsToBorder = false;
        let spanCount = 0;
        stack.length = 0;
        trace.length = 0;

        reg.visited = true;
        stack.push(i);

        while (stack.length > 0) {
            const ri = stack.pop()!;
            const creg = regions[ri];

            spanCount += creg.spanCount;
            trace.push(ri);

            for (let j = 0; j < creg.connections.length; j++) {
                if (creg.connections[j] & BORDER_REG) {
                    connectsToBorder = true;
                    continue;
                }
                const neireg = regions[creg.connections[j]];
                if (neireg.visited) continue;
                if (neireg.id === 0 || neireg.id & BORDER_REG) continue;

                stack.push(neireg.id);
                neireg.visited = true;
            }
        }

        // If the accumulated region size is too small, remove it
        if (spanCount < minRegionArea && !connectsToBorder) {
            for (let j = 0; j < trace.length; j++) {
                regions[trace[j]].spanCount = 0;
                regions[trace[j]].id = 0;
            }
        }
    }

    // Merge too small regions to neighbor regions
    let mergeCount = 0;
    do {
        mergeCount = 0;
        for (let i = 0; i < nreg; i++) {
            const reg = regions[i];
            if (reg.id === 0 || reg.id & BORDER_REG) continue;
            if (reg.overlap) continue;
            if (reg.spanCount === 0) continue;

            // Check to see if the region should be merged
            if (
                reg.spanCount > mergeRegionSize &&
                isRegionConnectedToBorder(reg)
            ) {
                continue;
            }

            // Find smallest neighbor region that connects to this one
            let smallest = 0xfffffff;
            let mergeId = reg.id;
            for (let j = 0; j < reg.connections.length; j++) {
                if (reg.connections[j] & BORDER_REG) continue;
                const mreg = regions[reg.connections[j]];
                if (mreg.id === 0 || mreg.id & BORDER_REG || mreg.overlap)
                    continue;
                if (
                    mreg.spanCount < smallest &&
                    canMergeWithRegion(reg, mreg) &&
                    canMergeWithRegion(mreg, reg)
                ) {
                    smallest = mreg.spanCount;
                    mergeId = mreg.id;
                }
            }

            // Found new id
            if (mergeId !== reg.id) {
                const oldId = reg.id;
                const target = regions[mergeId];

                // Merge neighbors
                if (mergeRegions(target, reg)) {
                    // Fixup regions pointing to current region
                    for (let j = 0; j < nreg; j++) {
                        if (regions[j].id === 0 || regions[j].id & BORDER_REG)
                            continue;
                        if (regions[j].id === oldId) {
                            regions[j].id = mergeId;
                        }
                        replaceNeighbor(regions[j], oldId, mergeId);
                    }
                    mergeCount++;
                }
            }
        }
    } while (mergeCount > 0);

    // Compress region IDs
    for (let i = 0; i < nreg; i++) {
        regions[i].remap = false;
        if (regions[i].id === 0) continue;
        if (regions[i].id & BORDER_REG) continue;
        regions[i].remap = true;
    }

    let regIdGen = 0;
    for (let i = 0; i < nreg; i++) {
        if (!regions[i].remap) continue;
        const oldId = regions[i].id;
        const newId = ++regIdGen;
        for (let j = i; j < nreg; j++) {
            if (regions[j].id === oldId) {
                regions[j].id = newId;
                regions[j].remap = false;
            }
        }
    }
    compactHeightfield.maxRegions = regIdGen;

    // Remap regions
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        if ((srcReg[i] & BORDER_REG) === 0) {
            srcReg[i] = regions[srcReg[i]].id;
        }
    }

    // Return regions that we found to be overlapping
    for (let i = 0; i < nreg; i++) {
        if (regions[i].overlap) {
            overlaps.push(regions[i].id);
        }
    }

    return true;
};

// Helper functions for region merging and filtering

const addUniqueFloorRegion = (reg: Region, n: number) => {
    for (let i = 0; i < reg.floors.length; i++) {
        if (reg.floors[i] === n) return;
    }
    reg.floors.push(n);
};

const isRegionConnectedToBorder = (reg: Region): boolean => {
    for (let i = 0; i < reg.connections.length; i++) {
        if (reg.connections[i] === 0) return true;
    }
    return false;
};

const canMergeWithRegion = (rega: Region, regb: Region): boolean => {
    if (rega.areaType !== regb.areaType) return false;
    let n = 0;
    for (let i = 0; i < rega.connections.length; i++) {
        if (rega.connections[i] === regb.id) n++;
    }
    if (n > 1) return false;
    for (let i = 0; i < rega.floors.length; i++) {
        if (rega.floors[i] === regb.id) return false;
    }
    return true;
};

const mergeRegions = (rega: Region, regb: Region): boolean => {
    const aid = rega.id;
    const bid = regb.id;

    // Duplicate current neighborhood
    const acon = [...rega.connections];
    const bcon = regb.connections;

    // Find insertion point on A
    let insa = -1;
    for (let i = 0; i < acon.length; i++) {
        if (acon[i] === bid) {
            insa = i;
            break;
        }
    }
    if (insa === -1) return false;

    // Find insertion point on B
    let insb = -1;
    for (let i = 0; i < bcon.length; i++) {
        if (bcon[i] === aid) {
            insb = i;
            break;
        }
    }
    if (insb === -1) return false;

    // Merge neighbors
    rega.connections = [];
    for (let i = 0; i < acon.length - 1; i++) {
        rega.connections.push(acon[(insa + 1 + i) % acon.length]);
    }
    for (let i = 0; i < bcon.length - 1; i++) {
        rega.connections.push(bcon[(insb + 1 + i) % bcon.length]);
    }

    removeAdjacentNeighbors(rega);

    for (let j = 0; j < regb.floors.length; j++) {
        addUniqueFloorRegion(rega, regb.floors[j]);
    }
    rega.spanCount += regb.spanCount;
    regb.spanCount = 0;
    regb.connections = [];

    return true;
};

const removeAdjacentNeighbors = (reg: Region) => {
    // Remove adjacent duplicates
    for (
        let i = 0;
        i < reg.connections.length && reg.connections.length > 1;
    ) {
        const ni = (i + 1) % reg.connections.length;
        if (reg.connections[i] === reg.connections[ni]) {
            // Remove duplicate
            for (let j = i; j < reg.connections.length - 1; j++) {
                reg.connections[j] = reg.connections[j + 1];
            }
            reg.connections.pop();
        } else {
            i++;
        }
    }
};

const replaceNeighbor = (reg: Region, oldId: number, newId: number) => {
    let neiChanged = false;
    for (let i = 0; i < reg.connections.length; i++) {
        if (reg.connections[i] === oldId) {
            reg.connections[i] = newId;
            neiChanged = true;
        }
    }
    for (let i = 0; i < reg.floors.length; i++) {
        if (reg.floors[i] === oldId) {
            reg.floors[i] = newId;
        }
    }
    if (neiChanged) {
        removeAdjacentNeighbors(reg);
    }
};

const isSolidEdge = (
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    x: number,
    y: number,
    i: number,
    dir: number,
): boolean => {
    const span = compactHeightfield.spans[i];
    let r = 0;
    if (getCon(span, dir) !== NOT_CONNECTED) {
        const ax = x + DIR_OFFSETS[dir][0];
        const ay = y + DIR_OFFSETS[dir][1];
        const ai =
            compactHeightfield.cells[ax + ay * compactHeightfield.width].index +
            getCon(span, dir);
        r = srcReg[ai];
    }
    if (r === srcReg[i]) return false;
    return true;
};

const walkContour = (
    x: number,
    y: number,
    i: number,
    dir: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    cont: number[],
) => {
    const startDir = dir;
    const starti = i;

    const ss = compactHeightfield.spans[i];
    let curReg = 0;
    if (getCon(ss, dir) !== NOT_CONNECTED) {
        const ax = x + DIR_OFFSETS[dir][0];
        const ay = y + DIR_OFFSETS[dir][1];
        const ai =
            compactHeightfield.cells[ax + ay * compactHeightfield.width].index +
            getCon(ss, dir);
        curReg = srcReg[ai];
    }
    cont.push(curReg);

    let iter = 0;
    let currentX = x;
    let currentY = y;
    let currentI = i;
    let currentDir = dir;

    while (++iter < 40000) {
        const s = compactHeightfield.spans[currentI];

        if (
            isSolidEdge(
                compactHeightfield,
                srcReg,
                currentX,
                currentY,
                currentI,
                currentDir,
            )
        ) {
            // Choose the edge corner
            let r = 0;
            if (getCon(s, currentDir) !== NOT_CONNECTED) {
                const ax = currentX + DIR_OFFSETS[currentDir][0];
                const ay = currentY + DIR_OFFSETS[currentDir][1];
                const ai =
                    compactHeightfield.cells[ax + ay * compactHeightfield.width]
                        .index + getCon(s, currentDir);
                r = srcReg[ai];
            }
            if (r !== curReg) {
                curReg = r;
                cont.push(curReg);
            }

            currentDir = (currentDir + 1) & 0x3; // Rotate CW
        } else {
            let ni = -1;
            const nx = currentX + DIR_OFFSETS[currentDir][0];
            const ny = currentY + DIR_OFFSETS[currentDir][1];
            if (getCon(s, currentDir) !== NOT_CONNECTED) {
                const nc =
                    compactHeightfield.cells[
                        nx + ny * compactHeightfield.width
                    ];
                ni = nc.index + getCon(s, currentDir);
            }
            if (ni === -1) {
                // Should not happen
                return;
            }
            currentX = nx;
            currentY = ny;
            currentI = ni;
            currentDir = (currentDir + 3) & 0x3; // Rotate CCW
        }

        if (starti === currentI && startDir === currentDir) {
            break;
        }
    }

    // Remove adjacent duplicates
    if (cont.length > 1) {
        for (let j = 0; j < cont.length; ) {
            const nj = (j + 1) % cont.length;
            if (cont[j] === cont[nj]) {
                for (let k = j; k < cont.length - 1; k++) {
                    cont[k] = cont[k + 1];
                }
                cont.pop();
            } else {
                j++;
            }
        }
    }
};

const NULL_NEI = 0xffff;

type SweepSpan = {
    rid: number;    // row id
    id: number;     // region id
    ns: number;     // number samples
    nei: number;    // neighbour id
};

/**
 * Build regions using monotone partitioning algorithm.
 * This is an alternative to the watershed-based buildRegions function.
 * Monotone partitioning creates regions by sweeping the heightfield and
 * does not generate overlapping regions.
 */
export const buildRegionsMonotone = (
    compactHeightfield: CompactHeightfield,
    borderSize: number,
    minRegionArea: number,
    mergeRegionArea: number,
): boolean => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;
    let id = 1;

    const srcReg = new Array(compactHeightfield.spanCount).fill(0);
    const nsweeps = Math.max(compactHeightfield.width, compactHeightfield.height);
    const sweeps: SweepSpan[] = new Array(nsweeps);

    // Initialize sweeps array
    for (let i = 0; i < nsweeps; i++) {
        sweeps[i] = { rid: 0, id: 0, ns: 0, nei: 0 };
    }

    // Mark border regions
    if (borderSize > 0) {
        const bw = Math.min(w, borderSize);
        const bh = Math.min(h, borderSize);

        paintRectRegion(0, bw, 0, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(w - bw, w, 0, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(0, w, 0, bh, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(0, w, h - bh, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
    }

    compactHeightfield.borderSize = borderSize;

    const prev: number[] = new Array(256);

    // Sweep one line at a time
    for (let y = borderSize; y < h - borderSize; y++) {
        // Collect spans from this row
        if (prev.length < id + 1) {
            prev.length = id + 1;
        }
        prev.fill(0, 0, id);
        let rid = 1;

        for (let x = borderSize; x < w - borderSize; x++) {
            const cell = compactHeightfield.cells[x + y * w];

            for (let i = cell.index; i < cell.index + cell.count; i++) {
                const span = compactHeightfield.spans[i];
                if (compactHeightfield.areas[i] === NULL_AREA) continue;

                // Check -x direction
                let previd = 0;
                if (getCon(span, 0) !== NOT_CONNECTED) {
                    const ax = x + DIR_OFFSETS[0][0];
                    const ay = y + DIR_OFFSETS[0][1];
                    const ai = compactHeightfield.cells[ax + ay * w].index + getCon(span, 0);
                    if (
                        (srcReg[ai] & BORDER_REG) === 0 &&
                        compactHeightfield.areas[i] === compactHeightfield.areas[ai]
                    ) {
                        previd = srcReg[ai];
                    }
                }

                if (!previd) {
                    previd = rid++;
                    sweeps[previd].rid = previd;
                    sweeps[previd].ns = 0;
                    sweeps[previd].nei = 0;
                }

                // Check -y direction
                if (getCon(span, 3) !== NOT_CONNECTED) {
                    const ax = x + DIR_OFFSETS[3][0];
                    const ay = y + DIR_OFFSETS[3][1];
                    const ai = compactHeightfield.cells[ax + ay * w].index + getCon(span, 3);
                    if (
                        srcReg[ai] &&
                        (srcReg[ai] & BORDER_REG) === 0 &&
                        compactHeightfield.areas[i] === compactHeightfield.areas[ai]
                    ) {
                        const nr = srcReg[ai];
                        if (!sweeps[previd].nei || sweeps[previd].nei === nr) {
                            sweeps[previd].nei = nr;
                            sweeps[previd].ns++;
                            prev[nr]++;
                        } else {
                            sweeps[previd].nei = NULL_NEI;
                        }
                    }
                }

                srcReg[i] = previd;
            }
        }

        // Create unique ID
        for (let i = 1; i < rid; i++) {
            if (
                sweeps[i].nei !== NULL_NEI &&
                sweeps[i].nei !== 0 &&
                prev[sweeps[i].nei] === sweeps[i].ns
            ) {
                sweeps[i].id = sweeps[i].nei;
            } else {
                sweeps[i].id = id++;
            }
        }

        // Remap IDs
        for (let x = borderSize; x < w - borderSize; x++) {
            const cell = compactHeightfield.cells[x + y * w];

            for (let i = cell.index; i < cell.index + cell.count; i++) {
                if (srcReg[i] > 0 && srcReg[i] < rid) {
                    srcReg[i] = sweeps[srcReg[i]].id;
                }
            }
        }
    }

    // Merge regions and filter out small regions
    const overlaps: number[] = [];
    compactHeightfield.maxRegions = id;

    if (
        !mergeAndFilterRegions(
            minRegionArea,
            mergeRegionArea,
            compactHeightfield,
            srcReg,
            overlaps,
        )
    ) {
        return false;
    }

    // Store the result
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        compactHeightfield.spans[i].region = srcReg[i];
    }

    return true;
};

/**
 * Add unique connection to region
 */
const addUniqueConnection = (reg: Region, n: number) => {
    for (let i = 0; i < reg.connections.length; i++) {
        if (reg.connections[i] === n) return;
    }
    reg.connections.push(n);
};

/**
 * Merge and filter layer regions
 */
const mergeAndFilterLayerRegions = (
    minRegionArea: number,
    compactHeightfield: CompactHeightfield,
    srcReg: number[],
    maxRegionId: { value: number },
): boolean => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;
    const nreg = maxRegionId.value + 1;

    // Construct regions
    const regions: Region[] = [];
    for (let i = 0; i < nreg; i++) {
        regions.push({
            spanCount: 0,
            id: i,
            areaType: 0,
            remap: false,
            visited: false,
            overlap: false,
            connectsToBorder: false,
            ymin: 0xffff,
            ymax: 0,
            connections: [],
            floors: [],
        });
    }

    // Find region neighbours and overlapping regions
    const lregs: number[] = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const cell = compactHeightfield.cells[x + y * w];
            lregs.length = 0;

            for (let i = cell.index; i < cell.index + cell.count; i++) {
                const span = compactHeightfield.spans[i];
                const area = compactHeightfield.areas[i];
                const ri = srcReg[i];
                if (ri === 0 || ri >= nreg) continue;
                const reg = regions[ri];

                reg.spanCount++;
                reg.areaType = area;
                reg.ymin = Math.min(reg.ymin, span.y);
                reg.ymax = Math.max(reg.ymax, span.y);

                // Collect all region layers
                lregs.push(ri);

                // Update neighbours
                for (let dir = 0; dir < 4; dir++) {
                    if (getCon(span, dir) !== NOT_CONNECTED) {
                        const ax = x + DIR_OFFSETS[dir][0];
                        const ay = y + DIR_OFFSETS[dir][1];
                        const ai = compactHeightfield.cells[ax + ay * w].index + getCon(span, dir);
                        const rai = srcReg[ai];
                        if (rai > 0 && rai < nreg && rai !== ri) {
                            addUniqueConnection(reg, rai);
                        }
                        if (rai & BORDER_REG) {
                            reg.connectsToBorder = true;
                        }
                    }
                }
            }

            // Update overlapping regions
            for (let i = 0; i < lregs.length - 1; i++) {
                for (let j = i + 1; j < lregs.length; j++) {
                    if (lregs[i] !== lregs[j]) {
                        const ri = regions[lregs[i]];
                        const rj = regions[lregs[j]];
                        addUniqueFloorRegion(ri, lregs[j]);
                        addUniqueFloorRegion(rj, lregs[i]);
                    }
                }
            }
        }
    }

    // Create 2D layers from regions
    let layerId = 1;

    for (let i = 0; i < nreg; i++) {
        regions[i].id = 0;
    }

    // Merge monotone regions to create non-overlapping areas
    const stack: number[] = [];
    for (let i = 1; i < nreg; i++) {
        const root = regions[i];
        // Skip already visited
        if (root.id !== 0) continue;

        // Start search
        root.id = layerId;
        stack.length = 0;
        stack.push(i);

        while (stack.length > 0) {
            // Pop front
            const regIndex = stack.shift()!;
            const reg = regions[regIndex];

            const ncons = reg.connections.length;
            for (let j = 0; j < ncons; j++) {
                const nei = reg.connections[j];
                const regn = regions[nei];
                // Skip already visited
                if (regn.id !== 0) continue;
                // Skip if different area type
                if (reg.areaType !== regn.areaType) continue;
                // Skip if the neighbour is overlapping root region
                let overlap = false;
                for (let k = 0; k < root.floors.length; k++) {
                    if (root.floors[k] === nei) {
                        overlap = true;
                        break;
                    }
                }
                if (overlap) continue;

                // Deepen
                stack.push(nei);

                // Mark layer id
                regn.id = layerId;
                // Merge current layers to root
                for (let k = 0; k < regn.floors.length; k++) {
                    addUniqueFloorRegion(root, regn.floors[k]);
                }
                root.ymin = Math.min(root.ymin, regn.ymin);
                root.ymax = Math.max(root.ymax, regn.ymax);
                root.spanCount += regn.spanCount;
                regn.spanCount = 0;
                root.connectsToBorder = root.connectsToBorder || regn.connectsToBorder;
            }
        }

        layerId++;
    }

    // Remove small regions
    for (let i = 0; i < nreg; i++) {
        if (
            regions[i].spanCount > 0 &&
            regions[i].spanCount < minRegionArea &&
            !regions[i].connectsToBorder
        ) {
            const reg = regions[i].id;
            for (let j = 0; j < nreg; j++) {
                if (regions[j].id === reg) {
                    regions[j].id = 0;
                }
            }
        }
    }

    // Compress region IDs
    for (let i = 0; i < nreg; i++) {
        regions[i].remap = false;
        if (regions[i].id === 0) continue;
        if (regions[i].id & BORDER_REG) continue;
        regions[i].remap = true;
    }

    let regIdGen = 0;
    for (let i = 0; i < nreg; i++) {
        if (!regions[i].remap) continue;
        const oldId = regions[i].id;
        const newId = ++regIdGen;
        for (let j = i; j < nreg; j++) {
            if (regions[j].id === oldId) {
                regions[j].id = newId;
                regions[j].remap = false;
            }
        }
    }
    maxRegionId.value = regIdGen;

    // Remap regions
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        if ((srcReg[i] & BORDER_REG) === 0) {
            srcReg[i] = regions[srcReg[i]].id;
        }
    }

    return true;
};

/**
 * Build layer regions using sweep-line algorithm.
 * This creates regions that can be used for building navigation mesh layers.
 * Layer regions handle overlapping walkable areas by creating separate layers.
 */
export const buildLayerRegions = (
    compactHeightfield: CompactHeightfield,
    borderSize: number,
    minRegionArea: number,
): boolean => {
    const w = compactHeightfield.width;
    const h = compactHeightfield.height;
    let id = 1;

    const srcReg = new Array(compactHeightfield.spanCount).fill(0);
    const nsweeps = Math.max(compactHeightfield.width, compactHeightfield.height);
    const sweeps: SweepSpan[] = new Array(nsweeps);

    // Initialize sweeps array
    for (let i = 0; i < nsweeps; i++) {
        sweeps[i] = { rid: 0, id: 0, ns: 0, nei: 0 };
    }

    // Mark border regions
    if (borderSize > 0) {
        const bw = Math.min(w, borderSize);
        const bh = Math.min(h, borderSize);

        paintRectRegion(0, bw, 0, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(w - bw, w, 0, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(0, w, 0, bh, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
        paintRectRegion(0, w, h - bh, h, id | BORDER_REG, compactHeightfield, srcReg);
        id++;
    }

    compactHeightfield.borderSize = borderSize;

    const prev: number[] = new Array(256);

    // Sweep one line at a time
    for (let y = borderSize; y < h - borderSize; y++) {
        // Collect spans from this row
        if (prev.length < id + 1) {
            prev.length = id + 1;
        }
        prev.fill(0, 0, id);
        let rid = 1;

        for (let x = borderSize; x < w - borderSize; x++) {
            const cell = compactHeightfield.cells[x + y * w];

            for (let i = cell.index; i < cell.index + cell.count; i++) {
                const span = compactHeightfield.spans[i];
                if (compactHeightfield.areas[i] === NULL_AREA) continue;

                // Check -x direction
                let previd = 0;
                if (getCon(span, 0) !== NOT_CONNECTED) {
                    const ax = x + DIR_OFFSETS[0][0];
                    const ay = y + DIR_OFFSETS[0][1];
                    const ai = compactHeightfield.cells[ax + ay * w].index + getCon(span, 0);
                    if (
                        (srcReg[ai] & BORDER_REG) === 0 &&
                        compactHeightfield.areas[i] === compactHeightfield.areas[ai]
                    ) {
                        previd = srcReg[ai];
                    }
                }

                if (!previd) {
                    previd = rid++;
                    sweeps[previd].rid = previd;
                    sweeps[previd].ns = 0;
                    sweeps[previd].nei = 0;
                }

                // Check -y direction
                if (getCon(span, 3) !== NOT_CONNECTED) {
                    const ax = x + DIR_OFFSETS[3][0];
                    const ay = y + DIR_OFFSETS[3][1];
                    const ai = compactHeightfield.cells[ax + ay * w].index + getCon(span, 3);
                    if (
                        srcReg[ai] &&
                        (srcReg[ai] & BORDER_REG) === 0 &&
                        compactHeightfield.areas[i] === compactHeightfield.areas[ai]
                    ) {
                        const nr = srcReg[ai];
                        if (!sweeps[previd].nei || sweeps[previd].nei === nr) {
                            sweeps[previd].nei = nr;
                            sweeps[previd].ns++;
                            prev[nr]++;
                        } else {
                            sweeps[previd].nei = NULL_NEI;
                        }
                    }
                }

                srcReg[i] = previd;
            }
        }

        // Create unique ID
        for (let i = 1; i < rid; i++) {
            if (
                sweeps[i].nei !== NULL_NEI &&
                sweeps[i].nei !== 0 &&
                prev[sweeps[i].nei] === sweeps[i].ns
            ) {
                sweeps[i].id = sweeps[i].nei;
            } else {
                sweeps[i].id = id++;
            }
        }

        // Remap IDs
        for (let x = borderSize; x < w - borderSize; x++) {
            const cell = compactHeightfield.cells[x + y * w];

            for (let i = cell.index; i < cell.index + cell.count; i++) {
                if (srcReg[i] > 0 && srcReg[i] < rid) {
                    srcReg[i] = sweeps[srcReg[i]].id;
                }
            }
        }
    }

    // Merge monotone regions to layers and remove small regions
    compactHeightfield.maxRegions = id;
    const maxRegionIdRef = { value: compactHeightfield.maxRegions };
    
    if (!mergeAndFilterLayerRegions(minRegionArea, compactHeightfield, srcReg, maxRegionIdRef)) {
        return false;
    }
    
    compactHeightfield.maxRegions = maxRegionIdRef.value;

    // Store the result
    for (let i = 0; i < compactHeightfield.spanCount; i++) {
        compactHeightfield.spans[i].region = srcReg[i];
    }

    return true;
};
