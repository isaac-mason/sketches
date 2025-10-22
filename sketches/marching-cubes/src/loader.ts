import type { ChunkData } from './voxelize';

export type VoxelizedData = {
    metadata: {
        version: string;
        chunkSize: number;
        resolution: number;
        gain: number;
        grid: number;
    };
    chunks: ChunkData[];
};

export const loadVoxelData = async (url: string): Promise<VoxelizedData> => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const view = new DataView(arrayBuffer);

    let offset = 0;

    // Read metadata
    const versionLength = view.getUint32(offset, true);
    offset += 4;

    const versionBytes = new Uint8Array(arrayBuffer, offset, versionLength);
    const version = new TextDecoder().decode(versionBytes);
    offset += versionLength;

    const chunkSize = view.getUint32(offset, true);
    offset += 4;
    const resolution = view.getUint32(offset, true);
    offset += 4;
    const gain = view.getFloat32(offset, true);
    offset += 4;
    const grid = view.getUint32(offset, true);
    offset += 4;
    const numChunks = view.getUint32(offset, true);
    offset += 4;

    // Read chunks
    const chunks: ChunkData[] = [];

    for (let i = 0; i < numChunks; i++) {
        const cx = view.getInt32(offset, true);
        offset += 4;
        const cy = view.getInt32(offset, true);
        offset += 4;
        const cz = view.getInt32(offset, true);
        offset += 4;
        const numSamples = view.getUint32(offset, true);
        offset += 4;

        const samples = [];
        for (let j = 0; j < numSamples; j++) {
            samples.push({
                x: view.getUint8(offset++),
                y: view.getUint8(offset++),
                z: view.getUint8(offset++),
                value: view.getUint8(offset++),
                r: view.getUint8(offset++),
                g: view.getUint8(offset++),
                b: view.getUint8(offset++),
            });
        }

        chunks.push({ cx, cy, cz, samples });
    }

    return {
        metadata: { version, chunkSize, resolution, gain, grid },
        chunks,
    };
};
