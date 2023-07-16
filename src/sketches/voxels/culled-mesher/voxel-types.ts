export type Vec3 = [x: number, y: number, z: number]

export type BlockValue = { solid: false } | { solid: true; color: number }

export type VoxelChunk = {
    id: string
    position: Vec3
    solid: Uint8Array
    color: Uint32Array
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer
}

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

export type ChunkMeshUpdateNotificationMessage = {
    type: 'chunk-mesh-update-notification'
    id: string
}

export type WorkerMessage = RegisterChunkMessage | RequestChunkMeshUpdateMessage | ChunkMeshUpdateNotificationMessage
