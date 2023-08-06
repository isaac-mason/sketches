import { Component, Entity, System } from 'arancini'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import {
    CHUNK_SIZE,
    Vec3,
    VoxelChunkComponent,
    VoxelWorldComponent,
    VoxelWorldCoreSystem,
    VoxelWorldEventsComponent,
    chunkId,
} from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import VoxelChunkMesherWorker from './culled-mesher.worker.ts?worker'
import {
    ChunkMeshUpdateMessage,
    RegisterChunkMessage,
    RequestChunkMeshUpdateMessage,
    VoxelChunkMeshData,
    WorkerMessage,
} from './types'
import { emptyChunkMeshData } from './utils'

const voxelChunkShaderMaterial = new MeshStandardMaterial({
    vertexColors: true,
})

voxelChunkShaderMaterial.onBeforeCompile = (shader) => {
    shader.vertexShader = `
        attribute float ambientOcclusion;
        varying float vAmbientOcclusion;

        ${shader.vertexShader}
    `

    shader.vertexShader = shader.vertexShader.replace(
        '#include <uv_vertex>',
        `
        #include <uv_vertex>

        vAmbientOcclusion = ambientOcclusion;
        `,
    )

    shader.fragmentShader = `
        varying float vAmbientOcclusion;

        ${shader.fragmentShader}
    `

    shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        float ambientOcclusion = 1.0 - (1.0 - vAmbientOcclusion) * 0.5;

        gl_FragColor = vec4(gl_FragColor.rgb * ambientOcclusion, 1.0);
    `,
    )
}

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
        this.voxelChunkMeshData.ambientOcclusion.fill(0)
        this.voxelChunkMeshData.meta.fill(0)

        this.geometry = new BufferGeometry()
        this.material = voxelChunkShaderMaterial
        this.mesh = new Mesh()

        this.mesh.geometry = this.geometry
        this.mesh.material = this.material
    }
}

export class VoxelChunkMesherSystem extends System {
    chunkQuery = this.query([VoxelChunkComponent])

    voxelWorld = this.singleton(VoxelWorldComponent, { required: true })!

    voxelWorldEvents = this.singleton(VoxelWorldEventsComponent, { required: true })!

    dirtyChunks = new Set<string>()

    private mesherWorkers: InstanceType<typeof VoxelChunkMesherWorker>[] = []

    private pendingMeshUpdates: Map<string, number> = new Map()

    private workerMeshUpdateRoundRobin = 0

    static WORKER_POOL_SIZE = 3

    static PRIORITY = VoxelWorldCoreSystem.PRIORITY - 1

    onInit() {
        for (let i = 0; i < VoxelChunkMesherSystem.WORKER_POOL_SIZE; i++) {
            const worker = new VoxelChunkMesherWorker()

            worker.onmessage = (e) => {
                const { data: message } = e as { data: WorkerMessage }

                if (message.type === 'chunk-mesh-update') {
                    this.onChunkMeshUpdate(message)
                }
            }

            this.mesherWorkers.push(worker)
        }

        this.chunkQuery.onEntityAdded.add((chunk) => {
            this.registerChunk(chunk)
        })

        this.chunkQuery.onEntityRemoved.add((e) => {
            // todo
        })

        this.voxelWorldEvents.onChange.add((updates) => {
            this.handleBlockUpdates(updates.map((update) => update.position))
        })
    }

    onUpdate() {
        for (const chunkId of this.dirtyChunks) {
            this.remesh(chunkId)
        }

        this.dirtyChunks.clear()
    }

    onDestroy() {
        for (const worker of this.mesherWorkers) {
            worker.terminate()
        }
        this.mesherWorkers = []
    }

    private handleBlockUpdates(positions: Vec3[]): void {
        for (const position of positions) {
            const chunkEntity = this.voxelWorld.getChunkAt(position)!
            const chunk = chunkEntity.get(VoxelChunkComponent)

            this.dirtyChunks.add(chunk.id)

            // check if we need to make neighbour chunks dirty
            // we need to check diagonals as well for AO
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dy === 0 && dz === 0) {
                            continue
                        }

                        const offset: Vec3 = [dx, dy, dz]

                        const neighbourChunkId = chunkId([
                            chunk.position[0] + offset[0],
                            chunk.position[1] + offset[1],
                            chunk.position[2] + offset[2],
                        ])

                        const neighbourEntity = this.voxelWorld.chunkEntities.get(neighbourChunkId)

                        if (!neighbourEntity) continue

                        this.dirtyChunks.add(neighbourChunkId)
                    }
                }
            }
        }
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
                ambientOcclusion: voxelChunkMesh.voxelChunkMeshData.ambientOcclusionBuffer,
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

    private onChunkMeshUpdate({ id }: ChunkMeshUpdateMessage) {
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
            ambientOcclusion,
            meta: [positionsCount, indicesCount, normalsCount, colorsCount, ambientOcclusionCount],
        } = voxelChunkMesh.voxelChunkMeshData

        voxelChunkMesh.geometry.setIndex(new BufferAttribute(indices.slice(0, indicesCount), 1))
        voxelChunkMesh.geometry.setAttribute('position', new BufferAttribute(positions.slice(0, positionsCount), 3))
        voxelChunkMesh.geometry.setAttribute('normal', new BufferAttribute(normals.slice(0, normalsCount), 3))
        voxelChunkMesh.geometry.setAttribute('color', new BufferAttribute(colors.slice(0, colorsCount), 3))
        voxelChunkMesh.geometry.setAttribute(
            'ambientOcclusion',
            new BufferAttribute(ambientOcclusion.slice(0, ambientOcclusionCount), 1),
        )

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

export type CulledMesherPlugin = typeof CulledMesherPlugin
