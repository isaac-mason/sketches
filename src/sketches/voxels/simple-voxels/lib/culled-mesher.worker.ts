import { Vector3 } from 'three'
import { ChunkMeshUpdateMessage, RegisterChunkMessage, WorkerMessage } from './culled-mesher-worker-types'
import { VoxelChunk, World } from './world'
import { mesh } from './culled-mesher'

const remoteWorld = new World()

const state = {
    jobs: new Set<string>(),
}

const worker = self as unknown as Worker

const update = () => {
    const incomplete = new Set(state.jobs)

    const jobs = state.jobs
    state.jobs = new Set()

    for (const chunkId of jobs) {
        const chunk = remoteWorld.getChunkById(chunkId)

        if (!chunk) continue

        try {
            const { positions, indices, normals, colors, ambientOcclusion } = mesh(remoteWorld, chunk)

            const chunkMeshUpdateNotification: ChunkMeshUpdateMessage = {
                type: 'chunk-mesh-update',
                id: chunkId,
                positions,
                indices,
                normals,
                colors,
                ambientOcclusion,
            }

            worker.postMessage(chunkMeshUpdateNotification, [
                positions.buffer,
                indices.buffer,
                normals.buffer,
                colors.buffer,
                ambientOcclusion.buffer,
            ])

            incomplete.delete(chunkId)
        } catch (e) {
            // swallow
        }
    }

    state.jobs = new Set([...incomplete, ...state.jobs])
}

const registerChunk = ({ id, position, solidBuffer, colorBuffer }: RegisterChunkMessage) => {
    const chunk: VoxelChunk = {
        id,
        position: new Vector3(...position),
        solid: new Uint8Array(solidBuffer),
        solidBuffer,
        color: new Uint32Array(colorBuffer),
        colorBuffer,
    }

    remoteWorld.chunks.set(id, chunk)
}

worker.onmessage = (e) => {
    const data = e.data as WorkerMessage
    const { type } = data

    if (type === 'register-chunk') {
        registerChunk(data)
    } else if (type === 'request-chunk-mesh-update') {
        state.jobs.add(data.id)
    }
}

setInterval(() => {
    update()
}, 1 / 60)
