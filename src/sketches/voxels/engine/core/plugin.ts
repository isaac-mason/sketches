import { Component, Entity, System, Topic } from 'arancini'
import { Object3D, Vector3 } from 'three'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { BlockValue, Vec3 } from './types'
import {
    CHUNK_SIZE,
    TraceRayResult,
    chunkId,
    emptyChunk,
    isSolid,
    positionToChunkIndex,
    traceRay,
    worldPositionToChunkPosition,
} from './utils'

const ACTOR_CHUNK_LOADED_RADIUS = 10

export type SetBlockRequest = { position: Vec3; value: BlockValue }

export type VoxelWorldChange = { position: Vec3; value: BlockValue; chunk: Entity }

export const VoxelWorldActorComponent = Component.object<{ position: Vector3 }>('voxel world actor')

export class VoxelWorldEventsComponent extends Component {
    onSetBlockRequest = new Topic<[SetBlockRequest]>()

    onChunkChange = new Topic<[changes: VoxelWorldChange[]]>()

    construct() {
        this.onChunkChange.clear()
    }
}

export const VoxelChunkLoadedTagComponent = Component.tag('loaded voxel chunk')

export class VoxelChunkComponent extends Component {
    id: string
    position: Vector3

    solid: Uint8Array
    solidBuffer: SharedArrayBuffer

    color: Uint32Array
    colorBuffer: SharedArrayBuffer

    // based on distance from player
    priority!: number

    constructor() {
        super()

        const chunk = emptyChunk()

        this.id = chunk.id
        this.position = chunk.position

        this.solid = chunk.solid
        this.solidBuffer = chunk.solidBuffer

        this.color = chunk.color
        this.colorBuffer = chunk.colorBuffer

        this.priority = 0
    }

    construct(id: string, position: Vector3) {
        this.id = id
        this.position = position
        this.solid.fill(0)
        this.color.fill(0)
    }
}

export class VoxelWorldComponent extends Component {
    chunks = new Map<string, VoxelChunkComponent>()

    chunkEntities = new Map<string, Entity>()

    chunkEntitiesReverse = new Map<Entity, string>()

    construct() {
        this.chunks.clear()
        this.chunkEntities.clear()
        this.chunkEntitiesReverse.clear()
    }

    intersectsVoxel = (position: Vec3): boolean => {
        return this.isSolid([Math.floor(position[0]), Math.floor(position[1]), Math.floor(position[2])])
    }

    isSolid = (position: Vec3): boolean => {
        return isSolid(position, this.chunks)
    }

    traceRay = (origin: Vec3, direction: Vec3): TraceRayResult => {
        return traceRay(this.isSolid, origin, direction)
    }

    getChunkAt = (position: Vec3): Entity | undefined => {
        return this.chunkEntities.get(chunkId(worldPositionToChunkPosition(position)))
    }
}

export const Object3DComponent = Component.object<Object3D>('Object3D')

export class VoxelWorldCoreSystem extends System {
    voxelWorld = this.singleton(VoxelWorldComponent)!

    events = this.singleton(VoxelWorldEventsComponent)!

    actor = this.singleton(VoxelWorldActorComponent)!

    chunks = this.query([VoxelChunkComponent])

    setBlockRequests: SetBlockRequest[] = []

    static PRIORITY = 100

    onInit() {
        this.events.onSetBlockRequest.add((request) => {
            this.setBlockRequests.push(request)
        })

        this.chunks.onEntityAdded.add((e) => {
            if (!this.voxelWorld) return

            const voxelChunk = e.get(VoxelChunkComponent)

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
            const chunk = chunkEntity.get(VoxelChunkComponent)

            const distance = chunk.position.distanceTo(this.actor.position) / CHUNK_SIZE

            const shouldBeLoaded = distance < ACTOR_CHUNK_LOADED_RADIUS
            const loaded = chunkEntity.has(VoxelChunkLoadedTagComponent)

            if (shouldBeLoaded && !loaded) {
                chunkEntity.add(VoxelChunkLoadedTagComponent)
            } else if (!shouldBeLoaded && loaded) {
                chunkEntity.remove(VoxelChunkLoadedTagComponent)
            }

            chunk.priority = -distance
        }

        /* handle set block requests */
        const changes: VoxelWorldChange[] = []

        const setBlockRequests = this.setBlockRequests
        this.setBlockRequests = []

        for (const { position, value } of setBlockRequests) {
            const chunkPosition = worldPositionToChunkPosition(position)
            const id = chunkId(chunkPosition)

            let chunkEntity = this.voxelWorld.chunkEntities.get(id)

            if (!chunkEntity) {
                chunkEntity = this.addChunk(id, chunkPosition)
            }

            const index = positionToChunkIndex(position)

            const voxelChunk = chunkEntity.get(VoxelChunkComponent)
            voxelChunk.solid[index] = value.solid ? 1 : 0
            voxelChunk.color[index] = value.solid ? value.color : 0

            changes.push({ position, value, chunk: chunkEntity })
        }

        if (changes.length > 0) {
            this.events.onChunkChange.emit(changes)
        }
    }

    private addChunk(id: string, chunkPosition: Vec3) {
        return this.world.create((entity) => {
            entity.add(VoxelChunkComponent, id, new Vector3(...chunkPosition))
        })
    }
}

export const CorePlugin = {
    components: [
        VoxelWorldComponent,
        VoxelWorldEventsComponent,
        VoxelChunkComponent,
        VoxelChunkLoadedTagComponent,
        VoxelWorldActorComponent,
        Object3DComponent,
    ],
    systems: [VoxelWorldCoreSystem],
    setup: (world) => {
        const voxelWorldEntity = world.create()
        const voxelWorld = voxelWorldEntity.add(VoxelWorldComponent)
        const voxelWorldEvents = voxelWorldEntity.add(VoxelWorldEventsComponent)

        const setBlock = (position: Vec3, value: BlockValue) => {
            voxelWorldEvents.onSetBlockRequest.emit({ position, value })
        }

        const voxelWorldActorEntity = world.create()
        const voxelWorldActor = voxelWorldActorEntity.add(VoxelWorldActorComponent, { position: new Vector3() })

        return {
            voxelWorld,
            voxelWorldActor,
            setBlock,
        }
    },
} satisfies VoxelEnginePlugin

export type CorePlugin = typeof CorePlugin
