import { Vec3 } from '../core'

export type VoxelChunkMeshData = {
    positions: Float32Array
    positionsBuffer: SharedArrayBuffer

    indices: Uint32Array
    indicesBuffer: SharedArrayBuffer

    normals: Float32Array
    normalsBuffer: SharedArrayBuffer

    colors: Float32Array
    colorsBuffer: SharedArrayBuffer

    meta:
        | Uint32Array
        | [meshNeedsUpdate: number, positionsCount: number, indicesCount: number, normalsCount: number, colorsCount: number]
    metaBuffer: SharedArrayBuffer
}

export type RegisterChunkMessage = {
    type: 'register-chunk'
    id: string
    position: Vec3
    chunkBuffers: {
        solid: SharedArrayBuffer
        color: SharedArrayBuffer
    }
    chunkMeshBuffers: {
        positions: SharedArrayBuffer
        indices: SharedArrayBuffer
        normals: SharedArrayBuffer
        colors: SharedArrayBuffer
        meta: SharedArrayBuffer
    }
}

export type RequestChunkMeshUpdateMessage = {
    type: 'request-chunk-mesh-update'
    id: string
}

export type ChunkMeshUpdateMessage = {
    type: 'chunk-mesh-update'
    id: string
}

export type WorkerMessage = RegisterChunkMessage | RequestChunkMeshUpdateMessage | ChunkMeshUpdateMessage
