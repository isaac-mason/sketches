import { Vector3 } from 'three'
import {
    ChunkMeshUpdateResultMessage,
    CulledMesherWorkerMessageType,
    RegisterChunkMessage,
    RequestChunkMeshUpdateMessage,
    WorkerMessage,
} from './culled-mesher-worker-types'
import { Chunk, World } from './world'
import { mesh } from './culled-mesher'

const state = {
    worlds: new Map<number, World>(),
    worldChunkMeshJobs: new Map<number, Set<string>>(),
}

const worker = self as unknown as Worker

const update = () => {
    for (const [worldId, chunkIds] of state.worldChunkMeshJobs) {
        const remoteWorld = state.worlds.get(worldId)

        if (!remoteWorld) {
            continue
        }

        const incomplete = new Set(chunkIds)

        const chunksToProcess = chunkIds

        state.worldChunkMeshJobs.set(worldId, new Set())

        for (const chunkId of chunksToProcess) {
            const chunk = remoteWorld.chunks.get(chunkId)

            if (!chunk) {
                continue
            }

            try {
                const { positions, indices, normals, colors, ambientOcclusion } = mesh(chunk, remoteWorld)

                const chunkMeshUpdateNotification: ChunkMeshUpdateResultMessage = {
                    type: CulledMesherWorkerMessageType.CHUNK_MESH_UPDATE_RESULT,
                    worldId,
                    chunkId: chunkId,
                    positions,
                    indices,
                    normals,
                    colors,
                    ambientOcclusion,
                }

                worker.postMessage(chunkMeshUpdateNotification, {
                    transfer: [positions.buffer, indices.buffer, normals.buffer, colors.buffer, ambientOcclusion.buffer],
                })

                incomplete.delete(chunkId)
            } catch (e) {
                // swallow
            }

            state.worldChunkMeshJobs.set(worldId, new Set([...incomplete, ...state.worldChunkMeshJobs.get(worldId)!]))
        }
    }
}

const registerChunk = ({ worldId, chunkId, position, solidBuffer, colorBuffer }: RegisterChunkMessage) => {
    let remoteWorld = state.worlds.get(worldId)

    if (!remoteWorld) {
        remoteWorld = new World()
        state.worlds.set(worldId, remoteWorld)
    }

    const chunk = new Chunk(chunkId, new Vector3(...position), solidBuffer, colorBuffer)

    remoteWorld.chunks.set(chunkId, chunk)
}

const requestChunkMeshUpdate = ({ worldId, chunkId }: RequestChunkMeshUpdateMessage) => {
    let jobs = state.worldChunkMeshJobs.get(worldId)

    if (!jobs) {
        jobs = new Set()
        state.worldChunkMeshJobs.set(worldId, jobs)
    }

    jobs.add(chunkId)
}

worker.onmessage = (e) => {
    const data = e.data as WorkerMessage
    const { type } = data

    if (type === CulledMesherWorkerMessageType.REGISTER_CHUNK) {
        registerChunk(data)
    } else if (type === CulledMesherWorkerMessageType.REQUEST_CHUNK_MESH_UPDATE) {
        requestChunkMeshUpdate(data)
    }
}

setInterval(update, 1000 / 120)
