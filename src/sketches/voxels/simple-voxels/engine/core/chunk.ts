import * as THREE from 'three'
import { Vec3, vec3 } from './vec3'
import { CHUNK_SIZE } from './constants'

export type BlockValue = { solid: false } | { solid: true; color: number }

export type VoxelChunk = {
    id: string
    position: THREE.Vector3

    solid: Uint8Array
    solidBuffer: SharedArrayBuffer

    color: Uint32Array
    colorBuffer: SharedArrayBuffer

    // based on distance from player
    priority: number
}

export const chunkId = ([x, y, z]: Vec3): string => {
    return `${x},${y},${z}`
}

export const isSolid = (position: Vec3, chunks: Map<string, VoxelChunk>) => {
    const chunk = chunks.get(chunkId(vec3.worldPositionToChunkPosition(position)))

    if (!chunk) {
        return false
    }

    const chunkDataIndex = vec3.toChunkIndex(position)
    return chunk.solid[chunkDataIndex] === 1
}

export const emptyChunk = (): VoxelChunk => {
    const solidBuffer = new SharedArrayBuffer(Uint8Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)
    const colorBuffer = new SharedArrayBuffer(Uint32Array.BYTES_PER_ELEMENT * CHUNK_SIZE ** 3)

    const solid = new Uint8Array(solidBuffer)
    solid.fill(0)

    const color = new Uint32Array(colorBuffer)
    color.fill(0)

    return {
        id: '',
        position: new THREE.Vector3(),
        solid,
        color,
        solidBuffer,
        colorBuffer,
        priority: 0,
    }
}

export const createVoxelChunk = (id: string, position: THREE.Vector3): VoxelChunk => {
    const chunk = emptyChunk()

    return {
        id,
        position,

        solid: chunk.solid,
        solidBuffer: chunk.solidBuffer,

        color: chunk.color,
        colorBuffer: chunk.colorBuffer,

        priority: 0,
    }
}
