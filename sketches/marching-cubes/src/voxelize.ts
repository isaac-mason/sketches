import type { PLY } from './ply';

export type VoxelSample = {
    x: number; // local x in chunk [0..CHUNK_SIZE)
    y: number; // local y in chunk
    z: number; // local z in chunk
    value: number; // 0..255 density
    r: number; // 0..255
    g: number;
    b: number;
};

export type ChunkData = {
    cx: number;
    cy: number;
    cz: number;
    samples: VoxelSample[];
};

type ChunkAccumulator = {
    values: Float32Array;
    r: Float32Array;
    g: Float32Array;
    b: Float32Array;
    counts: Uint16Array;
    dirty: Uint8Array; // track which voxels have data
};

const createChunkAccumulator = (chunkVoxels: number): ChunkAccumulator => {
    return {
        values: new Float32Array(chunkVoxels),
        r: new Float32Array(chunkVoxels),
        g: new Float32Array(chunkVoxels),
        b: new Float32Array(chunkVoxels),
        counts: new Uint16Array(chunkVoxels),
        dirty: new Uint8Array(chunkVoxels),
    };
};

const accumulateVoxel = (
    accum: ChunkAccumulator,
    localIdx: number,
    value: number,
    gain: number,
    rx: number,
    rg: number,
    rb: number
) => {
    accum.values[localIdx] += value * gain;
    accum.r[localIdx] += rx * value;
    accum.g[localIdx] += rg * value;
    accum.b[localIdx] += rb * value;
    accum.counts[localIdx]++;
    accum.dirty[localIdx] = 1;
};

const chunkAccumulatorToVoxelSamples = (accum: ChunkAccumulator, chunkSize: number, chunkVoxels: number): VoxelSample[] => {
    const samples: VoxelSample[] = [];

    for (let localIdx = 0; localIdx < chunkVoxels; localIdx++) {
        if (!accum.dirty[localIdx]) continue;

        const count = accum.counts[localIdx];
        const value = accum.values[localIdx];

        if (value <= 0 || count <= 0) continue;

        // decode localIdx back to x, y, z
        const y = Math.floor(localIdx / (chunkSize * chunkSize));
        const rem = localIdx - y * (chunkSize * chunkSize);
        const z = Math.floor(rem / chunkSize);
        const x = rem - z * chunkSize;

        const density = Math.min(255, Math.max(0, Math.floor((value / count) * 255)));
        const normBy = count > 0 ? count : value;
        const rr = Math.min(255, Math.max(0, Math.floor((accum.r[localIdx] / normBy) * 255)));
        const gg = Math.min(255, Math.max(0, Math.floor((accum.g[localIdx] / normBy) * 255)));
        const bb = Math.min(255, Math.max(0, Math.floor((accum.b[localIdx] / normBy) * 255)));

        samples.push({ x, y, z, value: density, r: rr, g: gg, b: bb });
    }

    return samples;
};

// Bit-pack chunk coordinates into a single number for fast Map lookups
// Use 17 bits per coord (51 bits total) — safe within JS 53-bit integer precision
const CHUNK_ID_BITS = 17;
const CHUNK_ID_BIAS = 1 << (CHUNK_ID_BITS - 1); // 65536
const CHUNK_ID_SHIFT_Y = CHUNK_ID_BITS;
const CHUNK_ID_SHIFT_X = CHUNK_ID_BITS * 2;
const CHUNK_ID_MULT_Y = 2 ** CHUNK_ID_SHIFT_Y;
const CHUNK_ID_MULT_X = 2 ** CHUNK_ID_SHIFT_X;

const makeChunkId = (cx: number, cy: number, cz: number): number => {
    const x = cx + CHUNK_ID_BIAS;
    const y = cy + CHUNK_ID_BIAS;
    const z = cz + CHUNK_ID_BIAS;
    return x * CHUNK_ID_MULT_X + y * CHUNK_ID_MULT_Y + z;
};

export const voxelize = (opts: {
    ply: PLY;
    gain: number;
    grid: number;
    resolution: number;
    chunkSize: number;
}): ChunkData[] => {
    const { ply, gain, grid, resolution, chunkSize } = opts;
    const chunkVoxels = chunkSize * chunkSize * chunkSize;

    // Precompute chunk size bit shift (only works if chunkSize is power of 2)
    const isPowerOfTwo = (chunkSize & (chunkSize - 1)) === 0;
    const chunkBits = isPowerOfTwo ? Math.log2(chunkSize) : 0;

    // precompute sample offsets
    const sampleCount = (2 * grid + 1) ** 3;
    const sampleOffsets = new Int8Array(sampleCount * 3);
    const sampleValues = new Float32Array(sampleCount);

    let sIdx = 0;
    for (let z = -grid; z <= grid; z++) {
        for (let y = -grid; y <= grid; y++) {
            for (let x = -grid; x <= grid; x++) {
                sampleOffsets[sIdx * 3 + 0] = x;
                sampleOffsets[sIdx * 3 + 1] = y;
                sampleOffsets[sIdx * 3 + 2] = z;
                sampleValues[sIdx] = 1 - (Math.sqrt(x * x + y * y + z * z) / grid) * 0.5;
                sIdx++;
            }
        }
    }

    const positions = ply.vertices;
    const colors = ply.colors;
    const count = ply.vertices.length / 3;

    // chunkAccums: Map with chunk coordinates embedded
    type ChunkAccumWithCoords = ChunkAccumulator & { cx: number; cy: number; cz: number };
    const chunkAccums = new Map<number, ChunkAccumWithCoords>();

    for (let i = 0; i < count; i++) {
        const pi = i * 3;
        const rx = colors[pi + 0];
        const rg = colors[pi + 1];
        const rb = colors[pi + 2];

        // skip placeholder/invalid points
        if (rx === 0 && (rg === 0 || rg === 1) && rb === 0) continue;

        const px = Math.round(positions[pi + 0] * resolution);
        const py = Math.round(positions[pi + 1] * resolution);
        const pz = Math.round(positions[pi + 2] * resolution);

        for (let s = 0; s < sampleCount; s++) {
            const ox = sampleOffsets[s * 3 + 0];
            const oy = sampleOffsets[s * 3 + 1];
            const oz = sampleOffsets[s * 3 + 2];
            const value = sampleValues[s];

            const vx = px + ox;
            const vy = py + oy;
            const vz = pz + oz;

            // chunk coords - use bit shift for power-of-2 chunk sizes, else Math.floor
            let cx: number;
            let cy: number;
            let cz: number;
            if (isPowerOfTwo) {
                // Fast bit shift version (works for positive and negative)
                cx = vx >> chunkBits;
                cy = vy >> chunkBits;
                cz = vz >> chunkBits;
            } else {
                cx = Math.floor(vx / chunkSize);
                cy = Math.floor(vy / chunkSize);
                cz = Math.floor(vz / chunkSize);
            }

            // local coords inside chunk - use bit mask for power-of-2, else subtraction
            const lx = isPowerOfTwo ? vx & (chunkSize - 1) : vx - cx * chunkSize;
            const ly = isPowerOfTwo ? vy & (chunkSize - 1) : vy - cy * chunkSize;
            const lz = isPowerOfTwo ? vz & (chunkSize - 1) : vz - cz * chunkSize;

            // Use numeric chunk ID (much faster than string concatenation)
            const chunkId = makeChunkId(cx, cy, cz);
            let accum = chunkAccums.get(chunkId);
            if (!accum) {
                // Avoid object spread - directly create and assign
                const newAccum = createChunkAccumulator(chunkVoxels);
                accum = { ...newAccum, cx, cy, cz };
                chunkAccums.set(chunkId, accum);
            }

            // linear index within chunk
            const localIdx = lx + lz * chunkSize + ly * chunkSize * chunkSize;
            accumulateVoxel(accum, localIdx, value, gain, rx, rg, rb);
        }
    }

    // convert to ChunkData array
    const chunks: ChunkData[] = [];

    for (const accum of chunkAccums.values()) {
        const samples = chunkAccumulatorToVoxelSamples(accum, chunkSize, chunkVoxels);
        if (samples.length > 0) {
            chunks.push({
                cx: accum.cx,
                cy: accum.cy,
                cz: accum.cz,
                samples
            });
        }
    }

    return chunks;
};
