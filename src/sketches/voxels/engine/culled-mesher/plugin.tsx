import { Component, Entity, System } from 'arancini'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { CHUNK_SIZE, EventsComponent, VoxelChunkComponent, VoxelWorldComponent, VoxelWorldCoreSystem } from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import VoxelChunkMesherWorker from './culled-mesher.worker.ts?worker'
import {
    ChunkMeshUpdateNotificationMessage,
    RegisterChunkMessage,
    RequestChunkMeshUpdateMessage,
    VoxelChunkMeshData,
    WorkerMessage,
} from './types'
import { emptyChunkMeshData } from './utils'

export class VoxelChunkMeshComponent extends Component {
    voxelChunkMeshData: VoxelChunkMeshData = emptyChunkMeshData()

    geometry!: BufferGeometry

    material!: MeshStandardMaterial

    mesh!: Mesh

    construct() {
        this.voxelChunkMeshData.colors.fill(0)
        this.voxelChunkMeshData.indices.fill(0)
        this.voxelChunkMeshData.normals.fill(0)
        this.voxelChunkMeshData.positions.fill(0)
        this.voxelChunkMeshData.meta.fill(0)

        this.geometry = new BufferGeometry()
        this.material = new MeshStandardMaterial({
            vertexColors: true,
        })
        this.mesh = new Mesh()

        this.mesh.geometry = this.geometry
        this.mesh.material = this.material
    }
}

export class VoxelChunkMesherSystem extends System {
    chunkQuery = this.query([VoxelChunkComponent])

    voxelWorld = this.singleton(VoxelWorldComponent, { required: true })!

    private mesherWorkers: InstanceType<typeof VoxelChunkMesherWorker>[] = []

    private pendingMeshUpdates: Map<string, number> = new Map()

    private workerMeshUpdateRoundRobin = 0

    private static WORKER_POOL_SIZE = 3

    static PRIORITY = VoxelWorldCoreSystem.PRIORITY - 1

    onInit() {
        for (let i = 0; i < VoxelChunkMesherSystem.WORKER_POOL_SIZE; i++) {
            const worker = new VoxelChunkMesherWorker()

            worker.onmessage = (e) => {
                const { data: message } = e as { data: WorkerMessage }

                if (message.type === 'chunk-mesh-update-notification') {
                    this.onMeshUpdated(message)
                }
            }

            this.mesherWorkers.push(worker)
        }

        this.chunkQuery.onEntityAdded.add((e) => {
            this.registerChunk(e)

            e.get(EventsComponent).dirty.add(() => {
                const voxelChunk = e.get(VoxelChunkComponent)
                this.remesh(voxelChunk.id)
            })
        })

        this.chunkQuery.onEntityRemoved.add((e) => {
            // todo
        })
    }

    onDestroy() {
        for (const worker of this.mesherWorkers) {
            worker.terminate()
        }
        this.mesherWorkers = []
    }

    private registerChunk(e: Entity): void {
        if (e.has(VoxelChunkMeshComponent)) return

        const voxelChunk = e.get(VoxelChunkComponent)
        const voxelChunkMesh = e.add(VoxelChunkMeshComponent)

        const data: RegisterChunkMessage = {
            type: 'register-chunk',
            id: voxelChunk.id,
            position: voxelChunk.position,
            chunkBuffers: {
                solid: voxelChunk.solidBuffer,
                color: voxelChunk.colorBuffer,
            },
            chunkMeshBuffers: {
                positions: voxelChunkMesh.voxelChunkMeshData.positionsBuffer,
                indices: voxelChunkMesh.voxelChunkMeshData.indicesBuffer,
                normals: voxelChunkMesh.voxelChunkMeshData.normalsBuffer,
                colors: voxelChunkMesh.voxelChunkMeshData.colorsBuffer,
                meta: voxelChunkMesh.voxelChunkMeshData.metaBuffer,
            },
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

        const entity = this.voxelWorld.chunkEntities.get(id)!

        this.updateVoxelChunkMesh(entity)
    }

    private updateVoxelChunkMesh(entity: Entity) {
        const voxelChunk = entity.get(VoxelChunkComponent)
        const voxelChunkMesh = entity.get(VoxelChunkMeshComponent)

        const {
            positions,
            indices,
            normals,
            colors,
            meta: [positionsCount, indicesCount, normalsCount, colorsCount],
        } = voxelChunkMesh.voxelChunkMeshData

        voxelChunkMesh.geometry.setIndex(new BufferAttribute(indices.slice(0, indicesCount), 1))
        voxelChunkMesh.geometry.setAttribute('position', new BufferAttribute(positions.slice(0, positionsCount), 3))
        voxelChunkMesh.geometry.setAttribute('normal', new BufferAttribute(normals.slice(0, normalsCount), 3))
        voxelChunkMesh.geometry.setAttribute('color', new BufferAttribute(colors.slice(0, colorsCount), 3))

        voxelChunkMesh.geometry.computeBoundingBox()
        voxelChunkMesh.geometry.computeBoundingSphere()

        voxelChunkMesh.mesh.position.set(
            voxelChunk.position[0] * CHUNK_SIZE,
            voxelChunk.position[1] * CHUNK_SIZE,
            voxelChunk.position[2] * CHUNK_SIZE,
        )
    }
}

export const CulledMesherPlugin = {
    components: [VoxelChunkMeshComponent],
    systems: [VoxelChunkMesherSystem],
    setup: (_, ecs) => {
        const CulledMeshes = () => (
            <ecs.QueryEntities query={[VoxelChunkMeshComponent]}>
                {(entity) => {
                    const voxelChunkMesh = entity.get(VoxelChunkMeshComponent)

                    return <primitive object={voxelChunkMesh.mesh} />
                }}
            </ecs.QueryEntities>
        )

        return {
            CulledMeshes,
        }
    },
} satisfies VoxelEnginePlugin
