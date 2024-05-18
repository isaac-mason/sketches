import { Vector3 } from 'three'
import {
    ChunkMeshUpdateResultMessage,
    CulledMesherWorkerMessageType,
    RegisterChunkMessage,
    WorkerMessage,
} from './culled-mesher-worker-types'
import { Chunk, World } from './world'
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
        const chunk = remoteWorld.chunks.get(chunkId)

        if (!chunk) continue

        try {
            const { positions, indices, normals, colors, ambientOcclusion } = mesh(chunk, remoteWorld)

            const chunkMeshUpdateNotification: ChunkMeshUpdateResultMessage = {
                type: CulledMesherWorkerMessageType.CHUNK_MESH_UPDATE_RESULT,
                id: chunkId,
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
    }

    state.jobs = new Set([...incomplete, ...state.jobs])
}

const registerChunk = ({ id, position, solidBuffer, colorBuffer }: RegisterChunkMessage) => {
    const chunk = new Chunk(id, new Vector3(...position), solidBuffer, colorBuffer)

    remoteWorld.chunks.set(id, chunk)
}

worker.onmessage = (e) => {
    const data = e.data as WorkerMessage
    const { type } = data

    if (type === CulledMesherWorkerMessageType.REGISTER_CHUNK) {
        registerChunk(data)
    } else if (type === CulledMesherWorkerMessageType.REQUEST_CHUNK_MESH_UPDATE) {
        state.jobs.add(data.id)
    }
}

// const loop = () => {
//     update()

//     setTimeout(loop)
// }

// setTimeout(loop)

setInterval(update, 1000 / 120)
