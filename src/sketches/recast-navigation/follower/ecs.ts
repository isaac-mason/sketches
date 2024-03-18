import { RapierRigidBody } from '@react-three/rapier'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { NavMesh, NavMeshQuery } from 'recast-navigation'
import * as THREE from 'three'

export type NavComponent = { navMesh?: NavMesh; navMeshQuery?: NavMeshQuery }

export type EntityType = {
    isPlayer?: true
    three?: THREE.Object3D
    rigidBody?: RapierRigidBody
    nav?: NavComponent
}

export const world = new World<EntityType>()

export const navQuery = world.query((e) => e.is('nav'))
export const playerQuery = world.query((e) => e.has('isPlayer', 'rigidBody'))

const { Entity, Component } = createReactAPI(world)

export { Component, Entity }
