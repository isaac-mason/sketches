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
    const orig = chf.bounds[0]; // bmin (bottom-left-back corner)
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

                // Convert to world space directly
                const worldX = orig[0] + x * cellSize + cellSize * 0.5; // Center of cell
                const worldY = orig[1] + (span.y + 1) * cellHeight; // Top of span using Recast convention
                const worldZ = orig[2] + y * cellSize + cellSize * 0.5; // Center of cell

                // Add position (x, y, z) to the point set in world space
                pointSet.positions.push(worldX, worldY, worldZ);
                pointSet.areas.push(area);
            }
        }
    }

    return pointSet;
};
