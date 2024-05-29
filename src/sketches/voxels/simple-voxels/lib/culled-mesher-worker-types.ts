import { CulledMesherChunkResult } from './culled-mesher'

export const CulledMesherWorkerMessageType = {
    REGISTER_CHUNK: 0,
    REQUEST_CHUNK_MESH_UPDATE: 1,
    CHUNK_MESH_UPDATE_RESULT: 2,
} as const

export type RegisterChunkMessage = {
    type: typeof CulledMesherWorkerMessageType.REGISTER_CHUNK
    worldId: number
    chunkId: string
    position: [number, number, number]
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer
}

export type RequestChunkMeshUpdateMessage = {
    type: typeof CulledMesherWorkerMessageType.REQUEST_CHUNK_MESH_UPDATE
    worldId: number
    chunkId: string
}

export type ChunkMeshUpdateResultMessage = {
    type: typeof CulledMesherWorkerMessageType.CHUNK_MESH_UPDATE_RESULT
    worldId: number
} & CulledMesherChunkResult

export type WorkerMessage = RegisterChunkMessage | RequestChunkMeshUpdateMessage | ChunkMeshUpdateResultMessage
