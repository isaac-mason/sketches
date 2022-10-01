import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import {
    BallCollider,
    CuboidCollider,
    CylinderCollider,
    Debug,
    Physics,
    RapierRigidBody,
    RigidBody,
    RigidBodyApi,
    RigidBodyApiRef,
    useRapier,
    useRevoluteJoint,
    Vector3Array,
} from '@react-three/rapier'
import { RigidBodyProps } from '@react-three/rapier/dist/declarations/src/RigidBody'
import React, {
    MutableRefObject,
    Ref,
    useEffect,
    useImperativeHandle,
} from 'react'
import { useMemo, useRef } from 'react'
import { Euler, MathUtils, Quaternion, Vector3 } from 'three'
import { DEG2RAD } from 'three/src/math/MathUtils'
import { Canvas } from '../Canvas'
import { useControls } from './use-controls'

// interesting - https://twitter.com/KenneyNL/status/1107783904784715788?ref_src=twsrc%5Etfw%7Ctwcamp%5Etweetembed%7Ctwterm%5E1107783904784715788%7Ctwgr%5Eb6167c2fe2dd2a357cdcb3e3ca6bee5f326a34d1%7Ctwcon%5Es1_&ref_url=https%3A%2F%2Fwww.reddit.com%2Fr%2Fgodot%2Fcomments%2Fla2jxa%2Fsimple_3d_car_physics_using_rigidbody_and%2F

// wip - copying - shttps://threlte.xyz/rapier/basic-vehicle-controller

const SPEED_LIMIT = 15

type AxleProps = {
    position: Vector3Array
    parentRigidBody: RigidBodyApiRef
    anchor: Vector3Array
    side: 'left' | 'right'
    steerable: boolean
}

type AxleRef = {
    wheel: WheelRef
    axleJoint: ReturnType<typeof useRevoluteJoint>
}

const Axle = React.forwardRef((props: AxleProps, ref: Ref<AxleRef | null>) => {
    const wheelRef = useRef<WheelRef>(null)

    const axleRigidBodyRef = useRef<RigidBodyApi>(null)

    const axleJoint = useRevoluteJoint(
        props.parentRigidBody,
        axleRigidBodyRef,
        [props.anchor, [0, 0, 0], [0, 1, 0]]
    )

    useImperativeHandle(ref, () => ({
        wheel: wheelRef.current!,
        axleJoint,
    }))

    return (
        <group>
            <RigidBody ref={axleRigidBodyRef}>
                <CuboidCollider mass={0.1} args={[0.03, 0.03, 0.03]} />
            </RigidBody>

            <Wheel
                ref={wheelRef}
                anchor={[props.side === 'left' ? 0.2 : -0.2, 0, 0]}
                position={[props.side === 'left' ? 0.2 : -0.2, 0, 0]}
                parentRigidBody={axleRigidBodyRef}
            />
        </group>
    )
})

type WheelProps = {
    position: Vector3Array
    parentRigidBody: RigidBodyApiRef
    anchor: Vector3Array
}

type WheelRef = {
    axleRigidBody: RigidBodyApi
    wheelJoint: ReturnType<typeof useRevoluteJoint>
}

const Wheel = React.forwardRef(
    (props: WheelProps, ref: Ref<WheelRef | null>) => {
        const axleRigidBody = useRef<RigidBodyApi>(null)

        const wheelJoint = useRevoluteJoint(
            props.parentRigidBody,
            axleRigidBody,
            [props.anchor, [0, 0, 0], [1, 0, 0]]
        )

        useImperativeHandle(ref, () => ({
            axleRigidBody: axleRigidBody.current!,
            wheelJoint,
        }))

        return (
            <RigidBody
                ref={axleRigidBody}
                canSleep={false}
                colliders={false}
                position={props.position}
                rotation-z={Math.PI / 2}
            >
                <mesh rotation-z={Math.PI / 2}>
                    <cylinderGeometry args={[0.3, 0.3, 0.3, 32]} />
                    <meshStandardMaterial color="#ccc" />
                </mesh>

                <CylinderCollider
                    mass={1}
                    friction={2}
                    rotation={[0, 0, Math.PI / 2]}
                    args={[0.12, 0.3]}
                />
            </RigidBody>
        )
    }
)

const Vehicle = (props: RigidBodyProps) => {
    const camera = useThree((state) => state.camera)
    const cameraClone = useMemo(() => camera.clone(), [camera])

    const topLeftAxleRef = useRef<AxleRef>(null)
    const topRightAxleRef = useRef<AxleRef>(null)
    const bottomLeftAxleRef = useRef<AxleRef>(null)
    const bottomRightAxleRef = useRef<AxleRef>(null)

    const axles = [
        topLeftAxleRef,
        topRightAxleRef,
        bottomLeftAxleRef,
        bottomRightAxleRef,
    ]

    const frontAxles = [topLeftAxleRef, topRightAxleRef]

    const backAxles = [bottomLeftAxleRef, bottomRightAxleRef]

    const steeringAngle = useRef(0)

    const chassisBodyRef = useRef<RigidBodyApi>(null!)

    const controls = useControls()

    useEffect(() => {}, [])

    useEffect(() => {
        axles.map((axle) => {
            const axleJoint = axle.current!!.axleJoint!

            const axleJointRaw = axleJoint.raw()!
            axleJointRaw.setContactsEnabled(false)

            const wheelJoint = axle.current!.wheel.wheelJoint
            const wheelJointRaw = wheelJoint.raw()!
            wheelJointRaw.setContactsEnabled(false)
        })

        // backAxles.map((axle) => {
        //     const axleJoint = axle.current!.axleJoint
        //     axleJoint.configureMotorPosition(0, 10000, 0)
        // })
    }, [])

    useFrame((_, delta) => {
        // get input
        let boost = 0
        let forward = 0
        let right = 0

        if (controls.current.boost) {
            boost += 300 * delta
        }

        if (controls.current.forward) {
            forward += 5000 * delta
        }
        if (controls.current.backward) {
            forward -= 5000 * delta
        }

        if (controls.current.left) {
            right -= 20
        }
        if (controls.current.right) {
            right += 20
        }

        // wheel steer
        steeringAngle.current = right
        frontAxles.map((axle) => {
            const axleJoint = axle.current!.axleJoint
            axleJoint.configureMotorPosition(
                steeringAngle.current * -1 * DEG2RAD,
                10000,
                0
            )
        })

        // wheel motor
        backAxles.map((axle) => {
            const wheelJoint = axle.current!.wheel.wheelJoint
            wheelJoint.configureMotorVelocity(forward, 10)
        })

        // boost
        if (boost) {
            chassisBodyRef.current.applyImpulse(
                new Vector3(0, 0, boost).applyQuaternion(
                    chassisBodyRef.current.rotation()
                )
            )
        }

        // down force
        // chassisBodyRef.current.addForce({ x: 0, y: -20 * delta, z: 0 })
    })

    useFrame(() => {
        const car = chassisBodyRef.current
        const cameraPositionOffset = new Vector3(0, 7, -7).applyQuaternion(
            car.rotation()
        )
        const idealCameraPosition = new Vector3()
            .copy(car.translation())
            .add(cameraPositionOffset)

        camera.position.lerp(idealCameraPosition, 0.05)
        cameraClone.position.copy(camera.position)
        cameraClone.lookAt(car.translation())
        camera.quaternion.slerp(cameraClone.quaternion, 0.3)
    })

    return (
        <>
            <RigidBody
                {...props}
                colliders={false}
                ref={chassisBodyRef}
                type="dynamic" //"fixed"
                canSleep={false}
            >
                <mesh>
                    <boxGeometry args={[1, 0.5, 2.5]} />
                    <meshStandardMaterial color="red" />
                </mesh>

                <CuboidCollider mass={4} args={[0.5, 0.25, 1.25]} />
            </RigidBody>

            {/* steerable front wheels */}
            <Axle
                ref={topLeftAxleRef}
                parentRigidBody={chassisBodyRef}
                side="left"
                position={[0.8, -0.4, 1.2]}
                anchor={[0.8, -0.4, 1.2]}
                steerable
            />
            <Axle
                ref={topRightAxleRef}
                parentRigidBody={chassisBodyRef}
                side="right"
                position={[-0.8, -0.4, 1.2]}
                anchor={[-0.8, -0.4, 1.2]}
                steerable
            />

            {/* fixed back wheels */}
            <Axle
                ref={bottomLeftAxleRef}
                parentRigidBody={chassisBodyRef}
                side="left"
                position={[0.8, -0.4, -1.2]}
                anchor={[0.8, -0.4, -1.2]}
                steerable={false}
            />
            <Axle
                ref={bottomRightAxleRef}
                parentRigidBody={chassisBodyRef}
                side="right"
                position={[-0.8, -0.4, -1.2]}
                anchor={[-0.8, -0.4, -1.2]}
                steerable={false}
            />
        </>
    )
}

const Scene = () => (
    <>
        {/* ramps */}
        {Array.from({ length: 3 }).map((_, idx) => (
            <RigidBody key={idx} type="fixed">
                <mesh rotation-x={-0.5} position={[0, -1, 10 + idx * 15]}>
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
    </>
)

const Light = () => (
    <>
        <ambientLight intensity={1} />
        <pointLight intensity={0.5} position={[-3, 3, 3]} />
    </>
)

const App = () => {
    return (
        <>
            <Light />
            <Vehicle /*position={[0, 10, 0]}*/ />
            <Scene />
        </>
    )
}

export default function () {
    return (
        <>
            <h1>Rapier - Arcade Car</h1>
            <Canvas camera={{ position: [3, 3, 3] }}>
                <Physics gravity={[0, -9.81, 0]}>
                    <App />
                    <Debug />
                </Physics>
                {/* <OrbitControls /> */}
            </Canvas>
        </>
    )
}
