import type { Box3 } from '@/common/maaths';
import type { CompactHeightfield } from './compact-heightfield';

export type PointSet = {
    /** positions in world space (x, y, z) */
    positions: number[];
    /** area ids corresponding to each position */
    areas: number[];
    /** bounds in world space */
    bounds: Box3;
};

export const compactHeightfieldToPointSet = (
    compactHeightfield: CompactHeightfield,
): PointSet => {
    const pointSet: PointSet = {
        positions: [],
        areas: [],
        bounds: structuredClone(compactHeightfield.bounds),
    };

    const chf = compactHeightfield;
    const cellSize = chf.cellSize;
    const cellHeight = chf.cellHeight;

    // Iterate through all cells in the compact heightfield
    for (let y = 0; y < chf.height; y++) {
        for (let x = 0; x < chf.width; x++) {
            const cellIndex = x + y * chf.width;
            const cell = chf.cells[cellIndex];

            // Iterate through all spans in this cell
            for (let i = 0; i < cell.count; i++) {
                const spanIndex = cell.index + i;
                const span = chf.spans[spanIndex];
                const area = chf.areas[spanIndex];

                // Skip spans with no area (unwalkable)
                if (area === 0) continue;

                // Convert from span space to local space relative to the bounds
                const worldX = x * cellSize + cellSize * 0.5; // Center of cell
                const worldY = (span.y + 1) * cellHeight; // Top of span using Recast convention
                const worldZ = y * cellSize + cellSize * 0.5; // Center of cell

                // Add position (x, y, z) to the point set in world space
                pointSet.positions.push(worldX, worldY, worldZ);
                pointSet.areas.push(area);
            }
        }
    }

    return pointSet;
};

export type Triangle = {
    /** vertex indices into the original positions array */
    vertices: [number, number, number];
    /** area id for this triangle */
    area: number;
};

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

export const pointSetToTriangleMesh = (
    pointSet: PointSet,
): TriangleMesh => {
    const positions: number[] = [];
    const indices: number[] = [];
    const areas: number[] = [];
    
    
    return {
        positions,
        indices,
        areas,
        bounds: structuredClone(pointSet.bounds),
    };
};

export const reduceTriangleMesh = (
    mesh: TriangleMesh,
): TriangleMesh => {
    
    return {
        positions: mesh.positions,
        indices: mesh.indices,
        areas: mesh.areas,
        bounds: structuredClone(mesh.bounds),
    }
};
