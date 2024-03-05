import Rapier from '@dimforge/rapier3d-compat'
import { World } from 'arancini'
import { System } from 'arancini/systems'
import { suspend } from 'suspend-react'
import { Quaternion, Vector3 } from 'three'
import { VoxelChunkCollider as VoxelChunkColliderGenerator } from './chunk-collider'
import { ChunkEntity, CorePluginEntity, Vec3, vec3 } from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'
import { worldVoxelPositionToPhysicsPosition } from './utils'

export type RapierPhysicsPluginEntity = {
    physicsWorld?: Rapier.World
    rigidBody?: Rapier.RigidBody
    voxelChunkPhysics?: VoxelChunkPhysics
}

export type VoxelChunkPhysics = {
    rigidBody: Rapier.RigidBody
    collider?: Rapier.Collider
    offset: Vec3
    chunkColliderGenerator: VoxelChunkColliderGenerator
}

export class VoxelPhysicsSystem extends System<CorePluginEntity & RapierPhysicsPluginEntity> {
    physicsWorld = this.singleton('physicsWorld')!

    voxelWorld = this.singleton('voxelWorld')!

    voxelWorldEvents = this.singleton('voxelWorldEvents')!

    chunks = this.query((e) => e.has('voxelChunk'))

    dirtyChunks = new Set<ChunkEntity & RapierPhysicsPluginEntity>()

    onInit(): void {
        this.chunks.onEntityAdded.add((e) => {
            this.dirtyChunks.add(e)
        })

        this.voxelWorldEvents.onChunkChange.add((updates) => {
            for (const { chunk } of updates) {
                this.dirtyChunks.add(chunk as ChunkEntity & RapierPhysicsPluginEntity)
            }
        })
    }

    onUpdate(): void {
        for (const chunkEntity of this.dirtyChunks) {
            this.updateCollider(chunkEntity)
        }

        this.dirtyChunks.clear()
    }

    private updateCollider(chunkEntity: ChunkEntity & RapierPhysicsPluginEntity) {
        const { voxelChunk } = chunkEntity

        if (!chunkEntity.voxelChunkPhysics) {
            const rigidBody = this.physicsWorld.createRigidBody(Rapier.RigidBodyDesc.fixed())

            const offset = worldVoxelPositionToPhysicsPosition(vec3.chunkPositionToWorldPosition(voxelChunk.position.toArray()))

            rigidBody.setTranslation(new Rapier.Vector3(...offset), true)

            const chunkColliderGenerator = new VoxelChunkColliderGenerator(this.voxelWorld, voxelChunk)

            const voxelChunkPhysics: VoxelChunkPhysics = {
                rigidBody,
                offset,
                chunkColliderGenerator,
            }

            this.world.add(chunkEntity, 'voxelChunkPhysics', voxelChunkPhysics)
        }

        const chunkPhysics = chunkEntity.voxelChunkPhysics!

        const { positions, indices } = chunkPhysics.chunkColliderGenerator.generate()

        if (chunkPhysics.collider) {
            this.physicsWorld.removeCollider(chunkPhysics.collider, false)
        }

        const colliderDesc = Rapier.ColliderDesc.trimesh(positions, indices)
        colliderDesc.setTranslation(-0.5, -0.5, -0.5)

        const collider = this.physicsWorld.createCollider(colliderDesc, chunkPhysics.rigidBody)

        chunkPhysics.collider = collider
    }
}

export class PhysicsSystem extends System<CorePluginEntity & RapierPhysicsPluginEntity> {
    eventQueue = new Rapier.EventQueue(false)

    paused = false

    time = 0
    lastTime = 0
    accumulator = 0

    worldScale = new Vector3(1, 1, 1)

    rigidBodyQuery = this.query((e) => e.has('rigidBody'))

    physicsWorld = this.singleton('physicsWorld')!

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
            const rigidBody = entity.rigidBody

            if (!rigidBody.userData) {
                rigidBody.userData = {}
            }

            // Only proceed if Object3DComponent is in the entity
            const { object3D } = entity

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
    E: {} as RapierPhysicsPluginEntity,
    systems: [PhysicsSystem, VoxelPhysicsSystem],
    setup: (world: World<RapierPhysicsPluginEntity>) => {
        const physicsWorld = new Rapier.World(new Rapier.Vector3(0, -9.81, 0))

        world.create({
            physicsWorld,
        })

        return { physicsWorld }
    },
} satisfies VoxelEnginePlugin<RapierPhysicsPluginEntity>

export type RapierPhysicsPlugin = typeof RapierPhysicsPlugin
