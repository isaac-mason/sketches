import Jolt from 'jolt-physics'
import * as THREE from 'three'
import { BodyEvents, PhysicsConfig, WorldEvents } from './types'

export type JoltEntity = {
    physicsConfig?: PhysicsConfig
    body?: Jolt.Body
    bodyEvents?: BodyEvents
    constraint?: Jolt.Constraint
    three?: THREE.Object3D
    worldEvents?: WorldEvents
}
