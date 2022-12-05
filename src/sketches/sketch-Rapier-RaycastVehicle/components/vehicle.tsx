import { Box } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import {
    CuboidCollider,
    RigidBody,
    RigidBodyApi,
    RigidBodyProps,
    useRapier,
} from '@react-three/rapier'
import { useControls as useLeva } from 'leva'
import {
    forwardRef,
    RefObject,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react'
import { Group, Object3D, Vector3 } from 'three'
import {
    RapierRaycastVehicle,
    WheelOptions,
} from '../lib/rapier-raycast-vehicle'
import { Chassis } from '../models/chassis'
import { Wheel } from '../models/wheel'
import { LEVA_KEY } from '../util/leva-key'

const CHASSIS_CUBOID_HALF_EXTENTS = new Vector3(2.35, 0.55, 1)

export type RaycastVehicleWheel = {
    options: WheelOptions
    object: RefObject<Object3D>
}

export type VehicleProps = RigidBodyProps

export type VehicleRef = {
    chassisRigidBody: RefObject<RigidBodyApi>
    rapierRaycastVehicle: RefObject<RapierRaycastVehicle>
    wheels: RaycastVehicleWheel[]
}

export const Vehicle = forwardRef<VehicleRef, VehicleProps>(
    ({ children, ...groupProps }, ref) => {
        const rapier = useRapier()
        const scene = useThree((state) => state.scene)

        const vehicle = useRef<RapierRaycastVehicle>(null!)
        const chassisRigidBody = useRef<RigidBodyApi>(null!)

        const topLeftWheelObject = useRef<Group>(null!)
        const topRightWheelObject = useRef<Group>(null!)
        const bottomLeftWheelObject = useRef<Group>(null!)
        const bottomRightWheelObject = useRef<Group>(null!)

        const {
            indexRightAxis,
            indexForwardAxis,
            indexUpAxis,
            directionLocal: directionLocalArray,
            axleLocal: axleLocalArray,
            vehicleWidth,
            vehicleHeight,
            vehicleFront,
            vehicleBack,
            ...levaWheelOptions
        } = useLeva(`${LEVA_KEY}-wheel-options`, {
            radius: 0.38,

            indexRightAxis: 2,
            indexForwardAxis: 0,
            indexUpAxis: 1,

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

            vehicleWidth: 1.7,
            vehicleHeight: -0.3,
            vehicleFront: -1.35,
            vehicleBack: 1.3,
        })

        const directionLocal = useMemo(
            () => new Vector3(...directionLocalArray),
            [directionLocalArray]
        )
        const axleLocal = useMemo(
            () => new Vector3(...axleLocalArray),
            [axleLocalArray]
        )

        const commonWheelOptions = {
            ...levaWheelOptions,
            directionLocal,
            axleLocal,
        }

        const wheels: RaycastVehicleWheel[] = [
            {
                object: topLeftWheelObject,
                options: {
                    ...commonWheelOptions,
                    chassisConnectionPointLocal: new Vector3(
                        vehicleBack,
                        vehicleHeight,
                        vehicleWidth * 0.5
                    ),
                },
            },
            {
                object: topRightWheelObject,
                options: {
                    ...commonWheelOptions,
                    chassisConnectionPointLocal: new Vector3(
                        vehicleBack,
                        vehicleHeight,
                        vehicleWidth * -0.5
                    ),
                },
            },
            {
                object: bottomLeftWheelObject,
                options: {
                    ...commonWheelOptions,
                    chassisConnectionPointLocal: new Vector3(
                        vehicleFront,
                        vehicleHeight,
                        vehicleWidth * 0.5
                    ),
                },
            },
            {
                object: bottomRightWheelObject,
                options: {
                    ...commonWheelOptions,
                    chassisConnectionPointLocal: new Vector3(
                        vehicleFront,
                        vehicleHeight,
                        vehicleWidth * -0.5
                    ),
                },
            },
        ]

        useImperativeHandle(ref, () => ({
            chassisRigidBody: chassisRigidBody,
            rapierRaycastVehicle: vehicle,
            wheels,
        }))

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

                const raycastArrowHelper =
                    vehicle.current.wheels[i].debug.suspensionArrowHelper
                scene.add(raycastArrowHelper)
            }

            vehicle.current = vehicle.current

            return () => {
                for (let i = 0; i < wheels.length; i++) {
                    const raycastArrowHelper =
                        vehicle.current!.wheels[i].debug.suspensionArrowHelper
                    scene.remove(raycastArrowHelper)
                }
            }
        }, [
            chassisRigidBody,
            vehicle,
            indexRightAxis,
            indexForwardAxis,
            indexUpAxis,
            directionLocal,
            axleLocal,
            levaWheelOptions,
        ])

        const [leftHeadlightTarget] = useState(() => {
            const object = new Object3D()
            object.position.set(10, 0, -0.8);
            return object
        })
        const [rightHeadlightTarget] = useState(() => {
            const object = new Object3D()
            object.position.set(10, 0, 0.8);
            return object
        })

        return (
            <>
                <RigidBody
                    {...groupProps}
                    colliders={false}
                    ref={chassisRigidBody}
                    mass={150}
                >
                    <primitive object={leftHeadlightTarget} />
                    <spotLight
                        position={[
                            2.5,
                            0.4,
                            -0.8
                        ]}
                        target={leftHeadlightTarget}
                        angle={0.4}
                        distance={50}
                        castShadow
                        penumbra={1}
                    />

                    <primitive object={rightHeadlightTarget} />
                    <spotLight
                        position={[
                            2.5,
                            0.4,
                            0.8,
                        ]}
                        target={rightHeadlightTarget}
                        angle={0.4}
                        distance={50}
                        castShadow
                        penumbra={1}
                    />

                    <Chassis
                        position={[-0.2, -0.25, 0]}
                        rotation-y={Math.PI / 2}
                    />

                    <CuboidCollider
                        args={[
                            CHASSIS_CUBOID_HALF_EXTENTS.x,
                            CHASSIS_CUBOID_HALF_EXTENTS.y,
                            CHASSIS_CUBOID_HALF_EXTENTS.z,
                        ]}
                    />
                </RigidBody>

                <group ref={topLeftWheelObject}>
                    <Wheel
                        rotation={[0, Math.PI / 2, 0]}
                        side="left"
                        radius={commonWheelOptions.radius}
                    />
                </group>

                <group ref={topRightWheelObject}>
                    <Wheel
                        rotation={[0, Math.PI / 2, 0]}
                        side="right"
                        radius={commonWheelOptions.radius}
                    />
                </group>

                <group ref={bottomLeftWheelObject}>
                    <Wheel
                        rotation={[0, Math.PI / 2, 0]}
                        side="left"
                        radius={commonWheelOptions.radius}
                    />
                </group>

                <group ref={bottomRightWheelObject}>
                    <Wheel
                        rotation={[0, Math.PI / 2, 0]}
                        side="right"
                        radius={commonWheelOptions.radius}
                    />
                </group>
            </>
        )
    }
)
