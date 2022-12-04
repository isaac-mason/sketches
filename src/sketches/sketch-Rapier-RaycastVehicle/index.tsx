import { useFrame, useThree } from '@react-three/fiber'
import {
    CuboidCollider,
    Debug,
    Physics,
    RigidBody,
    RigidBodyProps,
    useRapier,
} from '@react-three/rapier'
import { RigidBodyApi } from '@react-three/rapier/dist/declarations/src/types'
import { useControls as useLeva } from 'leva'
import { RefObject, useEffect, useMemo, useRef } from 'react'
import styled from 'styled-components'
import { Group, Object3D, Vector3 } from 'three'
import { Canvas } from '../Canvas'
import { RapierRaycastVehicle, WheelOptions } from './rapier-raycast-vehicle'
import { useControls } from './use-controls'

const LEVA_KEY = 'rapier-raycast-vehicle'

const Controls = styled.div`
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

const CHASSIS_CUBOID_HALF_EXTENTS = new Vector3(2, 0.5, 1)
const RAPIER_UPDATE_PRIORITY = -50
const BEFORE_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY + 1
const AFTER_RAPIER_UPDATE = RAPIER_UPDATE_PRIORITY - 1

type RaycastVehicleProps = RigidBodyProps & {
    indexRightAxis?: number
    indexForwardAxis?: number
    indexUpAxis?: number
}

const RaycastVehicle = ({
    children,
    indexRightAxis = 2,
    indexForwardAxis = 0,
    indexUpAxis = 1,
    ...groupProps
}: RaycastVehicleProps) => {
    const rapier = useRapier()
    const scene = useThree((state) => state.scene)

    const camera = useThree((state) => state.camera)
    const currentCameraPosition = useRef(new Vector3(15, 15, 0))
    const currentCameraLookAt = useRef(new Vector3())

    const controls = useControls()

    const vehicle = useRef<RapierRaycastVehicle | null>(null)

    const topLeftWheelObject = useRef<Group>(null!)
    const topRightWheelObject = useRef<Group>(null!)
    const bottomLeftWheelObject = useRef<Group>(null!)
    const bottomRightWheelObject = useRef<Group>(null!)

    const chassisRigidBody = useRef<RigidBodyApi>(null!)

    const {
        maxForce,
        maxSteer,
        maxBrake,
        directionLocal: directionLocalArray,
        axleLocal: axleLocalArray,
        chassisConnectionPointLocalTopLeft:
            chassisConnectionPointLocalTopLeftArray,
        chassisConnectionPointLocalTopRight:
            chassisConnectionPointLocalTopRightArray,
        chassisConnectionPointLocalBottomLeft:
            chassisConnectionPointLocalBottomLeftArray,
        chassisConnectionPointLocalBottomRight:
            chassisConnectionPointLocalBottomRightArray,
        ...levaWheelOptions
    } = useLeva(`${LEVA_KEY}-wheel-options`, {
        radius: 0.5,

        directionLocal: [0, -1, 0],
        axleLocal: [0, 0, 1],

        suspensionStiffness: 30,
        suspensionRestLength: 0.3,
        maxSuspensionForce: 100000,
        maxSuspensionTravel: 0.3,

        sideFrictionStiffness: 1,
        frictionSlip: 1.4,
        dampingRelaxation: 2.3,
        dampingCompression: 4.4,

        rollInfluence: 0.01,

        customSlidingRotationalSpeed: -30,
        useCustomSlidingRotationalSpeed: true,

        forwardAcceleration: 1,
        sideAcceleration: 1,

        chassisConnectionPointLocalTopLeft: [-1, 0, -1],
        chassisConnectionPointLocalTopRight: [-1, 0, 1],
        chassisConnectionPointLocalBottomLeft: [1, 0, -1],
        chassisConnectionPointLocalBottomRight: [1, 0, 1],

        maxForce: 500,
        maxSteer: 0.5,
        maxBrake: 10,
    })

    const directionLocal = useMemo(
        () => new Vector3(...directionLocalArray),
        [directionLocalArray]
    )
    const axleLocal = useMemo(
        () => new Vector3(...axleLocalArray),
        [axleLocalArray]
    )

    const topLeftChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalTopLeftArray),
        [chassisConnectionPointLocalTopLeftArray]
    )
    const topRightChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalTopRightArray),
        [chassisConnectionPointLocalTopRightArray]
    )
    const bottomLeftChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalBottomLeftArray),
        [chassisConnectionPointLocalBottomLeftArray]
    )
    const bottomRightChassisConnectionPointLocal = useMemo(
        () => new Vector3(...chassisConnectionPointLocalBottomRightArray),
        [chassisConnectionPointLocalBottomRightArray]
    )

    const commonWheelOptions = {
        ...levaWheelOptions,
        directionLocal,
        axleLocal,
    }

    const wheels: {
        options: WheelOptions
        object: RefObject<Object3D>
    }[] = [
        {
            object: topLeftWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal: topLeftChassisConnectionPointLocal,
            },
        },
        {
            object: topRightWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal:
                    topRightChassisConnectionPointLocal,
            },
        },
        {
            object: bottomLeftWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal:
                    bottomLeftChassisConnectionPointLocal,
            },
        },
        {
            object: bottomRightWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal:
                    bottomRightChassisConnectionPointLocal,
            },
        },
    ]

    useEffect(() => {
        vehicle.current = new RapierRaycastVehicle({
            world: rapier.world.raw(),
            chassisRigidBody: chassisRigidBody.current.raw(),
            chassisHalfExtents: CHASSIS_CUBOID_HALF_EXTENTS,
            indexRightAxis,
            indexForwardAxis,
            indexUpAxis,
        })

        for (let i = 0; i < wheels.length; i++) {
            const options = wheels[i].options
            vehicle.current.addWheel(options)

            const raycastArrowHelper = vehicle.current.wheels[i].debug.raycastArrowHelper
            scene.add(raycastArrowHelper)
        }

        return () => {
            for (let i = 0; i < wheels.length; i++) {
                const raycastArrowHelper = vehicle.current!.wheels[i].debug.raycastArrowHelper
                scene.remove(raycastArrowHelper)
            }
        }
    }, [
        indexRightAxis,
        indexForwardAxis,
        indexUpAxis,
        maxForce,
        maxSteer,
        maxBrake,
        directionLocal,
        axleLocal,
        levaWheelOptions,
    ])

    useFrame((_, delta) => {
        if (!vehicle.current) return

        // update wheels from controls
        let engineForce = 0
        let steering = 0

        if (controls.current.forward) {
            engineForce -= maxForce
        }
        if (controls.current.backward) {
            engineForce += maxForce
        }

        if (controls.current.left) {
            steering += maxSteer
        }
        if (controls.current.right) {
            steering -= maxSteer
        }

        const brakeForce = controls.current.brake ? maxBrake : 0

        for (let i = 0; i < vehicle.current.wheels.length; i++) {
            vehicle.current.setBrakeValue(brakeForce, i)
        }

        // steer front wheels
        vehicle.current.setSteeringValue(steering, 0)
        vehicle.current.setSteeringValue(steering, 1)

        // apply engine force to back wheels
        vehicle.current.applyEngineForce(engineForce, 2)
        vehicle.current.applyEngineForce(engineForce, 3)

        // update the vehicle
        const clampedDelta = Math.min(delta, 1 / 60)
        vehicle.current.update(clampedDelta)

        // update the wheels
        for (let i = 0; i < wheels.length; i++) {
            const wheelObject = wheels[i].object.current
            if (!wheelObject) continue

            const wheelState = vehicle.current.wheels[i].state
            wheelObject.position.copy(wheelState.worldTransform.position)
            wheelObject.quaternion.copy(wheelState.worldTransform.quaternion)
        }
    }, BEFORE_RAPIER_UPDATE)

    useFrame((_, delta) => {
        const chassis = chassisRigidBody.current
        if (!chassis) {
            return
        }

        const t = 1.0 - Math.pow(0.01, delta)

        const idealOffset = new Vector3(10, 5, 0)
        idealOffset.applyQuaternion(chassis.rotation())
        idealOffset.add(chassis.translation())
        if (idealOffset.y < 0) {
            idealOffset.y = 0
        }

        const idealLookAt = new Vector3(0, 1, 0)
        idealLookAt.applyQuaternion(chassis.rotation())
        idealLookAt.add(chassis.translation())

        currentCameraPosition.current.lerp(idealOffset, t)
        currentCameraLookAt.current.lerp(idealLookAt, t)

        camera.position.copy(currentCameraPosition.current)
        camera.lookAt(currentCameraLookAt.current)
    }, AFTER_RAPIER_UPDATE)

    return (
        <>
            <RigidBody
                {...groupProps}
                colliders={false}
                ref={chassisRigidBody}
                mass={150}
            >
                <mesh>
                    <boxGeometry args={[4, 1, 2]} />
                    <meshStandardMaterial color="#888" />
                </mesh>

                <CuboidCollider
                    args={[
                        CHASSIS_CUBOID_HALF_EXTENTS.x,
                        CHASSIS_CUBOID_HALF_EXTENTS.y,
                        CHASSIS_CUBOID_HALF_EXTENTS.z,
                    ]}
                />
            </RigidBody>

            <group ref={topLeftWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            <group ref={topRightWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            <group ref={bottomLeftWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>

            <group ref={bottomRightWheelObject}>
                <mesh rotation-x={Math.PI / 2}>
                    <cylinderGeometry args={[0.5, 0.5, 0.3, 16]} />
                    <meshStandardMaterial color="#444" wireframe />
                </mesh>
            </group>
        </>
    )
}

export default () => {
    return (
        <>
            <h1>Rapier - Raycast Vehicle</h1>
            <Canvas camera={{ fov: 60, position: [0, 30, -20] }}>
                <Physics
                    gravity={[0, -9.81, 0]}
                    updatePriority={RAPIER_UPDATE_PRIORITY}
                    timeStep="vary"
                >
                    {/* raycast vehicle */}
                    <RaycastVehicle
                        position={[0, 3, 0]}
                        rotation={[0, Math.PI / 2, 0]}
                    />

                    {/* boxes */}
                    {Array.from({ length: 6 }).map((_, idx) => (
                        <RigidBody key={idx} colliders="cuboid" mass={10}>
                            <mesh position={[0, 2 + idx * 4.1, 25]}>
                                <boxGeometry args={[2, 1, 2]} />
                                <meshNormalMaterial />
                            </mesh>
                        </RigidBody>
                    ))}

                    {/* ramp */}
                    <RigidBody type="fixed">
                        <mesh rotation-x={-0.3} position={[0, -1, 15]}>
                            <boxGeometry args={[10, 1, 10]} />
                            <meshStandardMaterial color="#888" />
                        </mesh>
                    </RigidBody>

                    {/* ground */}
                    <RigidBody type="fixed" position-y={-5} colliders="cuboid">
                        <mesh>
                            <boxGeometry args={[300, 10, 300]} />
                            <meshStandardMaterial color="#ccc" />
                        </mesh>
                    </RigidBody>
                    <gridHelper args={[150, 15]} position-y={0.01} />

                    {/* lights */}
                    <ambientLight intensity={1} />
                    <pointLight intensity={0.5} position={[0, 5, 5]} />

                    {/* physics debug */}
                    <Debug />
                </Physics>
            </Canvas>
            <Controls>use wasd to drive</Controls>
        </>
    )
}
