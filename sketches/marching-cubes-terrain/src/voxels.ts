import { Vector3Tuple } from 'three'

export type Chunk = {
    id: string
    position: Vector3Tuple
    solid: Uint8Array
}

export type World = {
    chunks: Map<string, Chunk>
}

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, CHUNK_BITS)

export const init = (): World => {
    return {
        chunks: new Map(),
    }
}

export const worldToChunkLocal = (x: number, y: number, z: number, out: Vector3Tuple = [0, 0, 0]) => {
    out[0] = x & (CHUNK_SIZE - 1)
    out[1] = y & (CHUNK_SIZE - 1)
    out[2] = z & (CHUNK_SIZE - 1)

    return out
}

export const worldToChunk = (x: number, y: number, z: number, out: Vector3Tuple = [0, 0, 0]) => {
    out[0] = x >> CHUNK_BITS
    out[1] = y >> CHUNK_BITS
    out[2] = z >> CHUNK_BITS

    return out
}

export const chunkToWorld = (x: number, y: number, z: number, out: Vector3Tuple = [0, 0, 0]) => {
    out[0] = x * CHUNK_SIZE
    out[1] = y * CHUNK_SIZE
    out[2] = z * CHUNK_SIZE

    return out
}

export const getChunkId = (x: number, y: number, z: number) => {
    return `${x},${y},${z}`
}

export const getChunkDataIndex = (x: number, y: number, z: number) => {
    return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
}

export const getChunkAt = (world: World, x: number, y: number, z: number) => {
    const chunkPosition = worldToChunk(x, y, z)
    const chunkId = getChunkId(...chunkPosition)

    return world.chunks.get(chunkId)
}

export const getChunk = (world: World, x: number, y: number, z: number) => {
    const chunkId = getChunkId(x, y, z)

    return world.chunks.get(chunkId)
}

const _chunkPosition: Vector3Tuple = [0, 0, 0]
const _chunkLocalPosition: Vector3Tuple = [0, 0, 0]

export const getSolid = (world: World, x: number, y: number, z: number): boolean => {
    const chunkPosition = worldToChunk(x, y, z, _chunkPosition)
    const chunkId = getChunkId(...chunkPosition)

    const chunk = world.chunks.get(chunkId)

    if (!chunk) {
        return false
    }

    const chunkLocalPosition = worldToChunkLocal(x, y, z, _chunkLocalPosition)
    const index = getChunkDataIndex(chunkLocalPosition[0], chunkLocalPosition[1], chunkLocalPosition[2])

    return chunk.solid[index] === 1
}

export const setBlock = (world: World, x: number, y: number, z: number, solid: boolean) => {
    const chunkPosition = worldToChunk(x, y, z, _chunkPosition)
    const chunkId = getChunkId(...chunkPosition)

    let chunk = world.chunks.get(chunkId)

    if (!chunk) {
        chunk = {
            id: chunkId,
            position: [...chunkPosition],
            solid: new Uint8Array(CHUNK_SIZE ** 3),
        }

        world.chunks.set(chunkId, chunk)
    }

    const chunkLocalPosition = worldToChunkLocal(x, y, z, _chunkLocalPosition)
    const index = getChunkDataIndex(chunkLocalPosition[0], chunkLocalPosition[1], chunkLocalPosition[2])

    chunk.solid[index] = solid ? 1 : 0
}
