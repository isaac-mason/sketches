import { useEffect, useMemo } from 'react'
import { Group } from 'three'
import { VoxelChunkMesh } from './voxel-chunk-mesh'
import VoxelChunkMesherWorker from './voxel-chunk-mesher.worker.ts?worker'
import {
    BlockValue,
    ChunkMeshUpdateNotificationMessage,
    RegisterChunkMessage,
    RequestChunkMeshUpdateMessage,
    Vec3,
    VoxelChunk,
    WorkerMessage,
} from './voxel-types'
import { CHUNK_SIZE, VoxelUtils } from './voxel-utils'

export type VoxelWorldParams = {
    workerPoolSize?: number
}

export class VoxelWorld {
    chunks = new Map<string, VoxelChunk>()

    chunkMeshes = new Map<string, VoxelChunkMesh>()

    group = new Group()

    private mesherWorkers: InstanceType<typeof VoxelChunkMesherWorker>[] = []

    private pendingMeshUpdates: Map<string, number> = new Map()

    private workerMeshUpdateRoundRobin = 0

    private params: Required<VoxelWorldParams>

    constructor({ workerPoolSize = 3 }: VoxelWorldParams = {}) {
        this.params = {
            workerPoolSize,
        }
    }

    init(): void {
        for (let i = 0; i < this.params.workerPoolSize; i++) {
            const worker = new VoxelChunkMesherWorker()

            worker.onmessage = (e) => {
                const { data: message } = e as { data: WorkerMessage }

                if (message.type === 'chunk-mesh-update-notification') {
                    this.onMeshUpdated(message)
                }
            }

            this.mesherWorkers.push(worker)
        }
    }

    destroy(): void {
        for (const worker of this.mesherWorkers) {
            worker.terminate()
        }
    }

    addChunk(id: string, chunkPosition: Vec3) {
        const chunk = VoxelUtils.emptyChunk(id, chunkPosition)
        this.chunks.set(id, chunk)

        const chunkMeshData = VoxelUtils.emptyChunkMeshData()
        const chunkMesh = new VoxelChunkMesh(this, chunk, chunkMeshData)
        this.chunkMeshes.set(id, chunkMesh)

        this.registerChunk({
            id,
            position: chunkPosition,
            chunkBuffers: {
                solid: chunk.solidBuffer,
                color: chunk.colorBuffer,
            },
            chunkMeshBuffers: {
                positions: chunkMeshData.positionsBuffer,
                indices: chunkMeshData.indicesBuffer,
                normals: chunkMeshData.normalsBuffer,
                colors: chunkMeshData.colorsBuffer,
                meta: chunkMeshData.metaBuffer,
            },
        })

        this.group.add(chunkMesh.mesh)

        return chunk
    }

    setBlock(position: Vec3, value: BlockValue): void {
        const chunkPosition = VoxelUtils.worldPositionToChunkPosition(position)
        const id = VoxelUtils.chunkId(chunkPosition)

        let chunk = this.chunks.get(id)

        if (!chunk) {
            chunk = this.addChunk(id, chunkPosition)
        }

        const index = VoxelUtils.positionToChunkIndex(position)
        chunk.solid[index] = value.solid ? 1 : 0
        chunk.color[index] = value.solid ? value.color : 0

        this.remesh(id)

        // check if we need to make neighbour chunks dirty
        if (!value.solid) {
            for (let axis = 0; axis < 3; axis++) {
                for (const [pos, dir] of [
                    [0, -1],
                    [CHUNK_SIZE - 1, 1],
                ]) {
                    if (position[axis] !== pos) continue

                    const offset: Vec3 = [0, 0, 0]
                    offset[axis] = dir

                    const neighbourPosition: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]

                    if (!this.isSolid(neighbourPosition)) continue

                    const neighbourChunkId = VoxelUtils.chunkId([
                        chunkPosition[0] + offset[0],
                        chunkPosition[1] + offset[1],
                        chunkPosition[2] + offset[2],
                    ])

                    this.remesh(neighbourChunkId)
                }
            }
        }
    }

    isSolid(position: Vec3): boolean {
        return VoxelUtils.isSolid(position, this.chunks)
    }

    private registerChunk({ id, position, chunkBuffers, chunkMeshBuffers }: Omit<RegisterChunkMessage, 'type'>): void {
        const data: RegisterChunkMessage = {
            type: 'register-chunk',
            id,
            position,
            chunkBuffers,
            chunkMeshBuffers,
        }

        for (const worker of this.mesherWorkers) {
            worker.postMessage(data)
        }
    }

    private remesh(chunkId: string): void {
        const data: RequestChunkMeshUpdateMessage = {
            type: 'request-chunk-mesh-update',
            id: chunkId,
        }

        const workerWithPendingMeshUpdate = this.pendingMeshUpdates.get(chunkId)

        if (workerWithPendingMeshUpdate) {
            this.mesherWorkers[workerWithPendingMeshUpdate].postMessage(data)
            return
        }

        const workerIndex = this.workerMeshUpdateRoundRobin
        const worker = this.mesherWorkers[workerIndex]
        this.pendingMeshUpdates.set(chunkId, workerIndex)

        worker.postMessage(data)

        this.workerMeshUpdateRoundRobin = (this.workerMeshUpdateRoundRobin + 1) % this.mesherWorkers.length
    }

    private onMeshUpdated({ id }: ChunkMeshUpdateNotificationMessage) {
        this.pendingMeshUpdates.delete(id)
        this.chunkMeshes.get(id)!.update()
    }
}

export const useVoxelWorld = () => {
    const world = useMemo<VoxelWorld>(() => new VoxelWorld(), [])

    useEffect(() => {
        world.init()

        return () => world.destroy()
    }, [world])

    return world
}
