import Jolt from 'jolt-physics'

export type Vector3Tuple = [number, number, number]
export type Vector4Tuple = [number, number, number, number]

export type PhysicsConfig = {
    timeStep: number | 'vary'
    interpolate: boolean
    paused: boolean
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

export const Layer = {
    NON_MOVING: 0,
    MOVING: 1,
}

export const NUM_OBJECT_LAYERS = 2
