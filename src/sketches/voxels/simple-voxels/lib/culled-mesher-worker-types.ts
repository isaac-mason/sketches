import { CulledMesherChunkResult } from './culled-mesher'

export type RegisterChunkMessage = {
    type: 'register-chunk'
    id: string
    position: [number, number, number]
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer
}

export type RequestChunkMeshUpdateMessage = {
    type: 'request-chunk-mesh-update'
    id: string
}

export type ChunkMeshUpdateMessage = {
    type: 'chunk-mesh-update'
} & CulledMesherChunkResult

export type WorkerMessage = RegisterChunkMessage | RequestChunkMeshUpdateMessage | ChunkMeshUpdateMessage
