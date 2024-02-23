
import { CHUNK_BITS, CHUNK_SIZE } from './constants'

export type Vec3 = [number, number, number]

const toChunkIndex = ([x, y, z]: Vec3): number => {
    const mask = (1 << CHUNK_BITS) - 1

    return (x & mask) + ((y & mask) << CHUNK_BITS) + ((z & mask) << (CHUNK_BITS * 2))
}

const worldToChunkLocal = ([x, y, z]: Vec3): Vec3 => {
    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkY = Math.floor(y / CHUNK_SIZE)
    const chunkZ = Math.floor(z / CHUNK_SIZE)

    const localX = x - chunkX * CHUNK_SIZE
    const localY = y - chunkY * CHUNK_SIZE
    const localZ = z - chunkZ * CHUNK_SIZE

    return [localX, localY, localZ]
}

const worldToChunk = ([x, y, z]: Vec3): Vec3 => {
    // Using signed right shift to convert to chunk vec
    // Shifts right by pushing copies of the leftmost bit in from the left, and let the rightmost bits fall off
    // e.g.
    // 15 >> 4 = 0
    // 16 >> 4 = 1
    const cx = x >> CHUNK_BITS
    const cy = y >> CHUNK_BITS
    const cz = z >> CHUNK_BITS

    return [cx, cy, cz]
}

const chunkToWorldPosition = ([x, y, z]: Vec3): Vec3 => {
    return [x * CHUNK_SIZE, y * CHUNK_SIZE, z * CHUNK_SIZE]
}

export const vec3 = {
    toChunkIndex,
    worldPositionToChunkLocalPosition: worldToChunkLocal,
    worldPositionToChunkPosition: worldToChunk,
    chunkPositionToWorldPosition: chunkToWorldPosition,
}
