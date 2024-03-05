import { World, type With } from 'arancini'
import { Topic } from 'arancini/events'
import { System } from 'arancini/systems'
import * as THREE from 'three'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { BlockValue, VoxelChunk, chunkId, createVoxelChunk, isSolid } from './chunk'
import { CHUNK_SIZE } from './constants'
import { TraceRayResult, traceRay } from './trace-ray'
import { Vec3, vec3 } from './vec3'

export type VoxelWorldEvents = {
    onSetBlockRequest: Topic<[SetBlockRequest]>
    onChunkChange: Topic<[changes: VoxelWorldChange[]]>
}

export type SetBlockRequest = { position: Vec3; value: BlockValue }

export type VoxelWorldChange = { position: Vec3; value: BlockValue; chunk: CorePluginEntity }

export type ChunkEntity = With<CorePluginEntity, 'voxelChunk'>

export class VoxelWorld {
    chunks = new Map<string, VoxelChunk>()

    chunkEntities = new Map<string, ChunkEntity>()

    chunkEntitiesReverse = new Map<ChunkEntity, string>()

    intersectsVoxel(position: Vec3): boolean {
        return this.isSolid(position.map(Math.floor) as Vec3)
    }

    traceRay(origin: Vec3, direction: Vec3, maxDistance = 500): TraceRayResult {
        return traceRay(this.isSolid, origin, direction, maxDistance)
    }

    getChunkAt(position: Vec3) {
        return this.chunkEntities.get(chunkId(vec3.worldPositionToChunkPosition(position))) as
            | With<CorePluginEntity, 'voxelChunk'>
            | undefined
    }

    isSolid = (position: Vec3): boolean => {
        return isSolid(position, this.chunks)
    }
}

// todo: make this configurable
const VIEW_DISTANCE = 200

const CHUNK_VIEW_DISTANCE = Math.floor(VIEW_DISTANCE / CHUNK_SIZE)

export class VoxelWorldCoreSystem extends System<CorePluginEntity> {
    voxelWorld = this.singleton('voxelWorld')!

    events = this.singleton('voxelWorldEvents')!

    actor = this.singleton('voxelWorldActor')!

    chunks = this.query((e) => e.has('voxelChunk'))

    setBlockRequests: SetBlockRequest[] = []

    static PRIORITY = 100

    private tmpVec3 = new THREE.Vector3()

    onInit() {
        this.events.onSetBlockRequest.add((request) => {
            this.setBlockRequests.push(request)
        })

        this.chunks.onEntityAdded.add((e) => {
            if (!this.voxelWorld) return

            const { voxelChunk } = e

            this.voxelWorld.chunks.set(voxelChunk.id, voxelChunk)
            this.voxelWorld.chunkEntities.set(voxelChunk.id, e)
            this.voxelWorld.chunkEntitiesReverse.set(e, voxelChunk.id)
        })

        this.chunks.onEntityRemoved.add((e) => {
            if (!this.voxelWorld) return

            const id = this.voxelWorld.chunkEntitiesReverse.get(e)!
            this.voxelWorld.chunks.delete(id)
            this.voxelWorld.chunkEntities.delete(id)
            this.voxelWorld.chunkEntitiesReverse.delete(e)
        })
    }

    onUpdate(): void {
        /* load and unload chunks based on distance, update chunk priorities */
        for (const chunkEntity of this.chunks) {
            const { voxelChunk } = chunkEntity

            const playerCurrentChunk = this.tmpVec3.set(...vec3.worldPositionToChunkPosition(this.actor.position.toArray()))

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

        /* handle set block requests */
        const changes: VoxelWorldChange[] = []

        const setBlockRequests = this.setBlockRequests
        this.setBlockRequests = []

        for (const { position, value } of setBlockRequests) {
            const chunkPosition = vec3.worldPositionToChunkPosition(position)
            const id = chunkId(chunkPosition)

            let chunkEntity = this.voxelWorld.chunkEntities.get(id)

            if (!chunkEntity) {
                chunkEntity = this.addChunk(id, new THREE.Vector3(...chunkPosition))
            }

            const index = vec3.toChunkIndex(position)

            const { voxelChunk } = chunkEntity
            voxelChunk!.solid[index] = value.solid ? 1 : 0
            voxelChunk!.color[index] = value.solid ? value.color : 0

            changes.push({ position, value, chunk: chunkEntity })
        }

        if (changes.length > 0) {
            this.events.onChunkChange.emit(changes)
        }
    }

    private addChunk(id: string, chunkPosition: THREE.Vector3) {
        return this.world.create({
            voxelChunk: createVoxelChunk(id, chunkPosition),
        }) as ChunkEntity
    }
}

export type CorePluginEntity = {
    object3D?: THREE.Object3D
    voxelWorldActor?: { position: THREE.Vector3 }
    voxelWorldEvents?: VoxelWorldEvents
    voxelChunkLoaded?: boolean
    voxelChunk?: VoxelChunk
    voxelWorld?: VoxelWorld
}

export const CorePlugin = {
    E: {} as CorePluginEntity,
    systems: [VoxelWorldCoreSystem],
    setup: (world: World<CorePluginEntity>) => {
        const voxelWorldEntity = world.create({
            voxelWorld: new VoxelWorld(),
            voxelWorldEvents: {
                onSetBlockRequest: new Topic<[SetBlockRequest]>(),
                onChunkChange: new Topic<[VoxelWorldChange[]]>(),
            },
        })

        const setBlock = (position: Vec3, value: BlockValue) => {
            voxelWorldEntity.voxelWorldEvents.onSetBlockRequest.emit({ position, value })
        }

        const voxelWorldActorEntity = world.create({ voxelWorldActor: { position: new THREE.Vector3() } })

        return {
            voxelWorld: voxelWorldEntity.voxelWorld,
            voxelWorldActor: voxelWorldActorEntity.voxelWorldActor,
            setBlock,
        }
    },
} satisfies VoxelEnginePlugin<CorePluginEntity>

export type CorePlugin = typeof CorePlugin
