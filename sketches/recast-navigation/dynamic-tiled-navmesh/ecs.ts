import { RapierRigidBody } from '@react-three/rapier'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { CrowdAgent } from 'recast-navigation'
import * as THREE from 'three'

export type EntityType = {
    three?: THREE.Object3D
    rigidBody?: RapierRigidBody
    traversable?: true
    crowdAgent?: CrowdAgent
    followPlayer?: true
    player?: true
}

export const world = new World<EntityType>()

export const playerQuery = world.query((e) => e.has('player', 'rigidBody'))
export const traversableQuery = world.query((e) => e.has('traversable', 'three'))
export const crowdAgentQuery = world.query((e) => e.has('crowdAgent'))
export const followersQuery = world.query((e) => e.has('crowdAgent', 'followPlayer'))

const { Entity, Component } = createReactAPI(world)

export { Component, Entity }
