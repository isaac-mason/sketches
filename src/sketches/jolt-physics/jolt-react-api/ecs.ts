import Jolt from 'jolt-physics'
import { BodyEvents, PhysicsConfig } from './types'

export type JoltEntity = {
    physicsConfig?: PhysicsConfig
    body?: Jolt.Body
    bodyEvents?: BodyEvents
    constraint?: Jolt.Constraint
    three?: THREE.Object3D
}

export const joltComponents: Array<keyof JoltEntity> = ['physicsConfig', 'body', 'bodyEvents', 'constraint', 'three']
