import Rapier from '@dimforge/rapier3d-compat'
import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, RigidBodyProps, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Component, Entity, EntityType } from './ecs'

const _direction = new THREE.Vector3()
const _frontVector = new THREE.Vector3()
const _sideVector = new THREE.Vector3()
const _characterLinvel = new THREE.Vector3()
const _characterTranslation = new THREE.Vector3()
const _cameraWorldDirection = new THREE.Vector3()
const _cameraPosition = new THREE.Vector3()

const normalFov = 90
const sprintFov = 100

const characterShapeOffset = 0.1
const autoStepMaxHeight = 2
const autoStepMinWidth = 0.05
const accelerationTimeAirborne = 0.2
const accelerationTimeGrounded = 0.025
const timeToJumpApex = 2
const maxJumpHeight = 0.4
const minJumpHeight = 0.1
const velocityXZSmoothing = 0.1
const velocityXZMin = 0.0001
const jumpGravity = -(2 * maxJumpHeight) / Math.pow(timeToJumpApex, 2)
const maxJumpVelocity = Math.abs(jumpGravity) * timeToJumpApex
const minJumpVelocity = Math.sqrt(2 * Math.abs(jumpGravity) * minJumpHeight)

const up = new THREE.Vector3(0, 1, 0)

export const Player = (props: RigidBodyProps) => {
    const player = useRef<EntityType>(null!)

    const rapier = useRapier()
    const camera = useThree((state) => state.camera)
    const clock = useThree((state) => state.clock)

    const characterController = useRef<Rapier.KinematicCharacterController>(null!)

    const [, getKeyboardControls] = useKeyboardControls()

    const horizontalVelocity = useRef({ x: 0, z: 0 })
    const jumpVelocity = useRef(0)
    const holdingJump = useRef(false)
    const jumpTime = useRef(0)
    const jumping = useRef(false)

    useEffect(() => {
        const { world } = rapier

        characterController.current = world.createCharacterController(characterShapeOffset)
        characterController.current.enableAutostep(autoStepMaxHeight, autoStepMinWidth, true)
        characterController.current.setSlideEnabled(true)
        characterController.current.enableSnapToGround(0.1)
        characterController.current.setApplyImpulsesToDynamicBodies(true)

        return () => {
            characterController.current.free()
            characterController.current = null!
        }
    }, [])

    useBeforePhysicsStep(() => {
        const characterRigidBody = player?.current.rigidBody

        if (!characterRigidBody) return

        // teleport if falling off map
        if (characterRigidBody.translation().y < -50) {
            characterRigidBody.setTranslation(new THREE.Vector3(0, 5, 0), true)
            return
        }

        const characterCollider = characterRigidBody.collider(0)

        const { forward, backward, left, right, jump, sprint } = getKeyboardControls() as KeyControls

        const speed = 0.1 * (sprint ? 1.5 : 1)

        const grounded = characterController.current.computedGrounded()

        // x and z movement
        _frontVector.set(0, 0, Number(backward) - Number(forward))
        _sideVector.set(Number(left) - Number(right), 0, 0)

        const cameraWorldDirection = camera.getWorldDirection(_cameraWorldDirection)
        const cameraYaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z)

        _direction.subVectors(_frontVector, _sideVector).normalize().multiplyScalar(speed)
        _direction.applyAxisAngle(up, cameraYaw).multiplyScalar(-1)

        const horizontalVelocitySmoothing = velocityXZSmoothing * (grounded ? accelerationTimeGrounded : accelerationTimeAirborne)
        const horizontalVelocityLerpFactor = 1 - Math.pow(horizontalVelocitySmoothing, 0.116)
        horizontalVelocity.current = {
            x: THREE.MathUtils.lerp(horizontalVelocity.current.x, _direction.x, horizontalVelocityLerpFactor),
            z: THREE.MathUtils.lerp(horizontalVelocity.current.z, _direction.z, horizontalVelocityLerpFactor),
        }

        if (Math.abs(horizontalVelocity.current.x) < velocityXZMin) {
            horizontalVelocity.current.x = 0
        }
        if (Math.abs(horizontalVelocity.current.z) < velocityXZMin) {
            horizontalVelocity.current.z = 0
        }

        // jumping and gravity
        if (jump && grounded) {
            jumping.current = true
            holdingJump.current = true
            jumpTime.current = clock.elapsedTime
            jumpVelocity.current = maxJumpVelocity
        }

        if (!jump && grounded) {
            jumping.current = false
        }

        if (jumping.current && holdingJump.current && !jump) {
            if (jumpVelocity.current > minJumpVelocity) {
                jumpVelocity.current = minJumpVelocity
            }
        }

        if (!jump && grounded) {
            jumpVelocity.current = 0
        } else {
            jumpVelocity.current += jumpGravity * 0.116
        }

        holdingJump.current = jump

        // compute movement direction
        const movementDirection = {
            x: horizontalVelocity.current.x,
            y: jumpVelocity.current,
            z: horizontalVelocity.current.z,
        }

        // compute collider movement and update rigid body
        characterController.current.computeColliderMovement(characterCollider, movementDirection)

        const translation = characterRigidBody.translation()
        const newPosition = _characterTranslation.copy(translation as THREE.Vector3)
        const movement = characterController.current.computedMovement()
        newPosition.add(movement)

        characterRigidBody.setNextKinematicTranslation(newPosition)
    })

    useFrame((_, delta) => {
        const characterRigidBody = player.current.rigidBody
        if (!characterRigidBody) {
            return
        }

        _characterLinvel.copy(characterRigidBody.linvel() as THREE.Vector3)
        const currentSpeed = _characterLinvel.length()

        const { sprint } = getKeyboardControls() as KeyControls

        const translation = characterRigidBody.translation()
        _cameraPosition.set(translation.x, translation.y + 1, translation.z)
        camera.position.lerp(_cameraPosition, delta * 20)
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = THREE.MathUtils.lerp(camera.fov, sprint && currentSpeed > 0.1 ? sprintFov : normalFov, 10 * delta)
            camera.updateProjectionMatrix()
        }
    })

    return (
        <>
            <Entity isPlayer ref={player}>
                <Component name="rigidBody">
                    <RigidBody
                        {...props}
                        colliders={false}
                        mass={1}
                        type="kinematicPosition"
                        enabledRotations={[false, false, false]}
                    >
                        <CapsuleCollider args={[1, 0.5]} />
                    </RigidBody>
                </Component>
            </Entity>
        </>
    )
}

type KeyControls = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    sprint: boolean
    jump: boolean
}

const controls = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['Shift'] },
]

export type PlayerControls = {
    children: React.ReactNode
}

export const PlayerControls = ({ children }: PlayerControls) => {
    return (
        <KeyboardControls map={controls}>
            {children}

            <PointerLockControls makeDefault />
        </KeyboardControls>
    )
}
