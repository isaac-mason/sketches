export type ArrayLike<T> = {
    [index: number]: T;
    length: number;
};

// Direction offsets for 4-directional neighbor access (N, E, S, W)
export const DIR_OFFSETS = [
    // North (negative Z)
    [0, -1],
    // East (positive X)
    [1, 0],
    // South (positive Z)
    [0, 1],
    // West (negative X)
    [-1, 0],
];
