import { Topic } from '@/common/utils/topic'
import * as THREE from 'three'
import { RaycastResult, raycast } from './raycast'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, CHUNK_BITS)

export const worldPositionToChunkLocalPosition = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
    return out.set(x & (CHUNK_SIZE - 1), y & (CHUNK_SIZE - 1), z & (CHUNK_SIZE - 1))
}

export const worldPositionToChunkPosition = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
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

export const chunkPositionToWorldPosition = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
    return out.set(x * CHUNK_SIZE, y * CHUNK_SIZE, z * CHUNK_SIZE)
}

export const getChunkBounds = (chunk: Chunk): THREE.Box3 => {
    const min = chunk.position.clone().multiplyScalar(CHUNK_SIZE)
    const max = min.clone().addScalar(CHUNK_SIZE - 1)
    return new THREE.Box3(min, max)
}

export class Chunk {
    id: string
    position: THREE.Vector3

    solid: Uint16Array
    solidBuffer: SharedArrayBuffer

    color: Uint32Array
    colorBuffer: SharedArrayBuffer

    constructor(id: string, position: THREE.Vector3, solidBuffer: SharedArrayBuffer, colorBuffer: SharedArrayBuffer) {
        this.id = id
        this.position = position
        this.solidBuffer = solidBuffer
        this.solid = new Uint16Array(solidBuffer)
        this.colorBuffer = colorBuffer
        this.color = new Uint32Array(colorBuffer)
    }

    setBlock(x: number, y: number, z: number, solid: boolean, color: number) {
        const solidColumnMask = 1 << y

        if (solid) {
            this.solid[Chunk.solidIndex(x, y, z)] |= solidColumnMask
        } else {
            this.solid[Chunk.solidIndex(x, y, z)] &= ~solidColumnMask
        }

        this.color[Chunk.colorIndex(x, y, z)] = color
    }

    getSolid(x: number, y: number, z: number) {
        const solidColumnMask = 1 << y

        const solid = this.solid[Chunk.solidIndex(x, y, z)] & solidColumnMask

        return !!solid
    }

    getColor(x: number, y: number, z: number) {
        return this.color[Chunk.colorIndex(x, y, z)]
    }

    static solidIndex(x: number, _y: number, z: number) {
        return x + z * CHUNK_SIZE
    }

    static colorIndex(x: number, y: number, z: number) {
        return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
    }

    static id(x: number, y: number, z: number) {
        return `${x},${y},${z}`
    }
}

export type RaycastProps = {
    origin: THREE.Vector3Like
    direction: THREE.Vector3Like
    maxDistance?: number
    outHitPosition?: THREE.Vector3
    outHitNormal?: THREE.Vector3
}

let worldId = 0

export class World {
    id = worldId++

    chunks = new Map<string, Chunk>()

    onChunkCreated = new Topic<[chunk: Chunk]>()

    getChunk(x: number, y: number, z: number) {
        return this.chunks.get(Chunk.id(x, y, z))
    }

    getChunkAt(x: number, y: number, z: number) {
        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)

        return this.getChunk(chunkPosition.x, chunkPosition.y, chunkPosition.z)
    }

    getColor(x: number, y: number, z: number) {
        const chunk = this.getChunkAt(x, y, z)

        if (!chunk) {
            return undefined
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)

        return chunk.getColor(chunkLocalPosition.x, chunkLocalPosition.y, chunkLocalPosition.z)
    }

    getSolid(x: number, y: number, z: number) {
        const chunk = this.getChunkAt(x, y, z)

        if (!chunk) {
            return false
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)

        return chunk.getSolid(chunkLocalPosition.x, chunkLocalPosition.y, chunkLocalPosition.z)
    }

    setBlock(x: number, y: number, z: number, solid: boolean, color: number = 0) {
        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)
        const id = Chunk.id(chunkPosition.x, chunkPosition.y, chunkPosition.z)

        let chunk = this.chunks.get(id)

        if (!chunk) {
            const solidBuffer = new SharedArrayBuffer(Uint16Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 2)
            const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

            chunk = new Chunk(id, chunkPosition.clone(), solidBuffer, colorBuffer)

            this.chunks.set(id, chunk)

            this.onChunkCreated.emit(chunk)
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)

        chunk.setBlock(chunkLocalPosition.x, chunkLocalPosition.y, chunkLocalPosition.z, solid, color)

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
}

const _chunkPosition = new THREE.Vector3()
const _chunkLocalPosition = new THREE.Vector3()
