import { Vec3 } from '../core'

export type RegisterChunkMessage = {
    type: 'register-chunk'
    id: string
    position: Vec3
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer
}

export type RequestChunkMeshUpdateMessage = {
    type: 'request-chunk-mesh-update'
    id: string
}

export type ChunkMeshUpdateMessage = {
    type: 'chunk-mesh-update'
    id: string
    positions: Float32Array
    indices: Uint32Array
    normals: Float32Array
    colors: Float32Array
    ambientOcclusion: Float32Array
}

export type WorkerMessage = RegisterChunkMessage | RequestChunkMeshUpdateMessage | ChunkMeshUpdateMessage
