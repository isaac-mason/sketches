import { With } from 'arancini'
import { System } from 'arancini/systems'
import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial } from 'three'
import { CHUNK_SIZE, ChunkEntity, CorePlugin, CorePluginEntity, Vec3, VoxelWorldCoreSystem, chunkId } from '../core'
import { useVoxelEngine } from '../voxel-engine'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import VoxelChunkMesherWorker from './culled-mesher.worker.ts?worker'
import { ChunkMeshUpdateMessage, RegisterChunkMessage, RequestChunkMeshUpdateMessage, WorkerMessage } from './types'

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

export class VoxelChunkMesh {
    geometry!: BufferGeometry

    material!: MeshStandardMaterial

    mesh!: Mesh

    initialised = false

    constructor() {
        this.mesh = new Mesh(new BufferGeometry(), voxelChunkShaderMaterial)
        this.geometry = this.mesh.geometry as BufferGeometry
        this.material = this.mesh.material as MeshStandardMaterial
    }
}

export class VoxelChunkMesherSystem extends System<CorePluginEntity & CulledMesherPluginEntity> {
    chunks = this.query((e) => e.has('voxelChunk'))

    loadedChunks = this.query((e) => e.has('voxelChunk', 'voxelChunkLoaded'))

    voxelWorld = this.singleton('voxelWorld')!

    voxelWorldEvents = this.singleton('voxelWorldEvents')!

    voxelWorldActor = this.singleton('voxelWorldActor')!

    dirtyChunks = new Set<With<CorePluginEntity & CulledMesherPluginEntity, 'voxelChunk'>>()

    dirtyUnloadedChunks = new Set<With<CorePluginEntity & CulledMesherPluginEntity, 'voxelChunk'>>()

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
            if (!chunk.voxelChunkMesh?.initialised) {
                this.dirtyChunks.add(chunk)
            } else if (this.dirtyUnloadedChunks.has(chunk)) {
                this.dirtyChunks.add(chunk)
                this.dirtyUnloadedChunks.delete(chunk)
            }
        })

        this.loadedChunks.onEntityRemoved.add((chunk) => {
            this.dirtyChunks.delete(chunk)
        })
    }

    onUpdate(): void {
        const prioritisedChunks = Array.from(this.dirtyChunks).sort((a, b) => {
            return b.voxelChunk!.priority - a.voxelChunk!.priority
        })

        for (const chunk of prioritisedChunks) {
            this.remesh(chunk.voxelChunk.id)
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
            const { voxelChunk, voxelChunkLoaded } = chunkEntity

            if (!voxelChunkLoaded) {
                this.dirtyUnloadedChunks.add(chunkEntity)
                continue
            }

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
                            voxelChunk.position.x + offset[0],
                            voxelChunk.position.y + offset[1],
                            voxelChunk.position.z + offset[2],
                        ])

                        const neighbourEntity = this.voxelWorld.chunkEntities.get(neighbourChunkId)

                        if (!neighbourEntity) continue

                        this.dirtyChunks.add(neighbourEntity)
                    }
                }
            }
        }
    }

    private registerChunk(e: ChunkEntity & CulledMesherPluginEntity): void {
        if (e.voxelChunkMesh) return

        const { voxelChunk } = e

        this.world.add(e, 'voxelChunkMesh', new VoxelChunkMesh())

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

        const entity = this.voxelWorld.chunkEntities.get(id)! as CorePluginEntity & CulledMesherPluginEntity
        const voxelChunk = entity.voxelChunk!
        const voxelChunkMesh = entity.voxelChunkMesh!

        voxelChunkMesh.initialised = true

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
    const { react: { Entities } } = useVoxelEngine<[CorePlugin, CulledMesherPlugin]>()

    return (
        <Entities where={(e) => e.has('voxelChunkMesh', 'voxelChunkLoaded')}>
            {(entity) => {
                const { voxelChunkMesh } = entity

                return <primitive object={voxelChunkMesh.mesh} />
            }}
        </Entities>
    )
}

export type CulledMesherPluginEntity = {
    voxelChunkMesh?: VoxelChunkMesh
}

export const CulledMesherPlugin = {
    E: {} as CulledMesherPluginEntity,
    components: ['voxelChunkMesh'],
    systems: [VoxelChunkMesherSystem],
} satisfies VoxelEnginePlugin<CulledMesherPluginEntity>

export type CulledMesherPlugin = typeof CulledMesherPlugin
