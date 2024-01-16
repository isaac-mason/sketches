import { System } from 'arancini/systems'
import Jolt from 'jolt-physics'
import * as THREE from 'three'

export const jolt = await Jolt()

export type Vector3Tuple = [number, number, number]
export type Vector4Tuple = [number, number, number, number]

export type PhysicsConfig = {
    gravity?: Vector3Tuple
}

export type BodyEvents = {
    onContactAdded?: (
        body1: Jolt.Body,
        body2: Jolt.Body,
        contactManifold: Jolt.ContactManifold,
        contactSettings: Jolt.ContactSettings,
    ) => void
    onContactPersisted?: (
        body1: Jolt.Body,
        body2: Jolt.Body,
        contactManifold: Jolt.ContactManifold,
        contactSettings: Jolt.ContactSettings,
    ) => void
    onContactRemoved?: (subShapePair: Jolt.SubShapeIDPair) => void
}

export type JoltEntity = {
    physicsConfig?: PhysicsConfig
    body?: Jolt.Body
    bodyEvents?: BodyEvents
    constraint?: Jolt.Constraint
    three?: THREE.Object3D
}

export const joltComponents: Array<keyof JoltEntity> = ['physicsConfig', 'body', 'bodyEvents', 'constraint', 'three']

const Layer = {
    NON_MOVING: 0,
    MOVING: 1,
}

const NUM_OBJECT_LAYERS = 2

export class PhysicsSystem extends System<JoltEntity> {
    joltInterface!: Jolt.JoltInterface

    physicsSystem!: Jolt.PhysicsSystem

    bodyInterface!: Jolt.BodyInterface

    bodyQuery = this.query((e) => e.has('body'))

    constraintQuery = this.query((e) => e.has('constraint'))

    bodyWithThreeQuery = this.query((e) => e.has('body', 'three'))

    physicsConfig = this.singleton('physicsConfig')

    onInit(): void {
        /* config and defaults */
        const { gravity = [0, -9.81, 0] } = this.physicsConfig ?? {}

        /* setup collisions and broadphase */
        const objectFilter = new jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS)
        objectFilter.EnableCollision(Layer.NON_MOVING, Layer.MOVING)
        objectFilter.EnableCollision(Layer.MOVING, Layer.MOVING)

        const BP_LAYER_NON_MOVING = new jolt.BroadPhaseLayer(0)
        const BP_LAYER_MOVING = new jolt.BroadPhaseLayer(1)
        const NUM_BROAD_PHASE_LAYERS = 2
        const bpInterface = new jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BROAD_PHASE_LAYERS)
        bpInterface.MapObjectToBroadPhaseLayer(Layer.NON_MOVING, BP_LAYER_NON_MOVING)
        bpInterface.MapObjectToBroadPhaseLayer(Layer.MOVING, BP_LAYER_MOVING)

        const settings = new jolt.JoltSettings()
        settings.mObjectLayerPairFilter = objectFilter
        settings.mBroadPhaseLayerInterface = bpInterface
        settings.mObjectVsBroadPhaseLayerFilter = new jolt.ObjectVsBroadPhaseLayerFilterTable(
            settings.mBroadPhaseLayerInterface,
            NUM_BROAD_PHASE_LAYERS,
            settings.mObjectLayerPairFilter,
            NUM_OBJECT_LAYERS,
        )

        /* get interfaces */
        this.joltInterface = new jolt.JoltInterface(settings)
        this.physicsSystem = this.joltInterface.GetPhysicsSystem()
        this.bodyInterface = this.physicsSystem.GetBodyInterface()

        /* world settings */
        this.physicsSystem.SetGravity(new jolt.Vec3(...gravity))

        /* contact events */
        const contactListener = new jolt.ContactListenerJS()

        contactListener.OnContactAdded = ((body1Ptr: number, body2Ptr: number, manifoldPtr: number, settingsPtr: number) => {
            const body1 = jolt.wrapPointer(body1Ptr, jolt.Body)
            const body2 = jolt.wrapPointer(body2Ptr, jolt.Body)
            const manifold = jolt.wrapPointer(manifoldPtr, jolt.ContactManifold)
            const settings = jolt.wrapPointer(settingsPtr, jolt.ContactSettings)

            const body1Entity = this.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactAdded) {
                body1Entity.bodyEvents.onContactAdded(body1, body2, manifold, settings)
            }

            const body2Entity = this.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactAdded) {
                body2Entity.bodyEvents.onContactAdded(body1, body2, manifold, settings)
            }
        }) as never

        contactListener.OnContactPersisted = ((body1Ptr: number, body2Ptr: number, manifoldPtr: number, settingsPtr: number) => {
            const body1 = jolt.wrapPointer(body1Ptr, jolt.Body)
            const body2 = jolt.wrapPointer(body2Ptr, jolt.Body)
            const manifold = jolt.wrapPointer(manifoldPtr, jolt.ContactManifold)
            const settings = jolt.wrapPointer(settingsPtr, jolt.ContactSettings)

            const body1Entity = this.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactPersisted) {
                body1Entity.bodyEvents.onContactPersisted(body1, body2, manifold, settings)
            }

            const body2Entity = this.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactPersisted) {
                body2Entity.bodyEvents.onContactPersisted(body1, body2, manifold, settings)
            }
        }) as never

        contactListener.OnContactRemoved = ((subShapePairPtr: number) => {
            const subShapePair = jolt.wrapPointer(subShapePairPtr, jolt.SubShapeIDPair)

            const body1 = this.physicsSystem.GetBodyLockInterfaceNoLock().TryGetBody(subShapePair.GetBody1ID())
            const body2 = this.physicsSystem.GetBodyLockInterfaceNoLock().TryGetBody(subShapePair.GetBody2ID())

            const body1Entity = this.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactRemoved) {
                body1Entity.bodyEvents.onContactRemoved(subShapePair)
            }

            const body2Entity = this.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactRemoved) {
                body2Entity.bodyEvents.onContactRemoved(subShapePair)
            }
        }) as never

        contactListener.OnContactValidate = ((
            _body1Ptr: number,
            _body2Ptr: number,
            _baseOffsetPtr: number,
            _collideShapeResultPtr: number,
        ) => {
            // Required for JSInterface to have this function exist
            return jolt.ValidateResult_AcceptAllContactsForThisBodyPair
        }) as never

        this.physicsSystem.SetContactListener(contactListener)

        /* body entity events */
        this.bodyQuery.onEntityAdded.add((entity) => {
            const { body } = entity

            this.bodyInterface.AddBody(body.GetID(), jolt.EActivation_Activate)

            // store entity on body for easy lookup
            ;(body as any)._arancini_entity = entity
        })

        this.bodyQuery.onEntityRemoved.add(({ body }) => {
            if (!body) return

            this.bodyInterface.RemoveBody(body.GetID())
            this.bodyInterface.DestroyBody(body.GetID())
        })

        /* constraint entity events */
        this.constraintQuery.onEntityAdded.add((entity) => {
            const { constraint } = entity

            this.physicsSystem.AddConstraint(constraint)
        })

        this.constraintQuery.onEntityRemoved.add(({ constraint }) => {
            if (!constraint) return

            this.physicsSystem.RemoveConstraint(constraint)
            jolt.destroy(constraint)
        })

        /* cleanup */
        jolt.destroy(settings)
    }

    onUpdate(delta: number): void {
        // Don't go below 30 Hz to prevent spiral of death
        const deltaTime = Math.min(delta, 1.0 / 30.0)

        // When running below 55 Hz, do 2 steps instead of 1
        const numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1

        // Step the physics world
        this.joltInterface.Step(deltaTime, numSteps)

        // Update body transforms
        for (const { body, three } of this.bodyWithThreeQuery) {
            const p = body.GetPosition()
            const q = body.GetRotation()
            three.position.set(p.GetX(), p.GetY(), p.GetZ())
            three.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW())
        }
    }

    private getBodyEntity(body: Jolt.Body): JoltEntity | undefined {
        return (body as any)._arancini_entity
    }
}

export type CreateBodyParams = {
    position?: Vector3Tuple
    rotation?: Vector3Tuple
    quaternion?: Vector4Tuple
    motionType: 'kinematic' | 'dynamic' | 'static'
    layer: 'moving' | 'nonMoving'
    restitution?: number
    friction?: number
}

export type CreateBoxBodyParams = { args: Vector3Tuple } & CreateBodyParams

export const createBodyUtils = (bodyInterface: Jolt.BodyInterface) => {
    const motionTypeMap = {
        kinematic: jolt.EMotionType_Kinematic,
        dynamic: jolt.EMotionType_Dynamic,
        static: jolt.EMotionType_Static,
    }

    const layerMap = {
        nonMoving: Layer.NON_MOVING,
        moving: Layer.MOVING,
    }

    const tmpQuaternion = new THREE.Quaternion()
    const tmpEuler = new THREE.Euler()

    const createBody = (
        shape: Jolt.Shape,
        { position = [0, 0, 0], rotation, quaternion, motionType, layer, restitution, friction }: CreateBodyParams,
    ) => {
        const bodyQuaternion = new jolt.Quat(0, 0, 0, 1)

        if (rotation) {
            bodyQuaternion.Set(...(tmpQuaternion.setFromEuler(tmpEuler.set(...rotation)).toArray() as Vector4Tuple))
        } else if (quaternion) {
            bodyQuaternion.Set(...quaternion)
        }

        const creationSettings = new jolt.BodyCreationSettings(
            shape,
            new jolt.Vec3(...position),
            bodyQuaternion,
            motionTypeMap[motionType],
            layerMap[layer],
        )

        if (restitution) {
            creationSettings.mRestitution = restitution
        }

        if (friction) {
            creationSettings.mFriction = friction
        }

        const body = bodyInterface.CreateBody(creationSettings)

        jolt.destroy(creationSettings)

        return body
    }

    const createBoxBody = ({ args, ...bodyParams }: CreateBoxBodyParams) => {
        const shape = new jolt.BoxShape(new jolt.Vec3(...args))

        return createBody(shape, bodyParams)
    }

    return { createBody, createBoxBody }
}
