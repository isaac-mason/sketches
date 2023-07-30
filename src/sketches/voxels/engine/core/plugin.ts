import { Component, Entity, System, Topic } from 'arancini'
import { Object3D } from 'three'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { BlockValue, Vec3 } from './types'
import {
    TraceRayResult,
    chunkId,
    emptyChunk,
    isSolid,
    positionToChunkIndex,
    traceRay,
    worldPositionToChunkPosition,
} from './utils'

export type VoxelWorldChange = { position: Vec3; value: BlockValue; chunk: Entity }

export class VoxelWorldEventsComponent extends Component {
    onChange = new Topic<[changes: VoxelWorldChange[]]>()

    construct() {
        this.onChange.clear()
    }
}

export class VoxelChunkComponent extends Component {
    id: string
    position: Vec3
    solid: Uint8Array
    color: Uint32Array
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer

    constructor() {
        super()

        const chunk = emptyChunk()
        this.id = chunk.id
        this.position = chunk.position
        this.solid = chunk.solid
        this.color = chunk.color
        this.solidBuffer = chunk.solidBuffer
        this.colorBuffer = chunk.colorBuffer
    }

    construct(id: string, position: Vec3) {
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

export type SetBlockRequest = { position: Vec3; value: BlockValue }

export const SetBlockRequestComponent = Component.object<SetBlockRequest>('SetBlockRequest')

export const Object3DComponent = Component.object<Object3D>('Object3D')

export class VoxelWorldCoreSystem extends System {
    voxelWorld = this.singleton(VoxelWorldComponent, { required: true })!

    voxelWorldEvents = this.singleton(VoxelWorldEventsComponent, { required: true })!

    chunkQuery = this.query([VoxelChunkComponent])

    setBlockRequestQuery = this.query([SetBlockRequestComponent])

    static PRIORITY = 100

    onInit() {
        this.chunkQuery.onEntityAdded.add((e) => {
            if (!this.voxelWorld) return

            const voxelChunk = e.get(VoxelChunkComponent)

            this.voxelWorld.chunks.set(voxelChunk.id, voxelChunk)
            this.voxelWorld.chunkEntities.set(voxelChunk.id, e)
            this.voxelWorld.chunkEntitiesReverse.set(e, voxelChunk.id)
        })

        this.chunkQuery.onEntityRemoved.add((e) => {
            if (!this.voxelWorld) return

            const id = this.voxelWorld.chunkEntitiesReverse.get(e)!
            this.voxelWorld.chunks.delete(id)
            this.voxelWorld.chunkEntities.delete(id)
            this.voxelWorld.chunkEntitiesReverse.delete(e)
        })
    }

    onUpdate() {
        const changes: VoxelWorldChange[] = []

        for (const setBlockRequest of this.setBlockRequestQuery) {
            const { position, value } = setBlockRequest.get(SetBlockRequestComponent)

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

            setBlockRequest.destroy()
        }

        if (changes.length > 0) {
            this.voxelWorldEvents.onChange.emit(changes)
        }
    }

    private addChunk(id: string, chunkPosition: Vec3) {
        return this.world.create((entity) => {
            entity.add(VoxelChunkComponent, id, chunkPosition)
        })
    }
}

export const CorePlugin = {
    components: [
        VoxelWorldComponent,
        VoxelWorldEventsComponent,
        VoxelChunkComponent,
        SetBlockRequestComponent,
        Object3DComponent,
    ],
    systems: [VoxelWorldCoreSystem],
    setup: (world) => {
        const voxelWorldEntity = world.create((e) => {
            e.add(VoxelWorldComponent)
            e.add(VoxelWorldEventsComponent)
        })

        const voxelWorld = voxelWorldEntity.get(VoxelWorldComponent)

        const setBlock = (position: Vec3, value: BlockValue) => {
            world.create((e) => e.add(SetBlockRequestComponent, { position, value }))
        }

        return {
            voxelWorld,
            setBlock,
        }
    },
} satisfies VoxelEnginePlugin

export type CorePlugin = typeof CorePlugin