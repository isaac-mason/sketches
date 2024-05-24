import * as THREE from 'three'
import { Topic } from 'arancini/events'
import { RaycastResult, raycast } from './raycast'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, CHUNK_BITS)

export const worldPositionToChunkLocalPosition = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
    return out.set(x & (CHUNK_SIZE - 1), y & (CHUNK_SIZE - 1), z & (CHUNK_SIZE - 1))
}

export const worldPositionToChunkPosition = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
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

export const chunkPositionToWorldPosition = ({ x, y, z }: THREE.Vector3Like, out = new THREE.Vector3()): THREE.Vector3 => {
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

    setBlock(chunkLocalPosition: THREE.Vector3Like, value: BlockValue) {
        const solidColumnMask = 1 << chunkLocalPosition.y

        if (value.solid) {
            this.solid[Chunk.solidIndex(chunkLocalPosition)] |= solidColumnMask
        } else {
            this.solid[Chunk.solidIndex(chunkLocalPosition)] &= ~solidColumnMask
        }

        this.color[Chunk.colorIndex(chunkLocalPosition)] = value.solid ? value.color : 0
    }

    getSolid(chunkLocalPosition: THREE.Vector3Like) {
        const solidColumnMask = 1 << chunkLocalPosition.y

        const solid = this.solid[Chunk.solidIndex(chunkLocalPosition)] & solidColumnMask

        return !!solid
    }

    getColor(chunkLocalPosition: THREE.Vector3Like) {
        return this.color[Chunk.colorIndex(chunkLocalPosition)]
    }

    getBlock(chunkLocalPosition: THREE.Vector3Like) {
        const solidColumnMask = 1 << chunkLocalPosition.y
        const solid = this.solid[Chunk.solidIndex(chunkLocalPosition)] & solidColumnMask

        const color = this.color[Chunk.colorIndex(chunkLocalPosition)]

        return {
            solid,
            color,
        }
    }

    static solidIndex(chunkLocalPosition: THREE.Vector3Like) {
        return chunkLocalPosition.x + chunkLocalPosition.z * CHUNK_SIZE
    }

    static colorIndex(chunkLocalPosition: THREE.Vector3Like) {
        return chunkLocalPosition.x + chunkLocalPosition.z * CHUNK_SIZE + chunkLocalPosition.y * CHUNK_SIZE * CHUNK_SIZE
    }

    static id({ x, y, z }: THREE.Vector3Like): string {
        return `${x},${y},${z}`
    }
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
    chunks = new Map<string, Chunk>()

    onChunkCreated = new Topic<[chunk: Chunk]>()

    getBlock(position: THREE.Vector3Like) {
        const chunk = this.chunks.get(Chunk.id(worldPositionToChunkPosition(position, _chunkPosition)))

        if (!chunk) {
            return {
                solid: false,
                chunk: null,
            }
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(position, _chunkLocalPosition)

        return chunk.getBlock(chunkLocalPosition)
    }

    getSolid(position: THREE.Vector3Like) {
        const chunk = this.chunks.get(Chunk.id(worldPositionToChunkPosition(position, _chunkPosition)))

        if (!chunk) {
            return false
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(position, _chunkLocalPosition)

        return chunk.getSolid(chunkLocalPosition)
    }

    setBlock(position: THREE.Vector3Like, value: BlockValue) {
        const chunkPosition = worldPositionToChunkPosition(position, _chunkPosition)
        const id = Chunk.id(chunkPosition)

        let chunk = this.chunks.get(id)

        if (!chunk) {
            const solidBuffer = new SharedArrayBuffer(Uint16Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 2)
            const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

            chunk = new Chunk(id, chunkPosition.clone(), solidBuffer, colorBuffer)

            this.chunks.set(id, chunk)

            this.onChunkCreated.emit(chunk)
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(position, _chunkLocalPosition)

        chunk.setBlock(chunkLocalPosition, value)

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
