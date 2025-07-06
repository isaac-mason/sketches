export type ArrayLike<T> = {
    [index: number]: T;
    length: number;
};

// Direction offsets for 4-directional neighbor access (N, E, S, W)
export const DIR_OFFSETS = [
    // North (negative Z)
    [-1, 0],
    // East (positive X)
    [0, 1],
    // South (positive Z)
    [1, 0],
    // West (negative X)
    [0, -1],
];

export const getDirOffsetX = (dir: number): number => {
    return DIR_OFFSETS[dir & 0x03][0];
}

export const getDirOffsetY = (dir: number): number => {
    return DIR_OFFSETS[dir & 0x03][1];
}

export const getDirForOffset = (x: number, y: number): number => {
    for (let i = 0; i < DIR_OFFSETS.length; i++) {
        if (DIR_OFFSETS[i][0] === x && DIR_OFFSETS[i][1] === y) {
            return i;
        }
    }
    return 0; // Default to North if no match
};
