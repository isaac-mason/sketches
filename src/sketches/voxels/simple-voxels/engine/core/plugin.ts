import { With, World } from 'arancini'
import { Topic } from 'arancini/events'
import { System } from 'arancini/systems'
import * as THREE from 'three'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { BlockValue, CHUNK_SIZE, VoxelChunk, chunkId, createVoxelChunk, isSolid } from './chunk'
import { TraceRayResult, traceRay } from './trace-ray'
import { Vec3, vec3 } from './vec3'

export type SetBlockRequest = { position: Vec3; value: BlockValue }

export type ChunkEntity = With<CorePluginEntity, 'voxelChunk'>

export type VoxelWorldChange = { position: Vec3; value: BlockValue; chunk: ChunkEntity }

export class VoxelWorld {
    chunks = new Map<string, VoxelChunk>()

    chunkEntities = new Map<string, ChunkEntity>()

    onChunkChange = new Topic<[changes: VoxelWorldChange[]]>()

    actor = new THREE.Vector3()

    private setBlockRequests: SetBlockRequest[] = []

    constructor(private world: World<CorePluginEntity>) {}

    setBlock = (position: Vec3, value: BlockValue) => {
        this.setBlockRequests.push({ position, value })
    }

    update() {
        /* handle set block requests */
        const changes: VoxelWorldChange[] = []

        const setBlockRequests = this.setBlockRequests
        this.setBlockRequests = []

        for (const { position, value } of setBlockRequests) {
            const chunkPosition = vec3.worldToChunk(position)
            const id = chunkId(chunkPosition)

            let chunk = this.chunkEntities.get(id)

            if (!chunk) {
                chunk = this.addChunk(id, new THREE.Vector3(...chunkPosition))

                this.chunks.set(id, chunk.voxelChunk)
                this.chunkEntities.set(id, chunk)
            }

            const index = vec3.toChunkIndex(position)

            chunk.voxelChunk.solid[index] = value.solid ? 1 : 0
            chunk.voxelChunk.color[index] = value.solid ? value.color : 0

            changes.push({ position, value, chunk })
        }

        if (changes.length > 0) {
            this.onChunkChange.emit(changes)
        }

        /* load and unload chunks based on distance, update chunk priorities */
        for (const chunkEntity of this.chunkEntities.values()) {
            const { voxelChunk } = chunkEntity

            const playerCurrentChunk = _vector3.set(...vec3.worldToChunk(this.actor.toArray()))

            const chunkDistance = playerCurrentChunk.distanceTo(voxelChunk.position)

            const shouldBeLoaded = chunkDistance <= CHUNK_VIEW_DISTANCE
            const loaded = chunkEntity.voxelChunkLoaded

            if (shouldBeLoaded && !loaded) {
                this.world.add(chunkEntity, 'voxelChunkLoaded', true)
            } else if (!shouldBeLoaded && loaded) {
                this.world.remove(chunkEntity, 'voxelChunkLoaded')
            }

            voxelChunk.priority = -chunkDistance
        }
    }

    intersectsVoxel(position: Vec3): boolean {
        return this.isSolid(position.map(Math.floor) as Vec3)
    }

    traceRay(origin: Vec3, direction: Vec3, maxDistance = 500): TraceRayResult {
        return traceRay(this.isSolid, origin, direction, maxDistance)
    }

    getChunk(position: Vec3) {
        return this.chunkEntities.get(chunkId(vec3.worldToChunk(position)))
    }

    isSolid = (position: Vec3): boolean => {
        return isSolid(position, this.chunks)
    }

    private addChunk(id: string, chunkPosition: THREE.Vector3) {
        const voxelChunk = createVoxelChunk(id, chunkPosition)

        const voxelChunkEntity = this.world.create({ voxelChunk })

        return voxelChunkEntity
    }
}

// todo: make this configurable
const VIEW_DISTANCE = 200

const CHUNK_VIEW_DISTANCE = Math.floor(VIEW_DISTANCE / CHUNK_SIZE)

const _vector3 = new THREE.Vector3()

export class VoxelWorldCoreSystem extends System<CorePluginEntity> {
    voxelWorld = this.singleton('voxelWorld')

    static PRIORITY = 100

    onUpdate(): void {
        this.voxelWorld?.update()
    }
}

export type CorePluginEntity = {
    object3D?: THREE.Object3D
    voxelChunkLoaded?: boolean
    voxelChunk?: VoxelChunk
    voxelWorld?: VoxelWorld
}

export const CorePlugin = {
    E: {} as CorePluginEntity,
    systems: [VoxelWorldCoreSystem],
    setup: (world: World<CorePluginEntity>) => {
        const voxelWorld = new VoxelWorld(world)

        world.create({ voxelWorld })

        return { voxelWorld }
    },
} satisfies VoxelEnginePlugin<CorePluginEntity>

export type CorePlugin = typeof CorePlugin
