import Rapier from '@dimforge/rapier3d-compat'
import {
    Environment,
    KeyboardControls,
    PointerLockControls,
    useKeyboardControls,
} from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
    CapsuleCollider,
    Debug,
    Physics,
    RigidBody,
    RigidBodyApi,
    RigidBodyApiRef,
    useRapier,
} from '@react-three/rapier'
import { useControls as useLevaControls } from 'leva'
import { RefObject, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import * as THREE from 'three'
import { Group, PerspectiveCamera, Vector3 } from 'three'
import { clamp } from 'three/src/math/MathUtils'
import { useLoadingAssets } from '../../hooks/use-loading-assets'
import { useTabVisible } from '../../hooks/use-tab-visible'
import { Canvas } from '../Canvas'
import { GameLevel, Shield, Sword } from './models'

const LEVA_KEY = 'rapier-kinematic-character-controller'

const direction = new THREE.Vector3()
const frontVector = new THREE.Vector3()
const sideVector = new THREE.Vector3()
const rotation = new THREE.Vector3()

const NORMAL_FOV = 90
const SPRINT_FOV = 105

type KinematicCharacterControllerProps = {
    characterRigidBody: RigidBodyApiRef
    characterColliderRef: RefObject<Rapier.Collider[]>
    shieldHandRef: RefObject<THREE.Group | null>
    swordHandRef: RefObject<THREE.Group | null>
}

const useKinematicCharacterController = ({
    characterRigidBody,
    characterColliderRef,
    shieldHandRef,
    swordHandRef,
}: KinematicCharacterControllerProps) => {
    const rapier = useRapier()

    const camera = useThree((state) => state.camera)

    const characterController = useRef<Rapier.KinematicCharacterController>(
        null!
    )

    const [, getKeyboardControls] = useKeyboardControls()

    const {
        applyImpulsesToDynamicBodies,
        snapToGroundDistance,
        characterShapeOffset,
        autoStepMaxHeight,
        autoStepMinWidth,
        autoStepIncludeDynamicBodies,
        accelerationTimeAirborne,
        accelerationTimeGrounded,
        timeToJumpApex,
        maxJumpHeight,
        minJumpHeight,
        velocityXZSmoothing,
        velocityXZMin,
    } = useLevaControls(`${LEVA_KEY}-controller`, {
        applyImpulsesToDynamicBodies: true,
        snapToGroundDistance: 0.1,
        characterShapeOffset: 0.1,
        autoStepMaxHeight: 0.7,
        autoStepMinWidth: 0.3,
        autoStepIncludeDynamicBodies: true,
        accelerationTimeAirborne: 0.2,
        accelerationTimeGrounded: 0.025,
        timeToJumpApex: 1,
        maxJumpHeight: 4,
        minJumpHeight: 1,
        velocityXZSmoothing: 0.2,
        velocityXZMin: 0.0001,
    })

    const jumpGravity = useMemo(
        () => -(2 * maxJumpHeight) / Math.pow(timeToJumpApex, 2),
        [maxJumpHeight, timeToJumpApex]
    )

    const maxJumpVelocity = useMemo(
        () => Math.abs(jumpGravity) * timeToJumpApex,
        [jumpGravity, timeToJumpApex]
    )

    const minJumpVelocity = useMemo(
        () => Math.sqrt(2 * Math.abs(jumpGravity) * minJumpHeight),
        [jumpGravity, minJumpHeight]
    )

    const horizontalVelocity = useRef({ x: 0, z: 0 })
    const jumpVelocity = useRef(0)
    const holdingJump = useRef(false)
    const jumpTime = useRef(0)
    const jumping = useRef(false)

    useEffect(() => {
        const world = rapier.world.raw()

        characterController.current =
            world.createCharacterController(characterShapeOffset)
        characterController.current.enableAutostep(
            autoStepMaxHeight,
            autoStepMinWidth,
            autoStepIncludeDynamicBodies
        )
        characterController.current.enableSnapToGround(snapToGroundDistance)
        characterController.current.setApplyImpulsesToDynamicBodies(
            applyImpulsesToDynamicBodies
        )

        return () => {
            characterController.current.free()
            characterController.current = null!
        }
    }, [
        characterShapeOffset,
        autoStepMaxHeight,
        autoStepMinWidth,
        autoStepIncludeDynamicBodies,
        snapToGroundDistance,
        applyImpulsesToDynamicBodies,
    ])

    useFrame((state, delta) => {
        if (
            !characterRigidBody.current ||
            !characterController.current ||
            !characterColliderRef.current
        ) {
            return
        }

        const { forward, backward, left, right, jump, sprint } =
            getKeyboardControls()

        const characterCollider = characterColliderRef.current[0]

        const speed = (1.0 - Math.pow(0.0001, delta)) * (sprint ? 1.5 : 1)

        const characterLinvel = characterRigidBody.current.linvel()
        const currentSpeed = characterLinvel.length()
        const movingHorizontally =
            Math.abs(characterLinvel.x) > 0.1 ||
            Math.abs(characterLinvel.z) > 0.1
        const horizontalSpeed = Math.sqrt(
            characterLinvel.x * characterLinvel.x +
                characterLinvel.z * characterLinvel.z
        )
        const grounded = characterController.current.computedGrounded()

        const smoothing =
            velocityXZSmoothing *
            (grounded ? accelerationTimeGrounded : accelerationTimeAirborne)

        const factor = 1 - Math.pow(smoothing, delta)

        // x and z movement
        frontVector.set(0, 0, Number(backward) - Number(forward))
        sideVector.set(Number(left) - Number(right), 0, 0)

        direction
            .subVectors(frontVector, sideVector)
            .normalize()
            .multiplyScalar(speed)
            .applyEuler(camera.rotation)

        horizontalVelocity.current = {
            x: THREE.MathUtils.lerp(
                horizontalVelocity.current.x,
                direction.x,
                factor
            ),
            z: THREE.MathUtils.lerp(
                horizontalVelocity.current.z,
                direction.z,
                factor
            ),
        }

        // jumping and gravity
        if (jump && grounded) {
            jumping.current = true
            holdingJump.current = true
            jumpTime.current = state.clock.elapsedTime
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
            jumpVelocity.current += jumpGravity * factor
        }

        holdingJump.current = jump

        // todo: handle hitting ceiling

        // compute movement direction
        let movementDirection = {
            x: horizontalVelocity.current.x,
            y: jumpVelocity.current * factor,
            z: horizontalVelocity.current.z,
        }

        if (Math.abs(movementDirection.x) < velocityXZMin) {
            movementDirection.x = 0
        }
        if (Math.abs(movementDirection.z) < velocityXZMin) {
            movementDirection.z = 0
        }

        // compute collider movement and update rigid body
        characterController.current.computeColliderMovement(
            characterCollider,
            movementDirection
        )

        const translation = characterRigidBody.current.translation()
        const newPosition = new Vector3().copy(translation)
        const movement = characterController.current.computedMovement()
        newPosition.x += movement.x
        newPosition.y += movement.y
        newPosition.z += movement.z
        characterRigidBody.current.setNextKinematicTranslation(newPosition)

        // update camera
        camera.position.set(translation.x, translation.y + 1, translation.z)
        if (camera instanceof PerspectiveCamera) {
            camera.fov = THREE.MathUtils.lerp(
                camera.fov,
                sprint && currentSpeed > 0.1 ? SPRINT_FOV : NORMAL_FOV,
                10 * delta
            )
            camera.updateProjectionMatrix()
        }

        // update hands
        const handRotationSpeed = sprint ? 15 : 10
        const handBobSpeed = sprint ? 15 : 10
        const handBobHeight = 0.5

        const bob = (group: Group | null, side: 'left' | 'right') => {
            if (!group) {
                return
            }

            const rotationScalar = clamp(currentSpeed / 10, 0, 1)

            const yRot =
                Math.sin(
                    (currentSpeed > 0.1 ? 1 : 0) *
                        state.clock.elapsedTime *
                        handRotationSpeed
                ) / 6

            group.children[0].rotation.x = THREE.MathUtils.lerp(
                group.children[0].rotation.x,
                yRot * rotationScalar * (side === 'left' ? -1 : 1),
                0.1
            )

            group.rotation.copy(camera.rotation)

            group.position
                .copy(camera.position)
                .add(camera.getWorldDirection(rotation).multiplyScalar(1))

            const bobScalar = clamp(horizontalSpeed / 10, 0, 1)

            const yPos =
                (Math.sin(
                    (movingHorizontally ? 1 : 0) *
                        state.clock.elapsedTime *
                        handBobSpeed
                ) /
                    6) *
                handBobHeight

            group.position.y += yPos * (side === 'left' ? -1 : 1) * bobScalar
        }

        bob(shieldHandRef.current, 'left')
        bob(swordHandRef.current, 'right')
    })
}

export const Player = (props: JSX.IntrinsicElements['group']) => {
    const characterRigidBody = useRef<RigidBodyApi>(null!)
    const characterColliderRef = useRef<Rapier.Collider[]>(null!)
    const shieldHandRef = useRef<THREE.Group>(null)
    const swordHandRef = useRef<THREE.Group>(null)

    useKinematicCharacterController({
        characterRigidBody,
        characterColliderRef,
        shieldHandRef,
        swordHandRef,
    })

    return (
        <group>
            <RigidBody
                {...props}
                ref={characterRigidBody}
                colliders={false}
                mass={1}
                type="kinematicPosition"
                enabledRotations={[false, false, false]}
            >
                <CapsuleCollider ref={characterColliderRef} args={[1, 0.5]} />
            </RigidBody>

            <group ref={shieldHandRef}>
                <Shield position={[-0.5, -0.35, 0.3]} rotation-y={Math.PI} />
            </group>
            <group
                ref={swordHandRef}
                onPointerMissed={() => {
                    const sword = swordHandRef.current
                    if (sword) {
                        sword.children[0].rotation.x = -1
                    }
                }}
            >
                <Sword position={[0.5, -0.4, 0.3]} rotation-y={-Math.PI / 4} />
            </group>
        </group>
    )
}

const Scene = () => {
    const { debug } = useLevaControls(`${LEVA_KEY}-physics`, {
        debug: false,
    })

    return (
        <>
            <KeyboardControls
                map={[
                    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                    { name: 'jump', keys: ['Space'] },
                    { name: 'sprint', keys: ['Shift'] },
                ]}
            >
                <Player position={[20, 5, -50]} />
                <PointerLockControls makeDefault />
            </KeyboardControls>

            <GameLevel />

            <Environment preset="sunset" />

            {debug && <Debug />}
        </>
    )
}

const ControlsText = styled.div`
    position: absolute;
    bottom: 4em;
    left: 0;
    width: 100%;
    text-align: center;
    font-size: 2em;
    color: white;
    font-family: monospace;
    text-shadow: 2px 2px black;
`

export default () => {
    const loading = useLoadingAssets()
    const tabVisible = useTabVisible()

    return (
        <>
            <h1>Rapier - Kinematic Character Controller</h1>

            <Canvas>
                <Physics timeStep="vary" paused={!tabVisible || loading}>
                    <Scene />
                </Physics>
            </Canvas>

            <ControlsText>
                <p>WASD - move, SHIFT - sprint, SPACE - jump</p>
            </ControlsText>
        </>
    )
}