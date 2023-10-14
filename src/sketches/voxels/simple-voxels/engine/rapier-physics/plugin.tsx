import Rapier from '@dimforge/rapier3d-compat'
import { Component, Entity, System } from 'arancini'
import { suspend } from 'suspend-react'
import { Quaternion, Vector3 } from 'three'
import {
    CHUNK_SIZE,
    Object3DComponent,
    Vec3,
    VoxelChunkComponent,
    VoxelWorldComponent,
    VoxelWorldEventsComponent,
    chunkPositionToWorldPosition,
    positionToChunkIndex,
} from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { worldVoxelPositionToPhysicsPosition } from './utils'

export const PhysicsWorldComponent = Component.object<Rapier.World>('PhysicsWorld')

export class RigidBodyComponent extends Component {
    rigidBody!: Rapier.RigidBody

    isSleeping!: boolean

    construct(rigidBody: Rapier.RigidBody) {
        this.rigidBody = rigidBody
        this.isSleeping = rigidBody.isSleeping()
    }
}

export type VoxelChunkPhysicsBox = {
    body: Rapier.RigidBody
    nx: number
    ny: number
    nz: number
    xi: number
    yi: number
    zi: number
}

export class VoxelChunkPhysicsComponent extends Component {
    offset!: Vec3

    nx!: number
    ny!: number
    nz!: number

    sx!: number
    sy!: number
    sz!: number

    map!: boolean[]
    boxified!: boolean[]
    boxes!: VoxelChunkPhysicsBox[]

    construct(offset: Vec3) {
        this.offset = offset

        this.nx = CHUNK_SIZE
        this.ny = CHUNK_SIZE
        this.nz = CHUNK_SIZE
        this.sx = 1
        this.sy = 1
        this.sz = 1

        this.map = []
        this.boxified = []

        // Prepare map
        for (let i = 0; i < this.nx; i++) {
            for (let j = 0; j < this.ny; j++) {
                for (let k = 0; k < this.nz; k++) {
                    this.map.push(true)
                    this.boxified.push(false)
                }
            }
        }

        this.boxes = []
    }

    getBoxIndex(xi: number, yi: number, zi: number): number {
        const { nx, ny, nz } = this

        if (xi >= 0 && xi < nx && yi >= 0 && yi < ny && zi >= 0 && zi < nz) {
            return xi + nx * yi + nx * ny * zi
        }
        return -1
    }

    setFilled(xi: number, yi: number, zi: number, filled: boolean): void {
        const i = this.getBoxIndex(xi, yi, zi)
        if (i !== -1) {
            this.map[i] = filled
        }
    }

    isFilled(xi: number, yi: number, zi: number): boolean {
        const i = this.getBoxIndex(xi, yi, zi)
        if (i !== -1) {
            return this.map[i]
        }
        return false
    }

    isBoxified(xi: number, yi: number, zi: number): boolean {
        const i = this.getBoxIndex(xi, yi, zi)
        if (i !== -1) {
            return this.boxified[i]
        }
        return false
    }

    setBoxified(xi: number, yi: number, zi: number, boxified: boolean): boolean {
        this.boxified[this.getBoxIndex(xi, yi, zi)] = boxified
        return boxified
    }
}

export class VoxelPhysicsSystem extends System {
    physicsWorld = this.singleton(PhysicsWorldComponent)!

    voxelWorld = this.singleton(VoxelWorldComponent)!

    voxelWorldEvents = this.singleton(VoxelWorldEventsComponent)!

    chunks = this.query([VoxelChunkComponent])

    dirtyChunks = new Set<Entity>()

    onInit(): void {
        this.chunks.onEntityAdded.add((e) => {
            this.dirtyChunks.add(e)
        })

        this.voxelWorldEvents.onChunkChange.add((updates) => {
            for (const { chunk } of updates) {
                this.dirtyChunks.add(chunk)
            }
        })
    }

    onUpdate(): void {
        for (const chunkEntity of this.dirtyChunks) {
            this.updateCollider(chunkEntity)
        }

        this.dirtyChunks.clear()
    }

    private updateCollider(chunkEntity: Entity) {
        const chunk = chunkEntity.get(VoxelChunkComponent)

        if (!chunkEntity.has(VoxelChunkPhysicsComponent)) {
            chunkEntity.add(
                VoxelChunkPhysicsComponent,
                worldVoxelPositionToPhysicsPosition(chunkPositionToWorldPosition(chunk.position.toArray())),
            )
        }

        const chunkPhysics = chunkEntity.get(VoxelChunkPhysicsComponent)

        // todo: optimise, should only update the changed blocks
        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let y = 0; y < CHUNK_SIZE; y++) {
                for (let z = 0; z < CHUNK_SIZE; z++) {
                    chunkPhysics.setFilled(x, y, z, !!chunk.solid[positionToChunkIndex([x, y, z])])
                }
            }
        }

        const { nx, ny, nz } = chunkPhysics

        // Remove all old boxes
        for (let i = 0; i < chunkPhysics.boxes.length; i++) {
            const { body } = chunkPhysics.boxes[i]
            this.physicsWorld.removeRigidBody(body)
        }
        chunkPhysics.boxes.length = 0

        // Set whole map to unboxified
        for (let i = 0; i < chunkPhysics.boxified.length; i++) {
            chunkPhysics.boxified[i] = false
        }

        while (true) {
            let box: VoxelChunkPhysicsBox | null = null

            // 1. Get a filled box that we haven't boxified yet
            for (let i = 0; !box && i < nx; i++) {
                for (let j = 0; !box && j < ny; j++) {
                    for (let k = 0; !box && k < nz; k++) {
                        if (chunkPhysics.isFilled(i, j, k) && !chunkPhysics.isBoxified(i, j, k)) {
                            const bodyDesc = Rapier.RigidBodyDesc.fixed()

                            box = {
                                xi: i,
                                yi: j,
                                zi: k,
                                nx: 0,
                                ny: 0,
                                nz: 0,
                                body: this.physicsWorld.createRigidBody(bodyDesc),
                            }

                            chunkPhysics.boxes.push(box)
                        }
                    }
                }
            }

            // 2. Check if we can merge it with its neighbors
            if (box) {
                // Check what can be merged
                const { xi, yi, zi } = box

                // merge=1 means merge just with the self box
                box.nx = nx
                box.ny = ny
                box.nz = nz

                // Merge in x
                for (let i = xi; i < nx + 1; i++) {
                    if (
                        !chunkPhysics.isFilled(i, yi, zi) ||
                        (chunkPhysics.isBoxified(i, yi, zi) && chunkPhysics.getBoxIndex(i, yi, zi) !== -1)
                    ) {
                        // Can't merge this box. Make sure we limit the mergeing
                        box.nx = i - xi
                        break
                    }
                }

                // Merge in y
                let found = false
                for (let i = xi; !found && i < xi + box.nx; i++) {
                    for (let j = yi; !found && j < ny + 1; j++) {
                        if (
                            !chunkPhysics.isFilled(i, j, zi) ||
                            (chunkPhysics.isBoxified(i, j, zi) && chunkPhysics.getBoxIndex(i, j, zi) !== -1)
                        ) {
                            // Can't merge this box. Make sure we limit the mergeing
                            if (box.ny > j - yi) box.ny = j - yi
                        }
                    }
                }

                // Merge in z
                found = false
                for (let i = xi; !found && i < xi + box.nx; i++) {
                    for (let j = yi; !found && j < yi + box.ny; j++) {
                        for (let k = zi; k < nz + 1; k++) {
                            if (
                                !chunkPhysics.isFilled(i, j, k) ||
                                (chunkPhysics.isBoxified(i, j, k) && chunkPhysics.getBoxIndex(i, j, k) !== -1)
                            ) {
                                // Can't merge this box. Make sure we limit the mergeing
                                if (box.nz > k - zi) box.nz = k - zi
                            }
                        }
                    }
                }

                if (box.nx === 0) box.nx = 1
                if (box.ny === 0) box.ny = 1
                if (box.nz === 0) box.nz = 1

                // Set the merged boxes as boxified
                for (let i = xi; i < xi + box.nx; i++) {
                    for (let j = yi; j < yi + box.ny; j++) {
                        for (let k = zi; k < zi + box.nz; k++) {
                            if (i >= xi && i <= xi + box.nx && j >= yi && j <= yi + box.ny && k >= zi && k <= zi + box.nz) {
                                chunkPhysics.setBoxified(i, j, k, true)
                            }
                        }
                    }
                }

                box = null
            } else {
                break
            }
        }

        // Set box positions
        const { sx, sy, sz } = chunkPhysics

        const [ox, oy, oz] = chunkPhysics.offset

        for (let i = 0; i < chunkPhysics.boxes.length; i++) {
            const box = chunkPhysics.boxes[i]
            box.body.setTranslation(
                new Rapier.Vector3(
                    ox + box.xi * sx + box.nx * sx * 0.5 - 0.5,
                    oy + box.yi * sy + box.ny * sy * 0.5 - 0.5,
                    oz + box.zi * sz + box.nz * sz * 0.5 - 0.5,
                ),
                false,
            )

            // Replace box shapes
            const colliderDesc = Rapier.ColliderDesc.cuboid(box.nx * sx * 0.5, box.ny * sy * 0.5, box.nz * sz * 0.5)

            this.physicsWorld.createCollider(colliderDesc, box.body)
        }
    }
}

export class PhysicsSystem extends System {
    eventQueue = new Rapier.EventQueue(false)

    entityToRigidBody = new Map<Entity, Rapier.RigidBody>()
    rigidBodyToEntity = new Map<Rapier.RigidBody, Entity>()

    paused = false

    time = 0
    lastTime = 0
    accumulator = 0

    worldScale = new Vector3(1, 1, 1)

    rigidBodyQuery = this.query([RigidBodyComponent])

    physicsWorld = this.singleton(PhysicsWorldComponent)!

    static MAX_SUB_STEPS = 10

    static TIME_STEP = 1 / 60

    onUpdate(deltaTime: number): void {
        // clamp delta
        const delta = Math.min(deltaTime, 0.1)

        // Fixed timeStep simulation progression
        // https://gafferongames.com/post/fix_your_timestep/
        const previousTranslations: Record<
            string,
            {
                rotation: Rapier.Rotation
                translation: Rapier.Vector3
            }
        > = {}

        // Step the physics simulation
        const nowTime = this.time + (this.paused ? 0 : delta * 1000)
        this.time = nowTime

        const timeStepMs = PhysicsSystem.TIME_STEP * 1000
        const timeSinceLast = nowTime - this.lastTime
        this.lastTime = nowTime
        this.accumulator += timeSinceLast

        if (!this.paused) {
            let subSteps = 0
            while (this.accumulator >= timeStepMs && subSteps < PhysicsSystem.MAX_SUB_STEPS) {
                // Collect previous state
                this.physicsWorld.bodies.forEach((b) => {
                    previousTranslations[b.handle] = {
                        rotation: b.rotation(),
                        translation: b.translation(),
                    }
                })

                // Step
                this.physicsWorld.step(this.eventQueue)
                subSteps++
                this.accumulator -= timeStepMs
            }
        }

        const interpolationAlpha = (this.accumulator % timeStepMs) / timeStepMs

        // Update physics bodies and transforms
        for (const entity of this.rigidBodyQuery) {
            const rigidBodyComponent = entity.get(RigidBodyComponent)
            const { rigidBody } = rigidBodyComponent

            // todo: sleep events
            rigidBodyComponent.isSleeping = rigidBody.isSleeping()

            // Only proceed if Object3DComponent is in the entity
            const object3D = entity.find(Object3DComponent)

            if (object3D) {
                if (rigidBody.isFixed() && object3D.userData.physicsPositionInitialised) continue

                const oldState = previousTranslations[rigidBody.handle]

                const { x: tX, y: tY, z: tZ } = rigidBody.translation()
                const { x: rX, y: rY, z: rZ, w: rW } = rigidBody.rotation()

                const newTranslation = new Vector3(tX, tY, tZ)
                const newRotation = new Quaternion(rX, rY, rZ, rW)

                const interpolatedTranslation = oldState
                    ? new Vector3(oldState.translation.x, oldState.translation.y, oldState.translation.z).lerp(
                          newTranslation,
                          interpolationAlpha,
                      )
                    : newTranslation
                const interpolatedRotation = oldState
                    ? new Quaternion(oldState.rotation.x, oldState.rotation.y, oldState.rotation.z, oldState.rotation.w).slerp(
                          newRotation,
                          interpolationAlpha,
                      )
                    : newRotation

                object3D.matrixAutoUpdate = false
                object3D.matrix.compose(interpolatedTranslation, interpolatedRotation, this.worldScale)

                object3D.userData.physicsPositionInitialised = true

                // todo: instanced mesh support
            }
        }

        // todo: emit collision events
    }
}

export const RapierInit = ({ children }: { children: React.ReactNode }) => {
    suspend(() => Rapier.init(), [])

    return <>{children}</>
}

export const RapierPhysicsPlugin = {
    components: [RigidBodyComponent, VoxelChunkPhysicsComponent, PhysicsWorldComponent],
    systems: [PhysicsSystem, VoxelPhysicsSystem],
    setup: (world) => {
        const physicsWorldEntity = world.create()
        const physicsWorld = physicsWorldEntity.add(PhysicsWorldComponent, new Rapier.World(new Rapier.Vector3(0, -9.81, 0)))

        return { physicsWorld }
    },
} satisfies VoxelEnginePlugin

export type RapierPhysicsPlugin = typeof RapierPhysicsPlugin
