import { Topic } from '@/common/utils/topic'
import * as THREE from 'three'
import { ChunkGeometry } from './chunk-geometry'
import { createChunkMaterial } from './chunk-material'
import {
    ChunkMeshUpdateResultMessage,
    CulledMesherWorkerMessageType,
    RegisterChunkMessage,
    RequestChunkMeshUpdateMessage,
    WorkerMessage,
} from './culled-mesher-worker-types'
import CulledMesherWorker from './culled-mesher.worker?worker'
import { BlockValue, CHUNK_SIZE, Chunk, World, worldPositionToChunkLocalPosition, worldPositionToChunkPosition } from './world'

const _vector3 = new THREE.Vector3()

const _chunkLocal = new THREE.Vector3()
const _neighbourPosition = new THREE.Vector3()
const _neighbourChunk = new THREE.Vector3()

const neighbourDirections = [
    { x: -1, y: 0, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: 0, z: 1 },
]

type ChunkState = {
    loaded: boolean
    priority: number
}

type ChunkMesh = {
    initialised: boolean
    mesh: THREE.Mesh<ChunkGeometry, THREE.Material>
}

export type VoxelsChange = { position: THREE.Vector3Like; value: BlockValue; chunk: Chunk }

export type VoxelsWorkerPoolParams = {
    workerPoolSize?: number
}

export class VoxelsWorkerPool {
    private workers: InstanceType<typeof CulledMesherWorker>[] = []
    private workerRoundRobin = 0
    private pendingMeshUpdates: Map<string, number> = new Map()
    private workerPoolSize: number

    constructor(params?: VoxelsWorkerPoolParams) {
        this.workerPoolSize = params?.workerPoolSize ?? 3
    }

    onMesherResult = new Topic<[ChunkMeshUpdateResultMessage]>()

    remesh(world: World, chunkId: string) {
        const data: RequestChunkMeshUpdateMessage = {
            type: CulledMesherWorkerMessageType.REQUEST_CHUNK_MESH_UPDATE,
            worldId: world.id,
            chunkId,
        }

        const jobId = VoxelsWorkerPool.jobId(world.id, chunkId)
        const workerWithPendingMeshUpdate = this.pendingMeshUpdates.get(jobId)

        if (workerWithPendingMeshUpdate) {
            this.workers[workerWithPendingMeshUpdate].postMessage(data)
            return
        }

        const workerIndex = this.workerRoundRobin
        const worker = this.workers[workerIndex]
        this.pendingMeshUpdates.set(jobId, workerIndex)

        worker.postMessage(data)

        this.workerRoundRobin = (this.workerRoundRobin + 1) % this.workers.length
    }

    registerChunk(world: World, chunk: Chunk) {
        const data: RegisterChunkMessage = {
            type: CulledMesherWorkerMessageType.REGISTER_CHUNK,
            worldId: world.id,
            chunkId: chunk.id,
            position: chunk.position.toArray(),
            solidBuffer: chunk.solidBuffer,
            colorBuffer: chunk.colorBuffer,
        }

        for (const worker of this.workers) {
            worker.postMessage(data)
        }
    }

    connect() {
        /* create workers */
        for (let i = 0; i < this.workerPoolSize; i++) {
            const worker = new CulledMesherWorker()

            worker.onmessage = (e) => {
                const { data: message } = e as { data: WorkerMessage }
                if (message.type === CulledMesherWorkerMessageType.CHUNK_MESH_UPDATE_RESULT) {
                    this.onMesherResult.emit(message)
                    this.pendingMeshUpdates.delete(VoxelsWorkerPool.jobId(message.worldId, message.chunkId))
                }
            }

            this.workers.push(worker)
        }
    }

    disconnect() {
        this.workerRoundRobin = 0
        this.pendingMeshUpdates.clear()

        for (const worker of this.workers) {
            worker.terminate()
        }

        this.workers = []
    }

    static jobId(worldId: number, chunkId: string) {
        return `${worldId}:${chunkId}`
    }
}

type VoxelsParams = {
    voxelsWorkerPool: VoxelsWorkerPool
}

export class Voxels {
    actor = new THREE.Vector3()

    viewDistance = 500

    get chunkViewDistance() {
        return Math.ceil(this.viewDistance / CHUNK_SIZE)
    }

    world = new World()

    onUpdate = new Topic<[changes: VoxelsChange[]]>()

    onChunkMeshInitialised = new Topic<[chunk: Chunk, mesh: THREE.Mesh<ChunkGeometry, THREE.Material>]>()
    onChunkMeshUpdated = new Topic<[chunk: Chunk, mesh: THREE.Mesh<ChunkGeometry, THREE.Material>]>()

    chunkState = new Map<string, ChunkState>()
    chunkMeshes = new Map<string, ChunkMesh>()

    private chunkMaterial: THREE.Material

    private dirtyChunks = new Set<string>()
    private dirtyUnloadedChunks = new Set<string>()

    private setBlockRequests: { position: THREE.Vector3Like; value: BlockValue }[] = []

    private voxelsWorkerPool: VoxelsWorkerPool

    constructor({ voxelsWorkerPool }: VoxelsParams) {
        this.chunkMaterial = createChunkMaterial()

        this.voxelsWorkerPool = voxelsWorkerPool

        this.voxelsWorkerPool.onMesherResult.add(this.onMesherResult)
        this.world.onChunkCreated.add(this.onChunkCreated)
    }

    private onMesherResult = (message: ChunkMeshUpdateResultMessage) => {
        if (message.worldId !== this.world.id) return

        this.processMesherResult(message)
    }

    private onChunkCreated = (chunk: Chunk) => {
        this.chunkState.set(chunk.id, { loaded: false, priority: 0 })

        const mesh = {
            initialised: false,
            mesh: new THREE.Mesh(new ChunkGeometry(), this.chunkMaterial),
        }

        this.chunkMeshes.set(chunk.id, mesh)
        this.dirtyChunks.add(chunk.id)

        this.voxelsWorkerPool.registerChunk(this.world, chunk)
    }

    update() {
        const changes = this.processBlockChanges()
        this.updateChunkStates()
        this.createMesherJobs(changes)
    }

    setBlock({ x, y, z }: THREE.Vector3Like, value: BlockValue) {
        this.setBlockRequests.push({ position: { x, y, z }, value })
    }

    dispose() {
        this.voxelsWorkerPool.onMesherResult.remove(this.onMesherResult)
        this.world.onChunkCreated.remove(this.onChunkCreated)

        this.chunkMaterial.dispose()

        for (const {
            mesh: { geometry },
        } of this.chunkMeshes.values()) {
            geometry.dispose()
        }
    }

    private processBlockChanges(): VoxelsChange[] {
        const changes: VoxelsChange[] = []

        const setBlockRequests = this.setBlockRequests
        this.setBlockRequests = []

        for (const { position, value } of setBlockRequests) {
            const { chunk } = this.world.setBlock(position, value)

            changes.push({ position, value, chunk })
        }

        if (changes.length > 0) {
            this.onUpdate.emit(changes)
        }

        return changes
    }

    private updateChunkStates() {
        for (const [, chunk] of this.world.chunks) {
            const playerCurrentChunk = worldPositionToChunkPosition(this.actor, _vector3)

            const chunkDistance = playerCurrentChunk.distanceTo(chunk.position)

            const chunkState = this.chunkState.get(chunk.id)!

            const shouldBeLoaded = chunkDistance <= this.chunkViewDistance
            const loaded = chunkState.loaded

            if (shouldBeLoaded && !loaded) {
                chunkState.loaded = true

                if (this.dirtyUnloadedChunks.has(chunk.id)) {
                    this.dirtyChunks.add(chunk.id)
                    this.dirtyUnloadedChunks.delete(chunk.id)
                }
            } else if (!shouldBeLoaded && loaded) {
                chunkState.loaded = false
            }

            const chunkMesh = this.chunkMeshes.get(chunk.id)!
            chunkMesh.mesh.visible = chunkState.loaded

            chunkState.priority = -chunkDistance
        }
    }

    private createMesherJobs(changes: VoxelsChange[]) {
        // don't try to optimise number of changes is large, just remesh chunks and their neighbours
        if (changes.length >= 10000) {
            const touchedChunks = new Set(changes.map((change) => change.chunk))

            for (const chunk of touchedChunks) {
                this.dirtyChunks.add(chunk.id)

                for (const { x: dx, y: dy, z: dz } of neighbourDirections) {
                    const neighbour = {
                        x: chunk.position.x + dx,
                        y: chunk.position.y + dy,
                        z: chunk.position.z + dz,
                    }

                    const neighbourChunkId = Chunk.id(neighbour)

                    this.dirtyChunks.add(neighbourChunkId)
                }
            }
        } else {
            for (const { chunk, position } of changes) {
                this.dirtyChunks.add(chunk.id)

                // check if we need to make neighbour chunks dirty
                // we need to check corners as well for AO
                for (const { x: dx, y: dy, z: dz } of neighbourDirections) {
                    const chunkLocal = worldPositionToChunkLocalPosition(position, _chunkLocal)
                    if (
                        chunkLocal.x !== 0 &&
                        chunkLocal.x !== CHUNK_SIZE - 1 &&
                        chunkLocal.y !== 0 &&
                        chunkLocal.y !== CHUNK_SIZE - 1 &&
                        chunkLocal.z !== 0 &&
                        chunkLocal.z !== CHUNK_SIZE - 1
                    ) {
                        continue
                    }

                    const neighbour = _neighbourPosition.set(position.x + dx, position.y + dy, position.z + dz)

                    const neighbourChunkId = Chunk.id(worldPositionToChunkPosition(neighbour, _neighbourChunk))

                    if (neighbourChunkId !== chunk.id) {
                        this.dirtyChunks.add(neighbourChunkId)
                    }
                }
            }
        }

        const toRemesh: string[] = []

        const dirty = Array.from(this.dirtyChunks)
        this.dirtyChunks.clear()

        for (const chunk of dirty) {
            const state = this.chunkState.get(chunk)

            // the neighbour chunk might not exist
            if (!state) continue

            if (state.loaded) {
                toRemesh.push(chunk)
            } else {
                this.dirtyUnloadedChunks.add(chunk)
            }
        }

        const prioritised = toRemesh.sort((a, b) => {
            const aState = this.chunkState.get(a)!
            const bState = this.chunkState.get(b)!

            return bState.priority - aState.priority
        })

        for (const chunkId of prioritised) {
            this.voxelsWorkerPool.remesh(this.world, chunkId)
        }
    }

    private processMesherResult(chunkMesherData: ChunkMeshUpdateResultMessage) {
        const { chunkId: id } = chunkMesherData

        const chunk = this.world.chunks.get(id)
        const chunkMesh = this.chunkMeshes.get(id)

        if (!chunk || !chunkMesh) return

        const geometry = chunkMesh.mesh.geometry
        geometry.updateChunk(chunkMesherData)

        chunkMesh.mesh.position.set(chunk.position.x * CHUNK_SIZE, chunk.position.y * CHUNK_SIZE, chunk.position.z * CHUNK_SIZE)

        if (!chunkMesh.initialised) {
            chunkMesh.initialised = true

            this.onChunkMeshInitialised.emit(chunk, chunkMesh.mesh)
        }

        this.onChunkMeshUpdated.emit(chunk, chunkMesh.mesh)
    }
}
