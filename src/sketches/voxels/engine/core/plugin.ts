import { Component, Entity, System } from 'arancini'
import { Object3D } from 'three'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { BlockValue, Vec3 } from './types'
import {
    CHUNK_SIZE,
    TraceRayResult,
    chunkId,
    createEmptyChunk,
    isSolid,
    positionToChunkIndex,
    traceRay,
    worldPositionToChunkPosition,
    worldPositionToLocalChunkPosition,
} from './utils'

export class DirtyComponent extends Component {}

export class VoxelChunkComponent extends Component {
    id: string
    position: Vec3
    solid: Uint8Array
    color: Uint32Array
    solidBuffer: SharedArrayBuffer
    colorBuffer: SharedArrayBuffer

    constructor() {
        super()

        const emptyChunk = createEmptyChunk()
        this.id = emptyChunk.id
        this.position = emptyChunk.position
        this.solid = emptyChunk.solid
        this.color = emptyChunk.color
        this.solidBuffer = emptyChunk.solidBuffer
        this.colorBuffer = emptyChunk.colorBuffer
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
}

export class SetBlockRequestComponent extends Component {
    position!: Vec3
    value!: BlockValue

    construct(position: Vec3, value: BlockValue) {
        this.position = position
        this.value = value
    }
}

export class VoxelWorldCoreSystem extends System {
    voxelWorld = this.singleton(VoxelWorldComponent, { required: true })!

    chunkQuery = this.query([VoxelChunkComponent])

    setBlockRequestQuery = this.query([SetBlockRequestComponent])

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
        for (const e of this.setBlockRequestQuery.entities) {
            const { position, value } = e.get(SetBlockRequestComponent)
            this.setBlock(position, value)
            e.destroy()
        }
    }

    private setBlock(position: Vec3, value: BlockValue): void {
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

        if (!chunkEntity.has(DirtyComponent)) {
            chunkEntity.add(DirtyComponent)
        }

        // check if we need to make neighbour chunks dirty
        for (let axis = 0; axis < 3; axis++) {
            for (const [pos, dir] of [
                [CHUNK_SIZE - 1, 1],
                [0, -1],
            ]) {
                const chunkLocalPosition = worldPositionToLocalChunkPosition(position)
                if (chunkLocalPosition[axis] !== pos) continue

                const offset: Vec3 = [0, 0, 0]
                offset[axis] = dir

                const neighbourPosition: Vec3 = [position[0] + offset[0], position[1] + offset[1], position[2] + offset[2]]
                if (!this.voxelWorld.isSolid(neighbourPosition)) continue

                const neighbourChunkId = chunkId([
                    chunkPosition[0] + offset[0],
                    chunkPosition[1] + offset[1],
                    chunkPosition[2] + offset[2],
                ])

                const neighbourEntity = this.voxelWorld.chunkEntities.get(neighbourChunkId)

                if (neighbourEntity && !neighbourEntity.has(DirtyComponent)) {
                    neighbourEntity.add(DirtyComponent)
                }
            }
        }
    }

    private addChunk(id: string, chunkPosition: Vec3) {
        const entity = this.world.create.entity()
        entity.add(VoxelChunkComponent, id, chunkPosition)

        return entity
    }
}

export class Object3DComponent extends Component {
    object3D!: Object3D

    construct(object3D: Object3D) {
        this.object3D = object3D
    }
}

export const CorePlugin = {
    components: [VoxelWorldComponent, VoxelChunkComponent, DirtyComponent, SetBlockRequestComponent, Object3DComponent],
    systems: [VoxelWorldCoreSystem],
    setup: (world) => {
        const voxelWorldEntity = world.create.entity()
        const voxelWorld = voxelWorldEntity.add(VoxelWorldComponent)

        const setBlock = (position: Vec3, value: BlockValue) => {
            const entity = world.create.entity()
            entity.add(SetBlockRequestComponent, position, value)
        }

        return {
            voxelWorld,
            setBlock,
        }
    },
} satisfies VoxelEnginePlugin
