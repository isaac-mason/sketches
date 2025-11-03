import type { Engine, VoxelChunk } from './engine';

const WORLD_SIZE = { x: 16, y: 8, z: 16 };
const SEED = 42;

const GEN_CHUNKS_PER_FRAME = 10;

// Module-scope setVoxel that uses C++ implementation
export const setVoxel = (
    engine: Engine,
    state: VoxelsState,
    wx: number,
    wy: number,
    wz: number,
    value: number,
    r: number,
    g: number,
    b: number,
) => {
    engine.setVoxel(state.world, wx, wy, wz, value, r, g, b);
};

export const initVoxels = async (engine: Engine) => {
    console.log('Initializing voxel world...');

    const world = engine.initVoxels(0, WORLD_SIZE.x - 1, 0, WORLD_SIZE.y - 1, 0, WORLD_SIZE.z - 1)!;

    const chunkGeom = engine.allocateChunkGeometry()!;

    const chunkGenerationQueue: Array<{ cx: number; cy: number; cz: number; chunk: VoxelChunk }> = [];

    for (let cy = 0; cy < WORLD_SIZE.y; cy++) {
        for (let cz = 0; cz < WORLD_SIZE.z; cz++) {
            for (let cx = 0; cx < WORLD_SIZE.x; cx++) {
                const chunk = engine.getChunkAt(world, cx, cy, cz);
                if (!chunk) {
                    console.warn(`missing chunk for ${cx}:${cy}:${cz} — skipping`);
                    continue;
                }

                chunkGenerationQueue.push({ cx, cy, cz, chunk });
            }
        }
    }

    console.log(`Initialized ${chunkGenerationQueue.length} chunks, ready for generation`);

    return {
        world,
        chunkGeom,
        chunks: [] as Array<{ cx: number; cy: number; cz: number; chunk: VoxelChunk }>,
        chunkGenerationQueue,
        CHUNK_SIZE: engine.CHUNK_SIZE,
        WORLD_SIZE,
    };
};

export type VoxelsState = ReturnType<typeof initVoxels> extends Promise<infer T> ? T : never;

const getChunkDistance = (
    cx: number,
    cy: number,
    cz: number,
    chunkSize: number,
    cameraX: number,
    cameraY: number,
    cameraZ: number,
): number => {
    const centerX = (cx + 0.5) * chunkSize;
    const centerY = (cy + 0.5) * chunkSize;
    const centerZ = (cz + 0.5) * chunkSize;
    const dx = centerX - cameraX;
    const dy = centerY - cameraY;
    const dz = centerZ - cameraZ;
    return dx * dx + dy * dy + dz * dz; // squared distance is fine for sorting
};

export const generateChunks = (state: VoxelsState, engine: Engine, cameraPos: { x: number; y: number; z: number }): void => {
    if (state.chunkGenerationQueue.length === 0) return;

    // Sort by distance to camera (closest first)
    state.chunkGenerationQueue.sort((a, b) => {
        const distA = getChunkDistance(a.cx, a.cy, a.cz, state.CHUNK_SIZE, cameraPos.x, cameraPos.y, cameraPos.z);
        const distB = getChunkDistance(b.cx, b.cy, b.cz, state.CHUNK_SIZE, cameraPos.x, cameraPos.y, cameraPos.z);
        return distA - distB;
    });

    // Generate closest N chunks
    const toGenerate = Math.min(GEN_CHUNKS_PER_FRAME, state.chunkGenerationQueue.length);
    for (let i = 0; i < toGenerate; i++) {
        const { cx, cy, cz, chunk } = state.chunkGenerationQueue.shift()!;

        // Generate in C++
        engine.generateChunk(chunk, cx, cy, cz, SEED);

        // Mark as dirty for meshing
        engine.setChunkDirty(chunk, true);

        // Mark all 26 neighbors as dirty (they need remeshing for proper boundaries)
        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                for (let dz = -1; dz <= 1; dz++) {
                    if (dx === 0 && dy === 0 && dz === 0) continue; // Skip self
                    
                    const neighborChunk = engine.getChunkAt(state.world, cx + dx, cy + dy, cz + dz);
                    if (neighborChunk) {
                        engine.setChunkDirty(neighborChunk, true);
                    }
                }
            }
        }

        // Add to generated chunks list
        state.chunks.push({ cx, cy, cz, chunk });
    }
};

export const updateVoxels = (state: VoxelsState, dt: number) => {
    // Placeholder for future voxel updates (physics, etc.)
};
