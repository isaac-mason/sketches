import type { Box3 } from "./types";

export const create = (): Box3 => {
    return [
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
    ];
}
/**
 * Check whether two bounding boxes overlap
 */
export const overlap = (boxA: Box3, boxB: Box3): boolean => {
    const [minA, maxA] = boxA;
    const [minB, maxB] = boxB;

    return (
        minA[0] <= maxB[0] &&
        maxA[0] >= minB[0] &&
        minA[1] <= maxB[1] &&
        maxA[1] >= minB[1] &&
        minA[2] <= maxB[2] &&
        maxA[2] >= minB[2]
    );
};