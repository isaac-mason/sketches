import { useFrame, useThree } from '@react-three/fiber'
import {
    CuboidCollider,
    CylinderCollider,
    Debug,
    JointApi,
    Physics,
    RigidBody,
    RigidBodyApi,
    RigidBodyApiRef,
    useRapier,
    useRevoluteJoint,
    Vector3Array,
} from '@react-three/rapier'
import React, { Ref, useEffect, useImperativeHandle, useRef } from 'react'
import styled from 'styled-components'
import { Vector3 } from 'three'
import { DEG2RAD } from 'three/src/math/MathUtils'
import { Canvas } from '../Canvas'
import { Loop } from './Loop'
import { useControls } from './use-controls'

// interesting - https://twitter.com/KenneyNL/status/1107783904784715788?ref_src=twsrc%5Etfw%7Ctwcamp%5Etweetembed%7Ctwterm%5E1107783904784715788%7Ctwgr%5Eb6167c2fe2dd2a357cdcb3e3ca6bee5f326a34d1%7Ctwcon%5Es1_&ref_url=https%3A%2F%2Fwww.reddit.com%2Fr%2Fgodot%2Fcomments%2Fla2jxa%2Fsimple_3d_car_physics_using_rigidbody_and%2F
// wip - copying - shttps://threlte.xyz/rapier/basic-vehicle-controller

const addVector3Arrays = (a: Vector3Array, b: Vector3Array): Vector3Array => [
    a[0] + b[0],
    a[1] + b[1],
    a[2] + b[2],
]

const RAPIER_UPDATE_PRIORITY = -50

const WHEEL_STIFFNESS = 100000

type WheelProps = {
    chassisRigidBody: RigidBodyApiRef
    position: Vector3Array
    chassisAnchor: Vector3Array
    side: 'left' | 'right'
    steerable?: boolean
}

type WheelRef = {
    axleRigidBody: RigidBodyApi
    wheelRigidBody: RigidBodyApi
    axleToWheelJoint: JointApi
    axleToBodyJoint: JointApi
}

const Wheel = React.forwardRef(
    (
        {
            position,
            chassisAnchor,
            side,
            chassisRigidBody,
            steerable = false,
        }: WheelProps,
        ref: Ref<WheelRef | null>
    ) => {
        const axleRigidBodyRef = useRef<RigidBodyApi>(null)
        const wheelRigidBodyRef = useRef<RigidBodyApi>(null)

        const axleToBodyJoint = useRevoluteJoint(
            chassisRigidBody,
            axleRigidBodyRef,
            [chassisAnchor, [0, 0, 0], [0, 1, 0]]
        )

        const axleOffset: Vector3Array = [
            0.2 * (side === 'left' ? 1 : -1),
            0,
            0,
        ]

        const axleToWheelJoint = useRevoluteJoint(
            steerable ? axleRigidBodyRef : chassisRigidBody,
            wheelRigidBodyRef,
            [
                steerable
                    ? axleOffset
                    : addVector3Arrays(chassisAnchor, axleOffset),
                [0, 0, 0],
                [1, 0, 0],
            ]
        )

        useImperativeHandle(ref, () => ({
            wheelRigidBody: wheelRigidBodyRef.current!,
            axleRigidBody: axleRigidBodyRef.current!,
            axleToBodyJoint,
            axleToWheelJoint,
        }))

        return (
            <group position={position}>
                <RigidBody ref={axleRigidBodyRef}>
                    <CuboidCollider mass={1} args={[0.03, 0.03, 0.03]} />
                </RigidBody>

                <RigidBody
                    ref={wheelRigidBodyRef}
                    canSleep={false}
                    colliders={false}
                >
                    <mesh rotation-z={Math.PI / 2}>
                        <cylinderGeometry args={[0.3, 0.3, 0.3, 32]} />
                        <meshStandardMaterial color="#ccc" />
                    </mesh>

                    <CylinderCollider
                        mass={1}
                        friction={1.5}
                        args={[0.15, 0.3]}
                        rotation={[0, 0, Math.PI / 2]}
                    />
                </RigidBody>
            </group>
        )
    }
)

const Vehicle = (props: JSX.IntrinsicElements['group']) => {
    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(30, 30, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const chassisBodyRef = useRef<RigidBodyApi>(null!)

    const topLeftWheelRef = useRef<WheelRef>(null)
    const topRightWheelRef = useRef<WheelRef>(null)
    const bottomLeftWheelRef = useRef<WheelRef>(null)
    const bottomRightWheelRef = useRef<WheelRef>(null)

    const wheels = [
        topLeftWheelRef,
        topRightWheelRef,
        bottomLeftWheelRef,
        bottomRightWheelRef,
    ]
    const frontWheels = [topLeftWheelRef, topRightWheelRef]
    const backWheels = [bottomLeftWheelRef, bottomRightWheelRef]

    const controls = useControls()
    const steeringAngle = useRef(0)

    useEffect(() => {
        wheels.forEach((wheel) => {
            const axleJoint = wheel.current!.axleToBodyJoint!

            const axleJointRaw = axleJoint.raw()!
            axleJointRaw.setContactsEnabled(false)

            const wheelJoint = wheel.current!.axleToWheelJoint
            const wheelJointRaw = wheelJoint.raw()!
            wheelJointRaw.setContactsEnabled(false)
        })

        backWheels.forEach((axle) => {
            const axleJoint = axle.current!.axleToBodyJoint
            axleJoint.configureMotorPosition(0, WHEEL_STIFFNESS, 0)
        })
    }, [])

    useFrame((_, delta) => {
        // read input
        let forward = 0
        let right = 0

        if (controls.current.forward) {
            forward += 6000 * delta
        }
        if (controls.current.backward) {
            forward -= 6000 * delta
        }

        if (controls.current.left) {
            right -= 20
        }
        if (controls.current.right) {
            right += 20
        }

        // steering
        steeringAngle.current = right
        frontWheels.forEach((wheel) => {
            const axleToBodyJoint = wheel.current!.axleToBodyJoint
            axleToBodyJoint.configureMotorPosition(
                steeringAngle.current * -1 * DEG2RAD,
                WHEEL_STIFFNESS,
                2500
            )
        })

        // acceleration
        backWheels.forEach((wheel) => {
            const axleToWheelJoint = wheel.current!.axleToWheelJoint
            axleToWheelJoint.configureMotorVelocity(forward, 50)
        })
    }, RAPIER_UPDATE_PRIORITY + 1)

    useFrame((_, delta) => {
        const t = 1.0 - Math.pow(0.01, delta)

        const car = chassisBodyRef.current

        const idealOffset = new Vector3(0, 3, -6)
        idealOffset.applyQuaternion(car.rotation())
        idealOffset.add(car.translation())
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(car.rotation())
        idealLookAt.add(car.translation())

        currentCameraPosition.current.lerp(idealOffset, t)
        currentCameraLookAt.current.lerp(idealLookAt, t)

        camera.position.copy(currentCameraPosition.current)
        camera.lookAt(currentCameraLookAt.current)
    }, RAPIER_UPDATE_PRIORITY - 1)

    return (
        <group {...props}>
            <RigidBody
                ref={chassisBodyRef}
                type="dynamic"
                colliders={false}
                canSleep={false}
            >
                <mesh>
                    <boxGeometry args={[1, 0.5, 2.5]} />
                    <meshStandardMaterial color="red" />
                </mesh>

                <CuboidCollider mass={1} args={[0.5, 0.25, 1.25]} />
            </RigidBody>

            <Wheel
                ref={topLeftWheelRef}
                chassisRigidBody={chassisBodyRef}
                side="left"
                position={[0.75, -0.2, 1.2]}
                chassisAnchor={[0.75, -0.2, 1.2]}
                steerable
            />
            <Wheel
                ref={topRightWheelRef}
                chassisRigidBody={chassisBodyRef}
                side="right"
                position={[-0.75, -0.2, 1.2]}
                chassisAnchor={[-0.75, -0.2, 1.2]}
                steerable
            />
            <Wheel
                ref={bottomLeftWheelRef}
                chassisRigidBody={chassisBodyRef}
                side="left"
                position={[0.75, -0.2, -1.2]}
                chassisAnchor={[0.75, -0.2, -1.2]}
            />
            <Wheel
                ref={bottomRightWheelRef}
                chassisRigidBody={chassisBodyRef}
                side="right"
                position={[-0.75, -0.2, -1.2]}
                chassisAnchor={[-0.75, -0.2, -1.2]}
            />
        </group>
    )
}

const Scene = () => (
    <>
        {/* loop */}
        <Loop position={[-15, -1.5, 40]} />

        {/* ramps */}
        {Array.from({ length: 3 }).map((_, idx) => (
            <RigidBody key={idx} type="fixed">
                <mesh rotation-x={-0.2} position={[0, -1, 10 + idx * 15]}>
                    <boxGeometry args={[5, 1, 5]} />
                    <meshStandardMaterial color="#999" />
                </mesh>
            </RigidBody>
        ))}

        {/* ground */}
        <RigidBody type="fixed" friction={2} position-y={-2}>
            <mesh>
                <boxGeometry args={[150, 2, 150]} />
                <meshStandardMaterial color="#333" />
            </mesh>
        </RigidBody>

        {/* lights */}
        <ambientLight intensity={1} />
        <pointLight intensity={0.5} position={[-3, 3, 3]} />
    </>
)

const App = () => {
    const rapier = useRapier()

    useEffect(() => {
        const world = rapier.world.raw()

        const originalMaxStabilizationIterations =
            world.maxStabilizationIterations
        const originalMaxVelocityFrictionIterations =
            world.maxVelocityFrictionIterations
        const originalMaxVelocityIterations = world.maxVelocityIterations

        world.maxStabilizationIterations *= 200
        world.maxVelocityFrictionIterations *= 200
        world.maxVelocityIterations *= 200

        return () => {
            world.maxStabilizationIterations =
                originalMaxStabilizationIterations
            world.maxVelocityFrictionIterations =
                originalMaxVelocityFrictionIterations
            world.maxVelocityIterations = originalMaxVelocityIterations
        }
    }, [])

    return (
        <>
            <Vehicle position={[0, 3, 0]} />
            <Scene />
        </>
    )
}

const Controls = styled.div`
    position: absolute;
    bottom: 4em;
    left: 0;
    width: 100%;
    text-align: center;
    font-size: 2em;
    color: white;
    font-family: monospace;
`

export default () => {
    return (
        <>
            <h1>Rapier - Revolute Joints Vehicle</h1>
            <Canvas camera={{ fov: 60 }}>
                <Physics
                    gravity={[0, -9.81, 0]}
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                >
                    <App />
                    <Debug />
                </Physics>
            </Canvas>
            <Controls>use wasd to drive</Controls>
        </>
    )
}
