import {
    KeyboardControls,
    OrbitControls,
    useKeyboardControls,
} from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
    CylinderCollider,
    Physics,
    RapierRigidBody,
    RigidBody,
    useFixedJoint,
    useRapier,
    useRevoluteJoint,
} from '@react-three/rapier'
import { useControls } from 'leva'
import React, { createRef, RefObject, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { Quaternion, Vector3, Vector3Tuple, Vector4Tuple } from 'three'
import { usePageVisible } from '../../hooks/use-page-visible'
import { Canvas } from '../Canvas'

const LEVA_KEY = 'rapier-revolute-joint-vehicle'

const CONTROLS = {
    forward: 'forward',
    back: 'back',
    left: 'left',
    right: 'right',
    brake: 'brake',
}

const CONTROLS_MAP = [
    { name: CONTROLS.forward, keys: ['ArrowUp', 'w', 'W'] },
    { name: CONTROLS.back, keys: ['ArrowDown', 's', 'S'] },
    { name: CONTROLS.left, keys: ['ArrowLeft', 'a', 'A'] },
    { name: CONTROLS.right, keys: ['ArrowRight', 'd', 'D'] },
    { name: CONTROLS.brake, keys: ['Space'] },
]

const RAPIER_UPDATE_PRIORITY = -50
const AFTER_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY - 1

const AXLE_TO_CHASSIS_JOINT_STIFFNESS = 150000
const AXLE_TO_CHASSIS_JOINT_DAMPING = 20

const DRIVEN_WHEEL_FORCE = 600
const DRIVEN_WHEEL_DAMPING = 5

type FixedJointProps = {
    body: RefObject<RapierRigidBody>
    wheel: RefObject<RapierRigidBody>
    body1Anchor: Vector3Tuple
    body1LocalFrame: Vector4Tuple
    body2Anchor: Vector3Tuple
    body2LocalFrame: Vector4Tuple
}

const FixedJoint = ({
    body,
    wheel,
    body1Anchor,
    body1LocalFrame,
    body2Anchor,
    body2LocalFrame,
}: FixedJointProps) => {
    useFixedJoint(body, wheel, [
        body1Anchor,
        body1LocalFrame,
        body2Anchor,
        body2LocalFrame,
    ])

    return null
}

type AxleJointProps = {
    body: RefObject<RapierRigidBody>
    wheel: RefObject<RapierRigidBody>
    bodyAnchor: Vector3Tuple
    wheelAnchor: Vector3Tuple
    rotationAxis: Vector3Tuple
    isDriven: boolean
}

const AxleJoint = ({
    body,
    wheel,
    bodyAnchor,
    wheelAnchor,
    rotationAxis,
    isDriven,
}: AxleJointProps) => {
    const joint = useRevoluteJoint(body, wheel, [
        bodyAnchor,
        wheelAnchor,
        rotationAxis,
    ])

    const forwardPressed = useKeyboardControls((state) => state.forward)
    const backwardPressed = useKeyboardControls((state) => state.back)

    useEffect(() => {
        if (!isDriven) return

        let forward = 0
        if (forwardPressed) forward += 1
        if (backwardPressed) forward -= 1

        forward *= DRIVEN_WHEEL_FORCE

        if (forward !== 0) {
            wheel.current?.wakeUp()
        }

        joint.current?.configureMotorVelocity(forward, DRIVEN_WHEEL_DAMPING)
    }, [forwardPressed, backwardPressed])

    return null
}

type SteeredJointProps = {
    body: RefObject<RapierRigidBody>
    wheel: RefObject<RapierRigidBody>
    bodyAnchor: Vector3Tuple
    wheelAnchor: Vector3Tuple
    rotationAxis: Vector3Tuple
}

const SteeredJoint = ({
    body,
    wheel,
    bodyAnchor,
    wheelAnchor,
    rotationAxis,
}: SteeredJointProps) => {
    const joint = useRevoluteJoint(body, wheel, [
        bodyAnchor,
        wheelAnchor,
        rotationAxis,
    ])

    const left = useKeyboardControls((state) => state.left)
    const right = useKeyboardControls((state) => state.right)
    const targetPos = left ? 0.2 : right ? -0.2 : 0

    useEffect(() => {
        joint.current?.configureMotorPosition(
            targetPos,
            AXLE_TO_CHASSIS_JOINT_STIFFNESS,
            AXLE_TO_CHASSIS_JOINT_DAMPING
        )
    }, [left, right])

    return null
}

type WheelInfo = {
    axlePosition: Vector3Tuple
    wheelPosition: Vector3Tuple
    isSteered: boolean
    side: 'left' | 'right'
    isDriven: boolean
}

const RevoluteJointVehicle = () => {
    const { cameraMode } = useControls(`${LEVA_KEY}-camera`, {
        cameraMode: {
            value: 'follow',
            options: ['follow', 'orbit'],
        },
    })

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const chassisRef = useRef<RapierRigidBody>(null)

    const wheels: WheelInfo[] = [
        {
            axlePosition: [-1.2, -0.6, 0.7],
            wheelPosition: [-1.2, -0.4, 1],
            isSteered: true,
            side: 'left',
            isDriven: false,
        },
        {
            axlePosition: [-1.2, -0.6, -0.7],
            wheelPosition: [-1.2, -0.4, -1],
            isSteered: true,
            side: 'right',
            isDriven: false,
        },
        {
            axlePosition: [1.2, -0.6, 0.7],
            wheelPosition: [1.2, -0.4, 1],
            isSteered: false,
            side: 'left',
            isDriven: true,
        },
        {
            axlePosition: [1.2, -0.6, -0.7],
            wheelPosition: [1.2, -0.4, -1],
            isSteered: false,
            side: 'right',
            isDriven: true,
        },
    ]

    const wheelRefs = useRef<RefObject<RapierRigidBody>[]>(
        wheels.map(() => createRef())
    )

    const axleRefs = useRef<RefObject<RapierRigidBody>[]>(
        wheels.map(() => createRef())
    )

    useFrame((_, delta) => {
        if (!chassisRef.current || cameraMode !== 'follow') {
            return
        }

        const t = 1.0 - Math.pow(0.01, delta)

        const idealOffset = new Vector3(10, 5, 0)
        idealOffset.applyQuaternion(chassisRef.current.rotation() as Quaternion)
        idealOffset.add(chassisRef.current.translation() as Vector3)
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(chassisRef.current.rotation() as Quaternion)
        idealLookAt.add(chassisRef.current.translation() as Vector3)

        currentCameraPosition.current.lerp(idealOffset, t)
        currentCameraLookAt.current.lerp(idealLookAt, t)

        camera.position.copy(currentCameraPosition.current)
        camera.lookAt(currentCameraLookAt.current)
    }, AFTER_RAPIER_UPDATE)

    return (
        <>
            {cameraMode === 'orbit' ? <OrbitControls /> : null}

            <group>
                {/* chassis */}
                <RigidBody ref={chassisRef} colliders="cuboid" mass={1}>
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[3.5, 0.5, 1.5]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                </RigidBody>

                {/* wheels */}
                {wheels.map((wheel, i) => (
                    <React.Fragment key={i}>
                        {/* axle */}
                        <RigidBody
                            ref={axleRefs.current[i]}
                            position={wheel.axlePosition}
                            colliders="cuboid"
                        >
                            <mesh
                                rotation={[Math.PI / 2, 0, 0]}
                                castShadow
                                receiveShadow
                            >
                                <boxGeometry args={[0.3, 0.3, 0.3]} />
                                <meshStandardMaterial color="#999" />
                            </mesh>
                        </RigidBody>

                        {/* wheel */}
                        <RigidBody
                            ref={wheelRefs.current[i]}
                            position={wheel.wheelPosition}
                            colliders={false}
                        >
                            <mesh
                                rotation-x={-Math.PI / 2}
                                castShadow
                                receiveShadow
                            >
                                <cylinderGeometry
                                    args={[0.25, 0.25, 0.24, 32]}
                                />
                                <meshStandardMaterial color="#666" />
                            </mesh>

                            <mesh rotation-x={-Math.PI / 2}>
                                <cylinderGeometry
                                    args={[0.251, 0.251, 0.241, 16]}
                                />
                                <meshStandardMaterial color="#000" wireframe />
                            </mesh>

                            <CylinderCollider
                                mass={0.5}
                                friction={1.5}
                                args={[0.125, 0.25]}
                                rotation={[-Math.PI / 2, 0, 0]}
                            />
                        </RigidBody>

                        {/* axle to chassis joint */}
                        {!wheel.isSteered ? (
                            <FixedJoint
                                body={chassisRef}
                                wheel={axleRefs.current[i]}
                                body1Anchor={wheel.axlePosition}
                                body1LocalFrame={[0, 0, 0, 1]}
                                body2Anchor={[0, 0, 0]}
                                body2LocalFrame={[0, 0, 0, 1]}
                            />
                        ) : (
                            <SteeredJoint
                                body={chassisRef}
                                wheel={axleRefs.current[i]}
                                bodyAnchor={wheel.axlePosition}
                                wheelAnchor={[0, 0, 0]}
                                rotationAxis={[0, 1, 0]}
                            />
                        )}

                        {/* wheel to axle joint */}
                        <AxleJoint
                            body={axleRefs.current[i]}
                            wheel={wheelRefs.current[i]}
                            bodyAnchor={[
                                0,
                                0,
                                wheel.side === 'left' ? 0.35 : -0.35,
                            ]}
                            wheelAnchor={[0, 0, 0]}
                            rotationAxis={[0, 0, 1]}
                            isDriven={wheel.isDriven}
                        />
                    </React.Fragment>
                ))}
            </group>
        </>
    )
}

const randBetween = (min: number, max: number) =>
    Math.random() * (max - min) + min

const Scene = () => {
    const nSpheres = 5
    const spherePositions: [number, number, number][] = useMemo(
        () =>
            Array.from({ length: nSpheres }).map(() => [
                randBetween(-5, -20),
                randBetween(1, 5),
                randBetween(-5, 5),
            ]),
        []
    )
    const sphereArgs: [number][] = useMemo(
        () =>
            Array.from({ length: nSpheres }).map(() => [randBetween(0.5, 1.2)]),
        []
    )

    return (
        <>
            {/* spheres */}
            {Array.from({ length: nSpheres }).map((_, idx) => (
                <RigidBody
                    key={idx}
                    colliders="ball"
                    mass={0.1}
                    position={spherePositions[idx]}
                >
                    <mesh castShadow>
                        <sphereGeometry args={sphereArgs[idx]} />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </RigidBody>
            ))}

            {/* boxes */}
            {Array.from({ length: 6 }).map((_, idx) => (
                <RigidBody
                    key={idx}
                    colliders="cuboid"
                    mass={0.2}
                    position={[-28, 0.5 + idx * 2.2, Math.floor(idx / 2) - 1]}
                >
                    <mesh>
                        <boxGeometry args={[1, 2, 1]} />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </RigidBody>
            ))}

            {/* ground */}
            <RigidBody type="fixed" friction={2} position-y={-2}>
                <mesh receiveShadow>
                    <boxGeometry args={[150, 2, 150]} />
                    <meshStandardMaterial color="#ccc" />
                </mesh>
            </RigidBody>
            <gridHelper args={[150, 15]} position-y={-0.99} />

            {/* lights */}
            <ambientLight intensity={0.8} />
            <pointLight
                intensity={0.5}
                position={[-10, 30, 20]}
                castShadow
                shadow-camera-top={8}
                shadow-camera-right={8}
                shadow-camera-bottom={-8}
                shadow-camera-left={-8}
                shadow-mapSize-height={2048}
                shadow-mapSize-width={2048}
            />
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
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-debug`, {
        debug: false,
    })

    return (
        <>
            <h1>Rapier - Revolute Joint Vehicle</h1>

            <Canvas camera={{ fov: 60, position: [30, 30, 0] }} shadows>
                <Physics
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                    paused={!visible}
                    debug={debug}
                    maxStabilizationIterations={50}
                    maxVelocityFrictionIterations={50}
                    maxVelocityIterations={100}
                >
                    <KeyboardControls map={CONTROLS_MAP}>
                        <RevoluteJointVehicle />
                    </KeyboardControls>

                    <Scene />
                </Physics>
            </Canvas>

            <ControlsText>use wasd to drive</ControlsText>
        </>
    )
}
