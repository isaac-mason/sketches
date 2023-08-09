import { Component, Entity, System } from 'arancini'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import {
    CHUNK_SIZE,
    Vec3,
    VoxelChunkComponent,
    VoxelChunkLoadedTagComponent,
    VoxelWorldActorComponent,
    VoxelWorldComponent,
    VoxelWorldCoreSystem,
    VoxelWorldEventsComponent,
    chunkId,
} from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import VoxelChunkMesherWorker from './culled-mesher.worker.ts?worker'
import { ChunkMeshUpdateMessage, RegisterChunkMessage, RequestChunkMeshUpdateMessage, WorkerMessage } from './types'
import { useVoxelEngine } from '../voxel-engine'

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
    geometry!: BufferGeometry

    material!: MeshStandardMaterial

    mesh!: Mesh

    construct() {
        this.mesh = new Mesh(new BufferGeometry(), voxelChunkShaderMaterial)
        this.geometry = this.mesh.geometry as BufferGeometry
        this.material = this.mesh.material as MeshStandardMaterial
    }
}

export class VoxelChunkMesherSystem extends System {
    chunks = this.query([VoxelChunkComponent])

    loadedChunks = this.query([VoxelChunkComponent, VoxelChunkLoadedTagComponent])

    dirtyChunks = new Set<Entity>()

    voxelWorld = this.singleton(VoxelWorldComponent)!

    voxelWorldEvents = this.singleton(VoxelWorldEventsComponent)!

    voxelWorldActor = this.singleton(VoxelWorldActorComponent)!

    private workers: InstanceType<typeof VoxelChunkMesherWorker>[] = []

    private pendingMeshUpdates: Map<string, number> = new Map()

    private workerRoundRobin = 0

    static WORKER_POOL_SIZE = 3

    static PRIORITY = VoxelWorldCoreSystem.PRIORITY - 1

    onInit() {
        for (let i = 0; i < VoxelChunkMesherSystem.WORKER_POOL_SIZE; i++) {
            const worker = new VoxelChunkMesherWorker()

            worker.onmessage = (e) => {
                const { data: message } = e as { data: WorkerMessage }

                if (message.type === 'chunk-mesh-update') {
                    this.updateVoxelChunkMesh(message)
                }
            }

            this.workers.push(worker)
        }

        this.chunks.onEntityAdded.add((chunk) => {
            this.registerChunk(chunk)
        })

        this.chunks.onEntityRemoved.add((e) => {
            // todo
        })

        this.voxelWorldEvents.onChunkChange.add((updates) => {
            this.handleBlockUpdates(updates.map((update) => update.position))
        })

        this.loadedChunks.onEntityAdded.add((chunk) => {
            this.dirtyChunks.add(chunk)
        })

        this.loadedChunks.onEntityRemoved.add((chunk) => {
            this.dirtyChunks.delete(chunk)
        })
    }

    onUpdate(): void {
        const prioritisedChunks = Array.from(this.dirtyChunks).sort((a, b) => {
            return a.get(VoxelChunkComponent).priority - b.get(VoxelChunkComponent).priority
        })

        for (const chunk of prioritisedChunks) {
            this.remesh(chunk.get(VoxelChunkComponent).id)
        }

        this.dirtyChunks.clear()
    }

    onDestroy() {
        for (const worker of this.workers) {
            worker.terminate()
        }
        this.workers = []
    }

    private handleBlockUpdates(positions: Vec3[]): void {
        for (const position of positions) {
            const chunkEntity = this.voxelWorld.getChunkAt(position)!
            const chunk = chunkEntity.get(VoxelChunkComponent)
            const loaded = chunkEntity.has(VoxelChunkLoadedTagComponent)

            if (!loaded) return

            this.dirtyChunks.add(chunkEntity)

            // check if we need to make neighbour chunks dirty
            // we need to check corners as well for AO
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        if (dx === 0 && dy === 0 && dz === 0) {
                            continue
                        }

                        const offset: Vec3 = [dx, dy, dz]

                        const neighbourChunkId = chunkId([
                            chunk.position.x + offset[0],
                            chunk.position.y + offset[1],
                            chunk.position.z + offset[2],
                        ])

                        const neighbourEntity = this.voxelWorld.chunkEntities.get(neighbourChunkId)

                        if (!neighbourEntity) continue

                        this.dirtyChunks.add(neighbourEntity)
                    }
                }
            }
        }
    }

    private registerChunk(e: Entity): void {
        if (e.has(VoxelChunkMeshComponent)) return

        const voxelChunk = e.get(VoxelChunkComponent)

        e.add(VoxelChunkMeshComponent)

        const data: RegisterChunkMessage = {
            type: 'register-chunk',
            id: voxelChunk.id,
            position: voxelChunk.position.toArray(),
            solidBuffer: voxelChunk.solidBuffer,
            colorBuffer: voxelChunk.colorBuffer,
        }

        for (const worker of this.workers) {
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
            this.workers[workerWithPendingMeshUpdate].postMessage(data)
            return
        }

        const workerIndex = this.workerRoundRobin
        const worker = this.workers[workerIndex]
        this.pendingMeshUpdates.set(chunkId, workerIndex)

        worker.postMessage(data)

        this.workerRoundRobin = (this.workerRoundRobin + 1) % this.workers.length
    }

    private updateVoxelChunkMesh({ id, indices, positions, normals, colors, ambientOcclusion }: ChunkMeshUpdateMessage) {
        this.pendingMeshUpdates.delete(id)

        const entity = this.voxelWorld.chunkEntities.get(id)!
        const voxelChunk = entity.get(VoxelChunkComponent)
        const voxelChunkMesh = entity.get(VoxelChunkMeshComponent)

        voxelChunkMesh.geometry.setIndex(new BufferAttribute(indices, 1))
        voxelChunkMesh.geometry.setAttribute('position', new BufferAttribute(positions, 3))
        voxelChunkMesh.geometry.setAttribute('normal', new BufferAttribute(normals, 3))
        voxelChunkMesh.geometry.setAttribute('color', new BufferAttribute(colors, 3))
        voxelChunkMesh.geometry.setAttribute('ambientOcclusion', new BufferAttribute(ambientOcclusion, 1))

        voxelChunkMesh.geometry.computeBoundingBox()
        voxelChunkMesh.geometry.computeBoundingSphere()

        voxelChunkMesh.mesh.position.set(
            voxelChunk.position.x * CHUNK_SIZE,
            voxelChunk.position.y * CHUNK_SIZE,
            voxelChunk.position.z * CHUNK_SIZE,
        )
    }
}

export const VoxelChunkCulledMeshes = () => {
    const { ecs } = useVoxelEngine()

    return (
        <ecs.QueryEntities query={[VoxelChunkMeshComponent, VoxelChunkLoadedTagComponent]}>
            {(entity) => {
                const voxelChunkMesh = entity.get(VoxelChunkMeshComponent)

                return <primitive object={voxelChunkMesh.mesh} />
            }}
        </ecs.QueryEntities>
    )
}

export const CulledMesherPlugin = {
    components: [VoxelChunkMeshComponent],
    systems: [VoxelChunkMesherSystem],
} satisfies VoxelEnginePlugin

export type CulledMesherPlugin = typeof CulledMesherPlugin
