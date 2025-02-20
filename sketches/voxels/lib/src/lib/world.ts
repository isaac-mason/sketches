import * as THREE from 'three'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, CHUNK_BITS)

export const worldPositionToChunkPosition = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
    return out.set(x & (CHUNK_SIZE - 1), y & (CHUNK_SIZE - 1), z & (CHUNK_SIZE - 1))
}

export const worldPositionToChunkCoordinate = (x: number, y: number, z: number, out = new THREE.Vector3()): THREE.Vector3 => {
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
    worldPositionOffset: THREE.Vector3

    type: Uint16Array
    typeBuffer: ArrayBuffer

    constructor(id: string, position: THREE.Vector3, typeBuffer: ArrayBuffer) {
        this.id = id
        this.position = position
        this.worldPositionOffset = this.position.clone().multiplyScalar(CHUNK_SIZE)
        this.typeBuffer = typeBuffer
        this.type = new Uint16Array(typeBuffer)
    }

    getType(x: number, y: number, z: number) {
        const chunkLocalPosition = worldPositionToChunkPosition(x, y, z, _chunkLocalPosition)

        return this.type[Chunk.typeIndex(chunkLocalPosition.x, chunkLocalPosition.y, chunkLocalPosition.z)]
    }

    static typeIndex(x: number, y: number, z: number) {
        return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE
    }

    static id(x: number, y: number, z: number) {
        return `${x},${y},${z}`
    }
}

export class World {
    chunks = new Map<string, Chunk>()

    getType(x: number, y: number, z: number) {
        const chunkCoordinate = worldPositionToChunkCoordinate(x, y, z, _chunkPosition)
        const id = Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z)
        const chunk = this.chunks.get(id)

        if (!chunk) {
            return 0
        }

        return chunk.getType(x, y, z)
    }

    setType(x: number, y: number, z: number, type: number = 0) {
        const chunkCoordinate = worldPositionToChunkCoordinate(x, y, z, _chunkPosition)
        const id = Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z)
        let chunk = this.chunks.get(id)

        if (!chunk) {
            const typeBuffer = new ArrayBuffer(Uint16Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

            const chunkId = Chunk.id(chunkCoordinate.x, chunkCoordinate.y, chunkCoordinate.z)
            chunk = new Chunk(chunkId, chunkCoordinate.clone(), typeBuffer)

            this.chunks.set(chunkId, chunk)
        }

        const chunkLocalPosition = worldPositionToChunkPosition(x, y, z, _chunkLocalPosition)

        chunk.type[Chunk.typeIndex(chunkLocalPosition.x, chunkLocalPosition.y, chunkLocalPosition.z)] = type
    }
}

const _chunkPosition = new THREE.Vector3()
const _chunkLocalPosition = new THREE.Vector3()
