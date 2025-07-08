import type { Box3 } from '@/common/maaths';
import { AREA_BORDER, BORDER_VERTEX, CONTOUR_REG_MASK, NOT_CONNECTED } from './common';
import { BORDER_REG } from './common';
import { getDirOffsetX, getDirOffsetY } from './common';
import type { CompactHeightfield } from './compact-heightfield';
import { getCon } from './compact-heightfield';

// Maximum number of iterations for contour walking to prevent infinite loops
const MAX_CONTOUR_WALK_ITERATIONS = 40000;

export type Contour = {
    /** simplified contour vertex and connection data. size: 4 * nVerts */
    vertices: number[];
    /** the number of vertices in the simplified contour */
    nVertices: number;
    /** raw contour vertex and connection data */
    rawVertices: number[];
    /** the number of vertices in the raw contour */
    nRawVertices: number;
    /** the region id of the contour */
    reg: number;
    /** the area id of the contour */
    area: number;
};

export type ContourSet = {
    /** an array of the contours in the set */
    contours: Contour[];
    /** the bounds in world space */
    bounds: Box3;
    /** the size of each cell */
    cellSize: number;
    /** the height of each cell */
    cellHeight: number;
    /** the width of the set */
    width: number;
    /** the height of the set */
    height: number;
    /**the aabb border size used to generate the source data that the contour set was derived from */
    borderSize: number;
    /** the max edge error that this contour set was simplified with */
    maxError: number;
};

export enum ContourBuildFlags {
    /** tessellate solid (impassable) edges during contour simplification */
    CONTOUR_TESS_WALL_EDGES = 0x01,
    /** tessellate edges between areas during contour simplification */
    CONTOUR_TESS_AREA_EDGES = 0x02,
}

// Helper function to get corner height
const getCornerHeight = (
    x: number,
    y: number,
    i: number,
    dir: number,
    chf: CompactHeightfield,
    isBorderVertex: { value: boolean },
): number => {
    const s = chf.spans[i];
    let ch = s.y;
    const dirp = (dir + 1) & 0x3;

    const regs = new Array(4).fill(0);

    // Combine region and area codes in order to prevent
    // border vertices which are in between two areas to be removed.
    regs[0] = chf.spans[i].region | (chf.areas[i] << 16);

    if (getCon(s, dir) !== NOT_CONNECTED) {
        const ax = x + getDirOffsetX(dir);
        const ay = y + getDirOffsetY(dir);
        const ai = chf.cells[ax + ay * chf.width].index + getCon(s, dir);
        const as = chf.spans[ai];
        ch = Math.max(ch, as.y);
        regs[1] = chf.spans[ai].region | (chf.areas[ai] << 16);
        if (getCon(as, dirp) !== NOT_CONNECTED) {
            const ax2 = ax + getDirOffsetX(dirp);
            const ay2 = ay + getDirOffsetY(dirp);
            const ai2 =
                chf.cells[ax2 + ay2 * chf.width].index + getCon(as, dirp);
            const as2 = chf.spans[ai2];
            ch = Math.max(ch, as2.y);
            regs[2] = chf.spans[ai2].region | (chf.areas[ai2] << 16);
        }
    }
    if (getCon(s, dirp) !== NOT_CONNECTED) {
        const ax = x + getDirOffsetX(dirp);
        const ay = y + getDirOffsetY(dirp);
        const ai = chf.cells[ax + ay * chf.width].index + getCon(s, dirp);
        const as = chf.spans[ai];
        ch = Math.max(ch, as.y);
        regs[3] = chf.spans[ai].region | (chf.areas[ai] << 16);
        if (getCon(as, dir) !== NOT_CONNECTED) {
            const ax2 = ax + getDirOffsetX(dir);
            const ay2 = ay + getDirOffsetY(dir);
            const ai2 =
                chf.cells[ax2 + ay2 * chf.width].index + getCon(as, dir);
            const as2 = chf.spans[ai2];
            ch = Math.max(ch, as2.y);
            regs[2] = chf.spans[ai2].region | (chf.areas[ai2] << 16);
        }
    }

    // Check if the vertex is special edge vertex, these vertices will be removed later.
    for (let j = 0; j < 4; ++j) {
        const a = j;
        const b = (j + 1) & 0x3;
        const c = (j + 2) & 0x3;
        const d = (j + 3) & 0x3;

        // The vertex is a border vertex there are two same exterior cells in a row,
        // followed by two interior cells and none of the regions are out of bounds.
        const twoSameExts =
            (regs[a] & regs[b] & BORDER_REG) !== 0 && regs[a] === regs[b];
        const twoInts = ((regs[c] | regs[d]) & BORDER_REG) === 0;
        const intsSameArea = regs[c] >> 16 === regs[d] >> 16;
        const noZeros =
            regs[a] !== 0 && regs[b] !== 0 && regs[c] !== 0 && regs[d] !== 0;
        if (twoSameExts && twoInts && intsSameArea && noZeros) {
            isBorderVertex.value = true;
            break;
        }
    }

    return ch;
};

// Helper function to walk contour
const walkContour = (
    x: number,
    y: number,
    i: number,
    chf: CompactHeightfield,
    flags: number[],
    points: number[],
): void => {
    // Choose the first non-connected edge
    let dir = 0;
    while ((flags[i] & (1 << dir)) === 0) {
        dir++;
    }

    const startDir = dir;
    const starti = i;

    const area = chf.areas[i];

    let iter = 0;
    let currentX = x;
    let currentY = y;
    let currentI = i;

    while (++iter < MAX_CONTOUR_WALK_ITERATIONS) {
        if (flags[currentI] & (1 << dir)) {
            // Choose the edge corner
            const isBorderVertex = { value: false };
            let isAreaBorder = false;
            let px = currentX;
            const py = getCornerHeight(
                currentX,
                currentY,
                currentI,
                dir,
                chf,
                isBorderVertex,
            );
            let pz = currentY;
            switch (dir) {
                case 0:
                    pz++;
                    break;
                case 1:
                    px++;
                    pz++;
                    break;
                case 2:
                    px++;
                    break;
            }
            let r = 0;
            const s = chf.spans[currentI];
            if (getCon(s, dir) !== NOT_CONNECTED) {
                const ax = currentX + getDirOffsetX(dir);
                const ay = currentY + getDirOffsetY(dir);
                const ai =
                    chf.cells[ax + ay * chf.width].index + getCon(s, dir);
                r = chf.spans[ai].region;
                if (area !== chf.areas[ai]) {
                    isAreaBorder = true;
                }
            }
            if (isBorderVertex.value) {
                r |= BORDER_VERTEX;
            }
            if (isAreaBorder) {
                r |= AREA_BORDER;
            }
            points.push(px);
            points.push(py);
            points.push(pz);
            points.push(r);

            flags[currentI] &= ~(1 << dir); // Remove visited edges
            dir = (dir + 1) & 0x3; // Rotate CW
        } else {
            let ni = -1;
            const nx = currentX + getDirOffsetX(dir);
            const ny = currentY + getDirOffsetY(dir);
            const s = chf.spans[currentI];
            if (getCon(s, dir) !== NOT_CONNECTED) {
                const nc = chf.cells[nx + ny * chf.width];
                ni = nc.index + getCon(s, dir);
            }
            if (ni === -1) {
                // Should not happen.
                return;
            }
            currentX = nx;
            currentY = ny;
            currentI = ni;
            dir = (dir + 3) & 0x3; // Rotate CCW
        }

        if (starti === currentI && startDir === dir) {
            break;
        }
    }
};

// Helper function to calculate distance from point to line segment
const distancePtSeg = (
    x: number,
    z: number,
    px: number,
    pz: number,
    qx: number,
    qz: number,
): number => {
    const pqx = qx - px;
    const pqz = qz - pz;
    const dx = x - px;
    const dz = z - pz;
    const d = pqx * pqx + pqz * pqz;
    let t = pqx * dx + pqz * dz;
    if (d > 0) {
        t /= d;
    }
    if (t < 0) {
        t = 0;
    } else if (t > 1) {
        t = 1;
    }

    const finalDx = px + t * pqx - x;
    const finalDz = pz + t * pqz - z;

    return finalDx * finalDx + finalDz * finalDz;
};

// Helper function to simplify contour
const simplifyContour = (
    points: number[],
    simplified: number[],
    maxError: number,
    maxEdgeLen: number,
    buildFlags: ContourBuildFlags,
): void => {
    // Add initial points.
    let hasConnections = false;
    for (let i = 0; i < points.length; i += 4) {
        if ((points[i + 3] & CONTOUR_REG_MASK) !== 0) {
            hasConnections = true;
            break;
        }
    }

    if (hasConnections) {
        // The contour has some portals to other regions.
        // Add a new point to every location where the region changes.
        for (let i = 0, ni = Math.floor(points.length / 4); i < ni; ++i) {
            const ii = (i + 1) % ni;
            const differentRegs =
                (points[i * 4 + 3] & CONTOUR_REG_MASK) !==
                (points[ii * 4 + 3] & CONTOUR_REG_MASK);
            const areaBorders =
                (points[i * 4 + 3] & AREA_BORDER) !==
                (points[ii * 4 + 3] & AREA_BORDER);
            if (differentRegs || areaBorders) {
                simplified.push(points[i * 4 + 0]);
                simplified.push(points[i * 4 + 1]);
                simplified.push(points[i * 4 + 2]);
                simplified.push(i);
            }
        }
    }

    if (simplified.length === 0) {
        // If there is no connections at all,
        // create some initial points for the simplification process.
        // Find lower-left and upper-right vertices of the contour.
        let llx = points[0];
        let lly = points[1];
        let llz = points[2];
        let lli = 0;
        let urx = points[0];
        let ury = points[1];
        let urz = points[2];
        let uri = 0;
        for (let i = 0; i < points.length; i += 4) {
            const x = points[i + 0];
            const y = points[i + 1];
            const z = points[i + 2];
            if (x < llx || (x === llx && z < llz)) {
                llx = x;
                lly = y;
                llz = z;
                lli = Math.floor(i / 4);
            }
            if (x > urx || (x === urx && z > urz)) {
                urx = x;
                ury = y;
                urz = z;
                uri = Math.floor(i / 4);
            }
        }
        simplified.push(llx);
        simplified.push(lly);
        simplified.push(llz);
        simplified.push(lli);

        simplified.push(urx);
        simplified.push(ury);
        simplified.push(urz);
        simplified.push(uri);
    }

    // Add points until all raw points are within
    // error tolerance to the simplified shape.
    const pn = Math.floor(points.length / 4);
    for (let i = 0; i < Math.floor(simplified.length / 4); ) {
        const ii = (i + 1) % Math.floor(simplified.length / 4);

        const ax = simplified[i * 4 + 0];
        const az = simplified[i * 4 + 2];
        const ai = simplified[i * 4 + 3];

        const bx = simplified[ii * 4 + 0];
        const bz = simplified[ii * 4 + 2];
        const bi = simplified[ii * 4 + 3];

        // Find maximum deviation from the segment.
        let maxd = 0;
        let maxi = -1;
        let ci: number;
        let cinc: number;
        let endi: number;

        // Traverse the segment in lexilogical order so that the
        // max deviation is calculated similarly when traversing
        // opposite segments.
        let segAx = ax;
        let segAz = az;
        let segBx = bx;
        let segBz = bz;
        if (bx > ax || (bx === ax && bz > az)) {
            cinc = 1;
            ci = (ai + cinc) % pn;
            endi = bi;
        } else {
            cinc = pn - 1;
            ci = (bi + cinc) % pn;
            endi = ai;
            // Swap ax, bx and az, bz
            segAx = bx;
            segBx = ax;
            segAz = bz;
            segBz = az;
        }

        // Tessellate only outer edges or edges between areas.
        if (
            (points[ci * 4 + 3] & CONTOUR_REG_MASK) === 0 ||
            points[ci * 4 + 3] & AREA_BORDER
        ) {
            while (ci !== endi) {
                const d = distancePtSeg(
                    points[ci * 4 + 0],
                    points[ci * 4 + 2],
                    segAx,
                    segAz,
                    segBx,
                    segBz,
                );
                if (d > maxd) {
                    maxd = d;
                    maxi = ci;
                }
                ci = (ci + cinc) % pn;
            }
        }

        // If the max deviation is larger than accepted error,
        // add new point, else continue to next segment.
        if (maxi !== -1 && maxd > maxError * maxError) {
            // Add space for the new point.
            const oldLength = simplified.length;
            simplified.length = oldLength + 4;
            const n = Math.floor(simplified.length / 4);
            for (let j = n - 1; j > i + 1; --j) {
                simplified[j * 4 + 0] = simplified[(j - 1) * 4 + 0];
                simplified[j * 4 + 1] = simplified[(j - 1) * 4 + 1];
                simplified[j * 4 + 2] = simplified[(j - 1) * 4 + 2];
                simplified[j * 4 + 3] = simplified[(j - 1) * 4 + 3];
            }
            // Add the point.
            simplified[(i + 1) * 4 + 0] = points[maxi * 4 + 0];
            simplified[(i + 1) * 4 + 1] = points[maxi * 4 + 1];
            simplified[(i + 1) * 4 + 2] = points[maxi * 4 + 2];
            simplified[(i + 1) * 4 + 3] = maxi;
        } else {
            ++i;
        }
    }

    // Split too long edges.
    if (
        maxEdgeLen > 0 &&
        (buildFlags &
            (ContourBuildFlags.CONTOUR_TESS_WALL_EDGES |
                ContourBuildFlags.CONTOUR_TESS_AREA_EDGES)) !==
            0
    ) {
        for (let i = 0; i < Math.floor(simplified.length / 4); ) {
            const ii = (i + 1) % Math.floor(simplified.length / 4);

            const ax = simplified[i * 4 + 0];
            const az = simplified[i * 4 + 2];
            const ai = simplified[i * 4 + 3];

            const bx = simplified[ii * 4 + 0];
            const bz = simplified[ii * 4 + 2];
            const bi = simplified[ii * 4 + 3];

            // Find maximum deviation from the segment.
            let maxi = -1;
            const ci = (ai + 1) % pn;

            // Tessellate only outer edges or edges between areas.
            let tess = false;
            // Wall edges.
            if (
                buildFlags & ContourBuildFlags.CONTOUR_TESS_WALL_EDGES &&
                (points[ci * 4 + 3] & CONTOUR_REG_MASK) === 0
            ) {
                tess = true;
            }
            // Edges between areas.
            if (
                buildFlags & ContourBuildFlags.CONTOUR_TESS_AREA_EDGES &&
                points[ci * 4 + 3] & AREA_BORDER
            ) {
                tess = true;
            }

            if (tess) {
                const dx = bx - ax;
                const dz = bz - az;
                if (dx * dx + dz * dz > maxEdgeLen * maxEdgeLen) {
                    // Round based on the segments in lexilogical order so that the
                    // max tesselation is consistent regardless in which direction
                    // segments are traversed.
                    const n = bi < ai ? bi + pn - ai : bi - ai;
                    if (n > 1) {
                        if (bx > ax || (bx === ax && bz > az)) {
                            maxi = (ai + Math.floor(n / 2)) % pn;
                        } else {
                            maxi = (ai + Math.floor((n + 1) / 2)) % pn;
                        }
                    }
                }
            }

            // If the max deviation is larger than accepted error,
            // add new point, else continue to next segment.
            if (maxi !== -1) {
                // Add space for the new point.
                const oldLength = simplified.length;
                simplified.length = oldLength + 4;
                const n = Math.floor(simplified.length / 4);
                for (let j = n - 1; j > i + 1; --j) {
                    simplified[j * 4 + 0] = simplified[(j - 1) * 4 + 0];
                    simplified[j * 4 + 1] = simplified[(j - 1) * 4 + 1];
                    simplified[j * 4 + 2] = simplified[(j - 1) * 4 + 2];
                    simplified[j * 4 + 3] = simplified[(j - 1) * 4 + 3];
                }
                // Add the point.
                simplified[(i + 1) * 4 + 0] = points[maxi * 4 + 0];
                simplified[(i + 1) * 4 + 1] = points[maxi * 4 + 1];
                simplified[(i + 1) * 4 + 2] = points[maxi * 4 + 2];
                simplified[(i + 1) * 4 + 3] = maxi;
            } else {
                ++i;
            }
        }
    }

    for (let i = 0; i < Math.floor(simplified.length / 4); ++i) {
        // The edge vertex flag is take from the current raw point,
        // and the neighbour region is take from the next raw point.
        const ai = (simplified[i * 4 + 3] + 1) % pn;
        const bi = simplified[i * 4 + 3];
        simplified[i * 4 + 3] =
            (points[ai * 4 + 3] & (CONTOUR_REG_MASK | AREA_BORDER)) |
            (points[bi * 4 + 3] & BORDER_VERTEX);
    }
};

// Helper function to calculate area of polygon
const calcAreaOfPolygon2D = (verts: number[], nverts: number): number => {
    let area = 0;
    for (let i = 0, j = nverts - 1; i < nverts; j = i++) {
        const vi = i * 4;
        const vj = j * 4;
        area += verts[vi] * verts[vj + 2] - verts[vj] * verts[vi + 2];
    }
    return Math.floor((area + 1) / 2);
};

// Helper functions for polygon operations
const prev = (i: number, n: number): number => (i - 1 >= 0 ? i - 1 : n - 1);
const next = (i: number, n: number): number => (i + 1 < n ? i + 1 : 0);

const area2 = (
    verticesA: number[],
    startVertexIdx: number,
    endVertexIdx: number,
    verticesB: number[],
    testVertexIdx: number,
): number => {
    const startOffset = startVertexIdx * 4;
    const endOffset = endVertexIdx * 4;
    const testOffset = testVertexIdx * 4;
    return (
        (verticesA[endOffset] - verticesA[startOffset]) *
            (verticesB[testOffset + 2] - verticesA[startOffset + 2]) -
        (verticesB[testOffset] - verticesA[startOffset]) *
            (verticesA[endOffset + 2] - verticesA[startOffset + 2])
    );
};

const xorb = (x: boolean, y: boolean): boolean => {
    return !x !== !y;
};

const left = (
    verticesA: number[],
    startVertexIdx: number,
    endVertexIdx: number,
    verticesB: number[],
    testVertexIdx: number,
): boolean => {
    return (
        area2(
            verticesA,
            startVertexIdx,
            endVertexIdx,
            verticesB,
            testVertexIdx,
        ) < 0
    );
};

const leftOn = (
    verticesA: number[],
    startVertexIdx: number,
    endVertexIdx: number,
    verticesB: number[],
    testVertexIdx: number,
): boolean => {
    return (
        area2(
            verticesA,
            startVertexIdx,
            endVertexIdx,
            verticesB,
            testVertexIdx,
        ) <= 0
    );
};

const collinear = (
    verticesA: number[],
    startVertexIdx: number,
    endVertexIdx: number,
    verticesB: number[],
    testVertexIdx: number,
): boolean => {
    return (
        area2(
            verticesA,
            startVertexIdx,
            endVertexIdx,
            verticesB,
            testVertexIdx,
        ) === 0
    );
};

const intersectProp = (
    segmentVertices: number[],
    segmentStartIdx: number,
    segmentEndIdx: number,
    lineVertices: number[],
    lineStartIdx: number,
    lineEndIdx: number,
): boolean => {
    // Eliminate improper cases.
    if (
        collinear(
            segmentVertices,
            segmentStartIdx,
            segmentEndIdx,
            lineVertices,
            lineStartIdx,
        ) ||
        collinear(
            segmentVertices,
            segmentStartIdx,
            segmentEndIdx,
            lineVertices,
            lineEndIdx,
        ) ||
        collinear(
            lineVertices,
            lineStartIdx,
            lineEndIdx,
            segmentVertices,
            segmentStartIdx,
        ) ||
        collinear(
            lineVertices,
            lineStartIdx,
            lineEndIdx,
            segmentVertices,
            segmentEndIdx,
        )
    ) {
        return false;
    }

    return (
        xorb(
            left(
                segmentVertices,
                segmentStartIdx,
                segmentEndIdx,
                lineVertices,
                lineStartIdx,
            ),
            left(
                segmentVertices,
                segmentStartIdx,
                segmentEndIdx,
                lineVertices,
                lineEndIdx,
            ),
        ) &&
        xorb(
            left(
                lineVertices,
                lineStartIdx,
                lineEndIdx,
                segmentVertices,
                segmentStartIdx,
            ),
            left(
                lineVertices,
                lineStartIdx,
                lineEndIdx,
                segmentVertices,
                segmentEndIdx,
            ),
        )
    );
};

const between = (
    lineVertices: number[],
    lineStartIdx: number,
    lineEndIdx: number,
    testVertices: number[],
    testVertexIdx: number,
): boolean => {
    if (
        !collinear(
            lineVertices,
            lineStartIdx,
            lineEndIdx,
            testVertices,
            testVertexIdx,
        )
    ) {
        return false;
    }
    const lineStartOffset = lineStartIdx * 4;
    const lineEndOffset = lineEndIdx * 4;
    const testOffset = testVertexIdx * 4;
    // If line not vertical, check betweenness on x; else on z.
    if (lineVertices[lineStartOffset] !== lineVertices[lineEndOffset]) {
        return (
            (lineVertices[lineStartOffset] <= testVertices[testOffset] &&
                testVertices[testOffset] <= lineVertices[lineEndOffset]) ||
            (lineVertices[lineStartOffset] >= testVertices[testOffset] &&
                testVertices[testOffset] >= lineVertices[lineEndOffset])
        );
    }
    return (
        (lineVertices[lineStartOffset + 2] <= testVertices[testOffset + 2] &&
            testVertices[testOffset + 2] <= lineVertices[lineEndOffset + 2]) ||
        (lineVertices[lineStartOffset + 2] >= testVertices[testOffset + 2] &&
            testVertices[testOffset + 2] >= lineVertices[lineEndOffset + 2])
    );
};

const intersect = (
    segmentVertices: number[],
    segmentStartIdx: number,
    segmentEndIdx: number,
    lineVertices: number[],
    lineStartIdx: number,
    lineEndIdx: number,
): boolean => {
    if (
        intersectProp(
            segmentVertices,
            segmentStartIdx,
            segmentEndIdx,
            lineVertices,
            lineStartIdx,
            lineEndIdx,
        )
    ) {
        return true;
    }
    if (
        between(
            segmentVertices,
            segmentStartIdx,
            segmentEndIdx,
            lineVertices,
            lineStartIdx,
        ) ||
        between(
            segmentVertices,
            segmentStartIdx,
            segmentEndIdx,
            lineVertices,
            lineEndIdx,
        ) ||
        between(
            lineVertices,
            lineStartIdx,
            lineEndIdx,
            segmentVertices,
            segmentStartIdx,
        ) ||
        between(
            lineVertices,
            lineStartIdx,
            lineEndIdx,
            segmentVertices,
            segmentEndIdx,
        )
    ) {
        return true;
    }
    return false;
};

const vequal = (
    verticesA: number[],
    vertexAIdx: number,
    verticesB: number[],
    vertexBIdx: number,
): boolean => {
    const offsetA = vertexAIdx * 4;
    const offsetB = vertexBIdx * 4;
    return (
        verticesA[offsetA] === verticesB[offsetB] &&
        verticesA[offsetA + 2] === verticesB[offsetB + 2]
    );
};

const intersectSegContour = (
    segmentVertices: number[],
    segmentStartIdx: number,
    segmentEndIdx: number,
    contourVertices: number[],
    skipVertexIdx: number,
    numContourVertices: number,
): boolean => {
    // For each edge (k,k+1) of the contour
    for (let k = 0; k < numContourVertices; k++) {
        const k1 = next(k, numContourVertices);
        // Skip edges incident to skipVertexIdx.
        if (skipVertexIdx === k || skipVertexIdx === k1) {
            continue;
        }

        if (
            vequal(segmentVertices, segmentStartIdx, contourVertices, k) ||
            vequal(segmentVertices, segmentEndIdx, contourVertices, k) ||
            vequal(segmentVertices, segmentStartIdx, contourVertices, k1) ||
            vequal(segmentVertices, segmentEndIdx, contourVertices, k1)
        ) {
            continue;
        }

        if (
            intersect(
                segmentVertices,
                segmentStartIdx,
                segmentEndIdx,
                contourVertices,
                k,
                k1,
            )
        ) {
            return true;
        }
    }
    return false;
};

// Helper function to check if a point is in the cone of a vertex - taking point coordinates directly
const inConePoint = (
    vertices: number[],
    vertexIdx: number,
    numVertices: number,
    pointX: number,
    pointZ: number,
): boolean => {
    const nextVertexIdx = next(vertexIdx, numVertices);
    const prevVertexIdx = prev(vertexIdx, numVertices);

    // If P[vertexIdx] is a convex vertex [ next left or on (prev,vertex) ].
    const convex = leftOn(
        vertices,
        prevVertexIdx,
        vertexIdx,
        vertices,
        nextVertexIdx,
    );
    if (convex) {
        // Check if point (pointX,pointZ) is left of line from vertex to prev vertex
        // AND if next vertex is left of line from point to vertex
        const vertex_x = vertices[vertexIdx * 4];
        const vertex_z = vertices[vertexIdx * 4 + 2];
        const prev_x = vertices[prevVertexIdx * 4];
        const prev_z = vertices[prevVertexIdx * 4 + 2];
        const next_x = vertices[nextVertexIdx * 4];
        const next_z = vertices[nextVertexIdx * 4 + 2];

        const leftOfFirst =
            (pointX - vertex_x) * (prev_z - vertex_z) -
                (prev_x - vertex_x) * (pointZ - vertex_z) <
            0;
        const leftOfSecond =
            (next_x - pointX) * (vertex_z - pointZ) -
                (vertex_x - pointX) * (next_z - pointZ) <
            0;

        return leftOfFirst && leftOfSecond;
    }
    // Assume (prev,vertex,next) not collinear.
    // else P[vertexIdx] is reflex.
    const vertex_x = vertices[vertexIdx * 4];
    const vertex_z = vertices[vertexIdx * 4 + 2];
    const prev_x = vertices[prevVertexIdx * 4];
    const prev_z = vertices[prevVertexIdx * 4 + 2];
    const next_x = vertices[nextVertexIdx * 4];
    const next_z = vertices[nextVertexIdx * 4 + 2];

    const leftOnFirst =
        (pointX - vertex_x) * (next_z - vertex_z) -
            (next_x - vertex_x) * (pointZ - vertex_z) <=
        0;
    const leftOnSecond =
        (prev_x - pointX) * (vertex_z - pointZ) -
            (vertex_x - pointX) * (prev_z - pointZ) <=
        0;

    return !(leftOnFirst && leftOnSecond);
};

const removeDegenerateSegments = (simplified: number[]): void => {
    // Remove adjacent vertices which are equal on xz-plane,
    // or else the triangulator will get confused.
    let npts = Math.floor(simplified.length / 4);
    for (let i = 0; i < npts; ++i) {
        const ni = next(i, npts);

        if (vequal(simplified, i, simplified, ni)) {
            // Degenerate segment, remove.
            for (let j = i; j < Math.floor(simplified.length / 4) - 1; ++j) {
                simplified[j * 4 + 0] = simplified[(j + 1) * 4 + 0];
                simplified[j * 4 + 1] = simplified[(j + 1) * 4 + 1];
                simplified[j * 4 + 2] = simplified[(j + 1) * 4 + 2];
                simplified[j * 4 + 3] = simplified[(j + 1) * 4 + 3];
            }
            simplified.splice(-4, 4);
            npts--;
        }
    }
};

const mergeContours = (
    ca: Contour,
    cb: Contour,
    ia: number,
    ib: number,
): boolean => {
    const maxVerts = ca.nVertices + cb.nVertices + 2;
    const verts = new Array(maxVerts * 4);

    let nv = 0;

    // Copy contour A.
    for (let i = 0; i <= ca.nVertices; ++i) {
        const srcIndex = ((ia + i) % ca.nVertices) * 4;
        verts[nv * 4 + 0] = ca.vertices[srcIndex + 0];
        verts[nv * 4 + 1] = ca.vertices[srcIndex + 1];
        verts[nv * 4 + 2] = ca.vertices[srcIndex + 2];
        verts[nv * 4 + 3] = ca.vertices[srcIndex + 3];
        nv++;
    }

    // Copy contour B
    for (let i = 0; i <= cb.nVertices; ++i) {
        const srcIndex = ((ib + i) % cb.nVertices) * 4;
        verts[nv * 4 + 0] = cb.vertices[srcIndex + 0];
        verts[nv * 4 + 1] = cb.vertices[srcIndex + 1];
        verts[nv * 4 + 2] = cb.vertices[srcIndex + 2];
        verts[nv * 4 + 3] = cb.vertices[srcIndex + 3];
        nv++;
    }

    ca.vertices = verts;
    ca.nVertices = nv;

    cb.vertices = [];
    cb.nVertices = 0;

    return true;
};

type ContourHole = {
    contour: Contour;
    minx: number;
    minz: number;
    leftmost: number;
};

type ContourRegion = {
    outline: Contour | null;
    holes: ContourHole[];
    nholes: number;
};

type PotentialDiagonal = {
    vert: number;
    dist: number;
};

// Finds the lowest leftmost vertex of a contour.
const findLeftMostVertex = (
    contour: Contour,
): { minx: number; minz: number; leftmost: number } => {
    let minx = contour.vertices[0];
    let minz = contour.vertices[2];
    let leftmost = 0;
    for (let i = 1; i < contour.nVertices; i++) {
        const x = contour.vertices[i * 4 + 0];
        const z = contour.vertices[i * 4 + 2];
        if (x < minx || (x === minx && z < minz)) {
            minx = x;
            minz = z;
            leftmost = i;
        }
    }
    return { minx, minz, leftmost };
};

const compareHoles = (a: ContourHole, b: ContourHole): number => {
    if (a.minx === b.minx) {
        if (a.minz < b.minz) {
            return -1;
        }
        if (a.minz > b.minz) {
            return 1;
        }
    } else {
        if (a.minx < b.minx) {
            return -1;
        }
        if (a.minx > b.minx) {
            return 1;
        }
    }
    return 0;
};

const compareDiagDist = (
    a: PotentialDiagonal,
    b: PotentialDiagonal,
): number => {
    if (a.dist < b.dist) {
        return -1;
    }
    if (a.dist > b.dist) {
        return 1;
    }
    return 0;
};

const _diagonalVerts = new Array(8);

const mergeRegionHoles = (region: ContourRegion): void => {
    // Sort holes from left to right.
    for (let i = 0; i < region.nholes; i++) {
        const result = findLeftMostVertex(region.holes[i].contour);
        region.holes[i].minx = result.minx;
        region.holes[i].minz = result.minz;
        region.holes[i].leftmost = result.leftmost;
    }

    region.holes.sort(compareHoles);

    let maxVerts = region.outline!.nVertices;
    for (let i = 0; i < region.nholes; i++) {
        maxVerts += region.holes[i].contour.nVertices;
    }

    const diags: PotentialDiagonal[] = new Array(maxVerts);
    for (let i = 0; i < maxVerts; i++) {
        diags[i] = { vert: 0, dist: 0 };
    }

    const outline = region.outline!;

    // Merge holes into the outline one by one.
    for (let i = 0; i < region.nholes; i++) {
        const hole = region.holes[i].contour;

        let index = -1;
        let bestVertex = region.holes[i].leftmost;
        for (let iter = 0; iter < hole.nVertices; iter++) {
            // Find potential diagonals.
            // The 'best' vertex must be in the cone described by 3 consecutive vertices of the outline.
            // ..o j-1
            //   |
            //   |   * best
            //   |
            // j o-----o j+1
            //         :
            let ndiags = 0;
            for (let j = 0; j < outline.nVertices; j++) {
                const holeX = hole.vertices[bestVertex * 4 + 0];
                const holeZ = hole.vertices[bestVertex * 4 + 2];
                if (
                    inConePoint(
                        outline.vertices,
                        j,
                        outline.nVertices,
                        holeX,
                        holeZ,
                    )
                ) {
                    const dx = outline.vertices[j * 4 + 0] - holeX;
                    const dz = outline.vertices[j * 4 + 2] - holeZ;
                    diags[ndiags].vert = j;
                    diags[ndiags].dist = dx * dx + dz * dz;
                    ndiags++;
                }
            }
            // Sort potential diagonals by distance, we want to make the connection as short as possible.
            if (ndiags > 1) {
                // In-place sort of the first ndiags elements
                for (let a = 0; a < ndiags - 1; a++) {
                    for (let b = a + 1; b < ndiags; b++) {
                        if (diags[a].dist > diags[b].dist) {
                            const temp = diags[a];
                            diags[a] = diags[b];
                            diags[b] = temp;
                        }
                    }
                }
            }

            // Find a diagonal that is not intersecting the outline not the remaining holes.
            index = -1;
            for (let j = 0; j < ndiags; j++) {
                // Create a vertex array with the two endpoints of the diagonal
                const diagonalVerts = _diagonalVerts;

                // Copy outline vertex
                const outlineVertIdx = diags[j].vert * 4;
                diagonalVerts[0] = outline.vertices[outlineVertIdx + 0];
                diagonalVerts[1] = outline.vertices[outlineVertIdx + 1];
                diagonalVerts[2] = outline.vertices[outlineVertIdx + 2];
                diagonalVerts[3] = outline.vertices[outlineVertIdx + 3];

                // Copy hole vertex
                const holeVertIdx = bestVertex * 4;
                diagonalVerts[4] = hole.vertices[holeVertIdx + 0];
                diagonalVerts[5] = hole.vertices[holeVertIdx + 1];
                diagonalVerts[6] = hole.vertices[holeVertIdx + 2];
                diagonalVerts[7] = hole.vertices[holeVertIdx + 3];

                let intersectFound = intersectSegContour(
                    diagonalVerts,
                    0,
                    1,
                    outline.vertices,
                    diags[j].vert,
                    outline.nVertices,
                );

                for (let k = i; k < region.nholes && !intersectFound; k++) {
                    intersectFound = intersectSegContour(
                        diagonalVerts,
                        0,
                        1,
                        region.holes[k].contour.vertices,
                        -1,
                        region.holes[k].contour.nVertices,
                    );
                }

                if (!intersectFound) {
                    index = diags[j].vert;
                    break;
                }
            }
            // If found non-intersecting diagonal, stop looking.
            if (index !== -1) {
                break;
            }
            // All the potential diagonals for the current vertex were intersecting, try next vertex.
            bestVertex = (bestVertex + 1) % hole.nVertices;
        }

        if (index === -1) {
            console.warn(
                'mergeHoles: Failed to find merge points for outline and hole.',
            );
            continue;
        }
        if (!mergeContours(region.outline!, hole, index, bestVertex)) {
            console.warn('mergeHoles: Failed to merge contours.');
        }
    }
};

export const buildContours = (
    compactHeightfield: CompactHeightfield,
    maxSimplificationError: number,
    maxEdgeLength: number,
    buildFlags: ContourBuildFlags,
): ContourSet => {
    const width = compactHeightfield.width;
    const height = compactHeightfield.height;
    const borderSize = compactHeightfield.borderSize;

    // Initialize contour set
    const contourSet: ContourSet = {
        contours: [],
        bounds: structuredClone(compactHeightfield.bounds),
        cellSize: compactHeightfield.cellSize,
        cellHeight: compactHeightfield.cellHeight,
        width: compactHeightfield.width - compactHeightfield.borderSize * 2,
        height: compactHeightfield.height - compactHeightfield.borderSize * 2,
        borderSize: compactHeightfield.borderSize,
        maxError: maxSimplificationError,
    };

    // If the heightfield was build with borderSize, remove the offset.
    if (borderSize > 0) {
        const pad = borderSize * compactHeightfield.cellSize;
        contourSet.bounds[0][0] += pad;
        contourSet.bounds[0][2] += pad;
        contourSet.bounds[1][0] -= pad;
        contourSet.bounds[1][2] -= pad;
    }

    const flags = new Array(compactHeightfield.spanCount).fill(0);

    // Mark boundaries.
    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const c = compactHeightfield.cells[x + y * width];
            for (let i = c.index; i < c.index + c.count; ++i) {
                let res = 0;
                const s = compactHeightfield.spans[i];
                if (
                    !compactHeightfield.spans[i].region ||
                    compactHeightfield.spans[i].region & BORDER_REG
                ) {
                    flags[i] = 0;
                    continue;
                }
                for (let dir = 0; dir < 4; ++dir) {
                    let r = 0;
                    if (getCon(s, dir) !== NOT_CONNECTED) {
                        const ax = x + getDirOffsetX(dir);
                        const ay = y + getDirOffsetY(dir);
                        const ai =
                            compactHeightfield.cells[ax + ay * width].index +
                            getCon(s, dir);
                        r = compactHeightfield.spans[ai].region;
                    }
                    if (r === compactHeightfield.spans[i].region) {
                        res |= 1 << dir;
                    }
                }
                flags[i] = res ^ 0xf; // Inverse, mark non connected edges.
            }
        }
    }

    const verts: number[] = [];
    const simplified: number[] = [];

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const c = compactHeightfield.cells[x + y * width];
            for (let i = c.index; i < c.index + c.count; ++i) {
                if (flags[i] === 0 || flags[i] === 0xf) {
                    flags[i] = 0;
                    continue;
                }
                const region = compactHeightfield.spans[i].region;
                if (!region || region & BORDER_REG) {
                    continue;
                }
                const area = compactHeightfield.areas[i];

                verts.length = 0;
                simplified.length = 0;

                walkContour(x, y, i, compactHeightfield, flags, verts);
                simplifyContour(
                    verts,
                    simplified,
                    maxSimplificationError,
                    maxEdgeLength,
                    buildFlags,
                );
                removeDegenerateSegments(simplified);

                // Create contour.
                if (Math.floor(simplified.length / 4) >= 3) {
                    const contour: Contour = {
                        nVertices: Math.floor(simplified.length / 4),
                        vertices: simplified.slice(),
                        nRawVertices: Math.floor(verts.length / 4),
                        rawVertices: verts.slice(),
                        reg: region,
                        area: area,
                    };

                    if (borderSize > 0) {
                        // If the heightfield was build with bordersize, remove the offset.
                        for (let j = 0; j < contour.nVertices; ++j) {
                            contour.vertices[j * 4 + 0] -= borderSize;
                            contour.vertices[j * 4 + 2] -= borderSize;
                        }

                        for (let j = 0; j < contour.nRawVertices; ++j) {
                            contour.rawVertices[j * 4 + 0] -= borderSize;
                            contour.rawVertices[j * 4 + 2] -= borderSize;
                        }
                    }

                    contourSet.contours.push(contour);
                }
            }
        }
    }

    // Merge holes if needed.
    if (contourSet.contours.length > 0) {
        // Calculate winding of all polygons.
        const winding = new Array(contourSet.contours.length);
        let nholes = 0;
        for (let i = 0; i < contourSet.contours.length; ++i) {
            const contour = contourSet.contours[i];
            // If the contour is wound backwards, it is a hole.
            winding[i] =
                calcAreaOfPolygon2D(contour.vertices, contour.nVertices) < 0
                    ? -1
                    : 1;
            if (winding[i] < 0) {
                nholes++;
            }
        }

        if (nholes > 0) {
            // Collect outline contour and holes contours per region.
            // We assume that there is one outline and multiple holes.
            const nregions = compactHeightfield.maxRegions + 1;
            const regions: ContourRegion[] = new Array(nregions);
            for (let i = 0; i < nregions; i++) {
                regions[i] = {
                    outline: null,
                    holes: [],
                    nholes: 0,
                };
            }

            const holes: ContourHole[] = new Array(contourSet.contours.length);
            for (let i = 0; i < contourSet.contours.length; i++) {
                holes[i] = {
                    contour: contourSet.contours[i],
                    minx: 0,
                    minz: 0,
                    leftmost: 0,
                };
            }

            for (let i = 0; i < contourSet.contours.length; ++i) {
                const contour = contourSet.contours[i];
                // Positively wound contours are outlines, negative holes.
                if (winding[i] > 0) {
                    if (regions[contour.reg].outline) {
                        console.error(
                            `buildContours: Multiple outlines for region ${contour.reg}.`,
                        );
                    }
                    regions[contour.reg].outline = contour;
                } else {
                    regions[contour.reg].nholes++;
                }
            }
            let index = 0;
            for (let i = 0; i < nregions; i++) {
                if (regions[i].nholes > 0) {
                    regions[i].holes = new Array(regions[i].nholes);
                    for (let j = 0; j < regions[i].nholes; j++) {
                        regions[i].holes[j] = holes[index + j];
                    }
                    index += regions[i].nholes;
                    regions[i].nholes = 0;
                }
            }
            for (let i = 0; i < contourSet.contours.length; ++i) {
                const contour = contourSet.contours[i];
                const region = regions[contour.reg];
                if (winding[i] < 0) {
                    region.holes[region.nholes++] = holes[i];
                }
            }

            // Finally merge each regions holes into the outline.
            for (let i = 0; i < nregions; i++) {
                const region = regions[i];
                if (!region.nholes) continue;

                if (region.outline) {
                    mergeRegionHoles(region);
                } else {
                    // The region does not have an outline.
                    // This can happen if the contour becaomes selfoverlapping because of
                    // too aggressive simplification settings.
                    console.error(
                        `buildContours: Bad outline for region ${i}, contour simplification is likely too aggressive.`,
                    );
                }
            }
        }
    }

    return contourSet;
};
