import * as THREE from 'three'
import { Vector3Map } from './utils'

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
    solidBuffer: ArrayBuffer

    type: Uint16Array
    typeBuffer: ArrayBuffer

    constructor(id: string, position: THREE.Vector3, solidBuffer: ArrayBuffer, typeBuffer: ArrayBuffer) {
        this.id = id
        this.position = position
        this.solidBuffer = solidBuffer
        this.solid = new Uint16Array(solidBuffer)
        this.typeBuffer = typeBuffer
        this.type = new Uint16Array(typeBuffer)
    }

    getSolid(x: number, y: number, z: number) {
        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)
        const solidColumnMask = 1 << chunkLocalPosition.y
        const solid = this.solid[Chunk.solidIndex(chunkLocalPosition)] & solidColumnMask

        return !!solid
    }

    getType(x: number, y: number, z: number) {
        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)

        return this.type[Chunk.typeIndex(chunkLocalPosition)]
    }

    static solidIndex(chunkLocalPosition: THREE.Vector3Like) {
        return chunkLocalPosition.x + chunkLocalPosition.z * CHUNK_SIZE
    }

    static typeIndex(chunkLocalPosition: THREE.Vector3Like) {
        return chunkLocalPosition.x + chunkLocalPosition.z * CHUNK_SIZE + chunkLocalPosition.y * CHUNK_SIZE * CHUNK_SIZE
    }

    static id(position: THREE.Vector3Like) {
        return `${position.x},${position.y},${position.z}`
    }
}

export class World {
    chunks = new Vector3Map<Chunk>()

    getSolid(x: number, y: number, z: number) {
        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)
        const chunk = this.chunks.get(chunkPosition.x, chunkPosition.y, chunkPosition.z)

        if (!chunk) {
            return false
        }

        return chunk.getSolid(x, y, z)
    }

    getType(x: number, y: number, z: number) {
        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)
        const chunk = this.chunks.get(chunkPosition.x, chunkPosition.y, chunkPosition.z)

        if (!chunk) {
            return 0
        }

        return chunk.getType(x, y, z)
    }

    setBlock(x: number, y: number, z: number, solid: boolean, type: number = 0) {
        const chunkPosition = worldPositionToChunkPosition(x, y, z, _chunkPosition)

        let chunk = this.chunks.get(chunkPosition.x, chunkPosition.y, chunkPosition.z)

        if (!chunk) {
            const solidBuffer = new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
            const typeBuffer = new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

            chunk = new Chunk(Chunk.id(chunkPosition), chunkPosition.clone(), solidBuffer, typeBuffer)

            this.chunks.set(chunkPosition, chunk)
        }

        const chunkLocalPosition = worldPositionToChunkLocalPosition(x, y, z, _chunkLocalPosition)

        const solidColumnMask = 1 << chunkLocalPosition.y

        if (solid) {
            chunk.solid[Chunk.solidIndex(chunkLocalPosition)] |= solidColumnMask
        } else {
            chunk.solid[Chunk.solidIndex(chunkLocalPosition)] &= ~solidColumnMask
        }

        chunk.type[Chunk.typeIndex(chunkLocalPosition)] = solid ? type : 0

        return {
            success: true,
            chunk,
        }
    }
}

const _chunkPosition = new THREE.Vector3()
const _chunkLocalPosition = new THREE.Vector3()
