import * as THREE from 'three'
import { Topic } from 'arancini/events'
import { RaycastResult, raycast } from './raycast'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, CHUNK_BITS)

const toChunkIndex = ({ x, y, z }: THREE.Vector3Like): number => {
    const mask = (1 << CHUNK_BITS) - 1

    return (x & mask) + ((y & mask) << CHUNK_BITS) + ((z & mask) << (CHUNK_BITS * 2))
}

const worldToChunkLocal = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkY = Math.floor(y / CHUNK_SIZE)
    const chunkZ = Math.floor(z / CHUNK_SIZE)

    const localX = x - chunkX * CHUNK_SIZE
    const localY = y - chunkY * CHUNK_SIZE
    const localZ = z - chunkZ * CHUNK_SIZE

    return out.set(localX, localY, localZ)
}

const worldToChunk = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
    // Using signed right shift to convert to chunk vec
    // Shifts right by pushing copies of the leftmost bit in from the left, and let the rightmost bits fall off
    // e.g.
    // 15 >> 4 = 0
    // 16 >> 4 = 1
    const cx = x >> CHUNK_BITS
    const cy = y >> CHUNK_BITS
    const cz = z >> CHUNK_BITS

    return out.set(cx, cy, cz)
}

const chunkToWorld = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
    return out.set(x * CHUNK_SIZE, y * CHUNK_SIZE, z * CHUNK_SIZE)
}

export const vec3 = {
    toChunkIndex,
    worldToChunk,
    worldToChunkLocal,
    chunkToWorld,
}

export const getChunkBounds = (chunk: VoxelChunk): THREE.Box3 => {
    const min = chunk.position.clone().multiplyScalar(CHUNK_SIZE)
    const max = min.clone().addScalar(CHUNK_SIZE - 1)
    return new THREE.Box3(min, max)
}

export const chunkId = ({ x, y, z }: THREE.Vector3Like): string => {
    return `${x},${y},${z}`
}

const createVoxelChunk = (id: string, position: THREE.Vector3): VoxelChunk => {
    const solidBuffer = new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
    const solid = new Uint8Array(solidBuffer)

    const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
    const color = new Uint32Array(colorBuffer)

    return {
        id,
        position,
        solid,
        solidBuffer,
        color,
        colorBuffer,
    }
}

export type VoxelChunk = {
    id: string
    position: THREE.Vector3

    solid: Uint8Array
    solidBuffer: SharedArrayBuffer

    color: Uint32Array
    colorBuffer: SharedArrayBuffer
}

export type BlockValue = { solid: false } | { solid: true; color: number }

export type RaycastProps = {
    origin: THREE.Vector3Like
    direction: THREE.Vector3Like
    maxDistance?: number
    outHitPosition?: THREE.Vector3
    outHitNormal?: THREE.Vector3
}
export class World {
    chunks = new Map<string, VoxelChunk>()

    onChunkCreated = new Topic<[chunk: VoxelChunk]>()

    set(position: THREE.Vector3Like, value: BlockValue) {
        const chunkPosition = vec3.worldToChunk(position)
        const id = chunkId(chunkPosition)

        let chunk = this.chunks.get(id)

        if (!chunk) {
            chunk = createVoxelChunk(id, new THREE.Vector3(...chunkPosition))

            this.chunks.set(id, chunk)

            this.onChunkCreated.emit(chunk)
        }

        const index = vec3.toChunkIndex(position)

        chunk.solid[index] = value.solid ? 1 : 0
        chunk.color[index] = value.solid ? value.color : 0

        return {
            success: true,
            chunk,
        }
    }

    raycast({
        origin,
        direction,
        maxDistance,
        outHitPosition = new THREE.Vector3(),
        outHitNormal = new THREE.Vector3(),
    }: RaycastProps): RaycastResult {
        return raycast(this, origin, direction, maxDistance, outHitPosition, outHitNormal)
    }

    solid(position: THREE.Vector3Like) {
        const chunk = this.getChunkAtPosition(position)

        if (!chunk) {
            return false
        }

        const chunkDataIndex = vec3.toChunkIndex(position)
        return chunk.solid[chunkDataIndex] === 1
    }

    getChunkAtPosition(position: THREE.Vector3Like) {
        const chunkPosition = vec3.worldToChunk(position, _chunkPosition)
        return this.chunks.get(chunkId(chunkPosition))
    }

    getChunkById(id: string) {
        return this.chunks.get(id)
    }
}

const _chunkPosition = new THREE.Vector3()
