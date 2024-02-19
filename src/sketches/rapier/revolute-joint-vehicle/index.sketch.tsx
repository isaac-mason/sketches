import { MotorModel } from '@dimforge/rapier3d-compat'
import { KeyboardControls, OrbitControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CylinderCollider, Physics, RapierRigidBody, RigidBody, useFixedJoint, useRevoluteJoint } from '@react-three/rapier'
import { useControls } from 'leva'
import React, { RefObject, createRef, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { Quaternion, Vector3, Vector3Tuple, Vector4Tuple } from 'three'
import { Canvas, usePageVisible } from '../../../common'

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

const AXLE_TO_CHASSIS_JOINT_STIFFNESS = 100
const AXLE_TO_CHASSIS_JOINT_DAMPING = 10

const DRIVEN_WHEEL_TARGET_VELOCITY = 1000
const DRIVEN_WHEEL_FACTOR = 10

const TURN_ANGLE = 0.6

type FixedJointProps = {
    body: RefObject<RapierRigidBody>
    wheel: RefObject<RapierRigidBody>
    body1Anchor: Vector3Tuple
    body1LocalFrame: Vector4Tuple
    body2Anchor: Vector3Tuple
    body2LocalFrame: Vector4Tuple
}

const FixedJoint = ({ body, wheel, body1Anchor, body1LocalFrame, body2Anchor, body2LocalFrame }: FixedJointProps) => {
    useFixedJoint(body, wheel, [body1Anchor, body1LocalFrame, body2Anchor, body2LocalFrame])

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

const AxleJoint = ({ body, wheel, bodyAnchor, wheelAnchor, rotationAxis, isDriven }: AxleJointProps) => {
    const joint = useRevoluteJoint(body, wheel, [bodyAnchor, wheelAnchor, rotationAxis])

    const forwardPressed = useKeyboardControls((state) => state.forward)
    const backwardPressed = useKeyboardControls((state) => state.back)

    useEffect(() => {
        if (!isDriven) return

        let forward = 0
        if (forwardPressed) forward += 1
        if (backwardPressed) forward -= 1

        forward *= DRIVEN_WHEEL_TARGET_VELOCITY

        if (forward !== 0) {
            wheel.current?.wakeUp()
        }

        joint.current?.configureMotorModel(MotorModel.AccelerationBased)
        joint.current?.configureMotorVelocity(forward, DRIVEN_WHEEL_FACTOR)
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

const SteeredJoint = ({ body, wheel, bodyAnchor, wheelAnchor, rotationAxis }: SteeredJointProps) => {
    const joint = useRevoluteJoint(body, wheel, [bodyAnchor, wheelAnchor, rotationAxis])

    const left = useKeyboardControls((state) => state.left)
    const right = useKeyboardControls((state) => state.right)
    let targetPos = 0
    if (left) targetPos += TURN_ANGLE
    if (right) targetPos -= TURN_ANGLE

    useEffect(() => {
        joint.current?.configureMotorModel(MotorModel.ForceBased)
        joint.current?.configureMotorPosition(targetPos, AXLE_TO_CHASSIS_JOINT_STIFFNESS, AXLE_TO_CHASSIS_JOINT_DAMPING)
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

const axleY = -0.6
const wheelY = -0.6
const wheels: WheelInfo[] = [
    {
        axlePosition: [-1.2, axleY, 0.7],
        wheelPosition: [-1.2, wheelY, 1],
        isSteered: true,
        side: 'left',
        isDriven: false,
    },
    {
        axlePosition: [-1.2, axleY, -0.7],
        wheelPosition: [-1.2, wheelY, -1],
        isSteered: true,
        side: 'right',
        isDriven: false,
    },
    {
        axlePosition: [1.2, axleY, 0.7],
        wheelPosition: [1.2, wheelY, 1],
        isSteered: false,
        side: 'left',
        isDriven: true,
    },
    {
        axlePosition: [1.2, axleY, -0.7],
        wheelPosition: [1.2, wheelY, -1],
        isSteered: false,
        side: 'right',
        isDriven: true,
    },
]

const vec3 = {
    add: (a: Vector3Tuple, b: Vector3Tuple) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]] as Vector3Tuple,
}

type RevoluteJointVehicleProps = {
    position: Vector3Tuple
}

const RevoluteJointVehicle = ({ position }: RevoluteJointVehicleProps) => {
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

    const wheelRefs = useRef<RefObject<RapierRigidBody>[]>(wheels.map(() => createRef()))

    const axleRefs = useRef<RefObject<RapierRigidBody>[]>(wheels.map(() => createRef()))

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
                <RigidBody ref={chassisRef} position={position} colliders="cuboid" mass={5}>
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
                            position={vec3.add(wheel.axlePosition, position)}
                            colliders="cuboid"
                            mass={0.2}
                        >
                            <mesh rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
                                <boxGeometry args={[0.3, 0.3, 0.3]} />
                                <meshStandardMaterial color="#999" />
                            </mesh>
                        </RigidBody>

                        {/* wheel */}
                        <RigidBody
                            ref={wheelRefs.current[i]}
                            position={vec3.add(wheel.wheelPosition, position)}
                            colliders={false}
                            mass={0.2}
                            restitution={0}
                        >
                            <mesh rotation-x={-Math.PI / 2} castShadow receiveShadow>
                                <cylinderGeometry args={[0.25, 0.25, 0.24, 32]} />
                                <meshStandardMaterial color="#666" />
                            </mesh>

                            <mesh rotation-x={-Math.PI / 2}>
                                <cylinderGeometry args={[0.251, 0.251, 0.241, 16]} />
                                <meshStandardMaterial color="#000" wireframe />
                            </mesh>

                            <CylinderCollider mass={0.5} friction={1.5} args={[0.125, 0.25]} rotation={[-Math.PI / 2, 0, 0]} />
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
                            bodyAnchor={[0, 0, wheel.side === 'left' ? 0.35 : -0.35]}
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

const randBetween = (min: number, max: number) => Math.random() * (max - min) + min

const Scene = () => {
    const nSpheres = 5
    const spherePositions: [number, number, number][] = useMemo(
        () => Array.from({ length: nSpheres }).map(() => [randBetween(-5, -20), randBetween(1, 5), randBetween(-5, 5)]),
        [],
    )
    const sphereArgs: [number][] = useMemo(() => Array.from({ length: nSpheres }).map(() => [randBetween(0.5, 1.2)]), [])

    return (
        <>
            {/* spheres */}
            {Array.from({ length: nSpheres }).map((_, idx) => (
                <RigidBody key={idx} colliders="ball" mass={0.1} position={spherePositions[idx]}>
                    <mesh castShadow>
                        <sphereGeometry args={sphereArgs[idx]} />
                        <meshStandardMaterial color="orange" />
                    </mesh>
                </RigidBody>
            ))}

            {/* boxes */}
            {Array.from({ length: 12 }).map((_, idx) => (
                <RigidBody key={idx} colliders="cuboid" mass={0.2} position={[-28, 0.2, 11 - idx * 2]}>
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
            <ambientLight intensity={2.5} />
            <pointLight
                intensity={500}
                decay={1.5}
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
            <Canvas camera={{ fov: 60, position: [30, 30, 0] }} shadows>
                <Physics
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                    paused={!visible}
                    debug={debug}
                    numSolverIterations={10}
                    numAdditionalFrictionIterations={10}
                    numInternalPgsIterations={10}
                >
                    <KeyboardControls map={CONTROLS_MAP}>
                        <RevoluteJointVehicle position={[0, 1, 0]} />
                    </KeyboardControls>

                    <Scene />
                </Physics>
            </Canvas>

            <ControlsText>use wasd to drive</ControlsText>
        </>
    )
}
