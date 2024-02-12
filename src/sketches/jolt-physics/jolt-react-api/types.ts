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

export type WorldEvents = {
    beforeStep?: () => void
    afterStep?: () => void
}
