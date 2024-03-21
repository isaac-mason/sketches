import * as THREE from 'three'
import { Vec3, vec3 } from './vec3'

export const CHUNK_BITS = 4
export const CHUNK_SIZE = Math.pow(2, 4)

export type BlockValue = { solid: false } | { solid: true; color: number }

export type VoxelChunk = {
    id: string
    position: THREE.Vector3

    solid: Uint8Array
    solidBuffer: SharedArrayBuffer

    color: Uint32Array
    colorBuffer: SharedArrayBuffer

    priority: number
}

export const chunkId = ([x, y, z]: Vec3): string => {
    return `${x},${y},${z}`
}

export const isSolid = (position: Vec3, chunks: Map<string, VoxelChunk>) => {
    const chunk = chunks.get(chunkId(vec3.worldToChunk(position)))

    if (!chunk) {
        return false
    }

    const chunkDataIndex = vec3.toChunkIndex(position)
    return chunk.solid[chunkDataIndex] === 1
}

export const createVoxelChunk = (id: string, position: THREE.Vector3): VoxelChunk => {
    const solidBuffer = new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
    const solid = new Uint8Array(solidBuffer)
    solid.fill(0)
    
    const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
    const color = new Uint32Array(colorBuffer)
    color.fill(0)

    return {
        id,
        position,
        solid,
        solidBuffer,
        color,
        colorBuffer,
        priority: 0,
    }
}
