import type { Box3 } from "@/common/maaths";

export type TriangleMesh = {
    /** vertex positions in world space [x1, y1, z1, x2, y2, z2, ...] */
    positions: number[];
    /** triangle indices [a1, b1, c1, a2, b2, c2, ...] */
    indices: number[];
    /** area id for each triangle */
    areas: number[];
    /** bounds in world space */
    bounds: Box3;
};
