import { useGLTF } from '@react-three/drei'
import { CuboidCollider, RapierRigidBody, RigidBody, RigidBodyProps, useRapier } from '@react-three/rapier'
import { useControls as useLeva } from 'leva'
import { forwardRef, Fragment, RefObject, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Color, Group, Mesh, MeshStandardMaterial, Object3D, SpotLightHelper, Vector3, Vector3Tuple } from 'three'
import { GLTF } from 'three-stdlib'
import chassisDracoUrl from '../assets/chassis-draco.glb?url'
import { LEVA_KEY } from '../constants'
import { RapierRaycastVehicle, WheelOptions } from '../lib/rapier-raycast-vehicle'

import wheelGlbUrl from '../assets/wheel-draco.glb?url'
import { Helper } from '@/common'

type WheelGLTF = GLTF & {
    nodes: {
        Mesh_14: Mesh
        Mesh_14_1: Mesh
    }
    materials: {
        'Material.002': MeshStandardMaterial
        'Material.009': MeshStandardMaterial
    }
}

interface ChassisGLTF extends GLTF {
    nodes: {
        Chassis_1: Mesh
        Chassis_2: Mesh
        Glass: Mesh
        BrakeLights: Mesh
        HeadLights: Mesh
        Cabin_Grilles: Mesh
        Undercarriage: Mesh
        TurnSignals: Mesh
        Chrome: Mesh
        Wheel_1: Mesh
        Wheel_2: Mesh
        License_1: Mesh
        License_2: Mesh
        Cube013: Mesh
        Cube013_1: Mesh
        Cube013_2: Mesh
        'pointer-left': Mesh
        'pointer-right': Mesh
    }
    materials: {
        BodyPaint: MeshStandardMaterial
        License: MeshStandardMaterial
        Chassis_2: MeshStandardMaterial
        Glass: MeshStandardMaterial
        BrakeLight: MeshStandardMaterial
        defaultMatClone: MeshStandardMaterial
        HeadLight: MeshStandardMaterial
        Black: MeshStandardMaterial
        Undercarriage: MeshStandardMaterial
        TurnSignal: MeshStandardMaterial
    }
}

type WheelProps = JSX.IntrinsicElements['group'] & {
    side: 'left' | 'right'
    radius: number
}

const Wheel = ({ side, radius, ...props }: WheelProps) => {
    const groupRef = useRef<Group>(null!)

    const { nodes, materials } = useGLTF(wheelGlbUrl) as WheelGLTF
    const scale = radius / 0.34

    return (
        <group dispose={null} {...props} ref={groupRef}>
            <group scale={scale}>
                <group scale={side === 'left' ? -1 : 1}>
                    <mesh castShadow geometry={nodes.Mesh_14.geometry} material={materials['Material.002']} />
                    <mesh castShadow geometry={nodes.Mesh_14_1.geometry} material={materials['Material.009']} />
                </group>
            </group>
        </group>
    )
}

const BRAKE_LIGHTS_ON_COLOR = new Color(1, 0.2, 0.2).multiplyScalar(1.5)
const BRAKE_LIGHTS_OFF_COLOR = new Color(0x333333)

type RaycastVehicleWheel = {
    options: WheelOptions
    object: RefObject<Object3D>
}

export type VehicleProps = RigidBodyProps

export type VehicleRef = {
    chassisRigidBody: RefObject<RapierRigidBody>
    rapierRaycastVehicle: RefObject<RapierRaycastVehicle>
    wheels: RaycastVehicleWheel[]
    setBraking: (braking: boolean) => void
}

export const Vehicle = forwardRef<VehicleRef, VehicleProps>(({ children, ...groupProps }, ref) => {
    const rapier = useRapier()

    const { nodes: n, materials: m } = useGLTF(chassisDracoUrl) as ChassisGLTF

    const vehicleRef = useRef<RapierRaycastVehicle>(null!)
    const chassisRigidBodyRef = useRef<RapierRigidBody>(null!)
    const brakeLightsRef = useRef<Mesh>(null!)

    const topLeftWheelObject = useRef<Group>(null!)
    const topRightWheelObject = useRef<Group>(null!)
    const bottomLeftWheelObject = useRef<Group>(null!)
    const bottomRightWheelObject = useRef<Group>(null!)

    const { headlightsSpotLightHelper } = useLeva(`${LEVA_KEY}-headlights`, {
        headlightsSpotLightHelper: false,
    })

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

    const directionLocal = useMemo(() => new Vector3(...directionLocalArray), [directionLocalArray])
    const axleLocal = useMemo(() => new Vector3(...axleLocalArray), [axleLocalArray])

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
                chassisConnectionPointLocal: new Vector3(vehicleBack, vehicleHeight, vehicleWidth * 0.5),
            },
        },
        {
            object: topRightWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal: new Vector3(vehicleBack, vehicleHeight, vehicleWidth * -0.5),
            },
        },
        {
            object: bottomLeftWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal: new Vector3(vehicleFront, vehicleHeight, vehicleWidth * 0.5),
            },
        },
        {
            object: bottomRightWheelObject,
            options: {
                ...commonWheelOptions,
                chassisConnectionPointLocal: new Vector3(vehicleFront, vehicleHeight, vehicleWidth * -0.5),
            },
        },
    ]

    useImperativeHandle(ref, () => ({
        chassisRigidBody: chassisRigidBodyRef,
        rapierRaycastVehicle: vehicleRef,
        setBraking: (braking: boolean) => {
            const material = brakeLightsRef.current.material as MeshStandardMaterial
            material.color = braking ? BRAKE_LIGHTS_ON_COLOR : BRAKE_LIGHTS_OFF_COLOR
        },
        wheels,
    }))

    useEffect(() => {
        vehicleRef.current = new RapierRaycastVehicle({
            world: rapier.world,
            chassisRigidBody: chassisRigidBodyRef.current,
            indexRightAxis,
            indexForwardAxis,
            indexUpAxis,
        })

        for (let i = 0; i < wheels.length; i++) {
            const options = wheels[i].options
            vehicleRef.current.addWheel(options)
        }

        vehicleRef.current = vehicleRef.current
    }, [
        chassisRigidBodyRef,
        vehicleRef,
        indexRightAxis,
        indexForwardAxis,
        indexUpAxis,
        directionLocal,
        axleLocal,
        levaWheelOptions,
    ])

    const [leftHeadlightTarget] = useState(() => {
        const object = new Object3D()
        object.position.set(10, -0.5, -0.7)
        return object
    })

    const [rightHeadlightTarget] = useState(() => {
        const object = new Object3D()
        object.position.set(10, -0.5, 0.7)
        return object
    })

    return (
        <>
            <RigidBody {...groupProps} colliders={false} ref={chassisRigidBodyRef} mass={150}>
                {/* Collider */}
                {/* todo: change to convex hull */}
                <CuboidCollider args={[2.35, 0.55, 1]} />

                {/* Headlights */}
                {[
                    {
                        position: [2.4, -0.2, -0.7] as Vector3Tuple,
                        target: leftHeadlightTarget,
                    },
                    {
                        position: [2.4, -0.2, 0.7] as Vector3Tuple,
                        target: rightHeadlightTarget,
                    },
                ].map(({ position, target }, idx) => (
                    <Fragment key={idx}>
                        <primitive object={target} />
                        <spotLight
                            position={position}
                            target={target}
                            angle={0.8}
                            decay={1}
                            distance={20}
                            castShadow
                            penumbra={1}
                            intensity={20}
                        >
                            {headlightsSpotLightHelper && <Helper type={SpotLightHelper} />}
                        </spotLight>
                    </Fragment>
                ))}

                {/* Chassis */}
                <group position={[-0.2, -0.25, 0]} rotation-y={Math.PI / 2} dispose={null}>
                    <group>
                        <mesh
                            castShadow
                            receiveShadow
                            geometry={n.Chassis_1.geometry}
                            material={m.BodyPaint}
                            material-color="#f0c050"
                        />
                        <mesh
                            castShadow
                            geometry={n.Chassis_2.geometry}
                            material={n.Chassis_2.material}
                            material-color="#353535"
                        />
                        <mesh castShadow geometry={n.Glass.geometry} material={m.Glass} material-transparent />
                        <mesh
                            ref={brakeLightsRef}
                            geometry={n.BrakeLights.geometry}
                            material={m.BrakeLight}
                            material-transparent
                            material-toneMapped={true}
                        />
                        <mesh geometry={n.HeadLights.geometry} material={m.HeadLight} />
                        <mesh geometry={n.Cabin_Grilles.geometry} material={m.Black} />
                        <mesh geometry={n.Undercarriage.geometry} material={m.Undercarriage} />
                        <mesh geometry={n.TurnSignals.geometry} material={m.TurnSignal} />
                        <mesh geometry={n.Chrome.geometry} material={n.Chrome.material} />
                        <group position={[0.37, 0.25, 0.46]}>
                            <mesh geometry={n.Wheel_1.geometry} material={n.Wheel_1.material} />
                            <mesh geometry={n.Wheel_2.geometry} material={n.Wheel_2.material} />
                        </group>
                        <group position={[0, 0, 0]}>
                            <mesh geometry={n.License_1.geometry} material={m.License} />
                            <mesh geometry={n.License_2.geometry} material={n.License_2.material} />
                        </group>
                        <group position={[0.2245, 0.3045, 0.6806]} scale={[0.0594, 0.0594, 0.0594]}>
                            <mesh geometry={n.Cube013.geometry} material={n.Cube013.material} />
                            <mesh geometry={n.Cube013_1.geometry} material={n.Cube013_1.material} />
                            <mesh geometry={n.Cube013_2.geometry} material={n.Cube013_2.material} />
                        </group>
                        <mesh
                            geometry={n['pointer-left'].geometry}
                            material={n['pointer-left'].material}
                            position={[0.5107, 0.3045, 0.6536]}
                            rotation={[Math.PI / 2, -1.1954, 0]}
                            scale={[0.0209, 0.0209, 0.0209]}
                        />
                        <mesh
                            geometry={n['pointer-right'].geometry}
                            material={n['pointer-right'].material}
                            position={[0.2245, 0.3045, 0.6536]}
                            rotation={[-Math.PI / 2, -0.9187, Math.PI]}
                            scale={[0.0209, 0.0209, 0.0209]}
                        />
                    </group>
                    {children}
                </group>
            </RigidBody>

            {/* Wheels */}
            <group ref={topLeftWheelObject}>
                <Wheel rotation={[0, Math.PI / 2, 0]} side="left" radius={commonWheelOptions.radius} />
            </group>
            <group ref={topRightWheelObject}>
                <Wheel rotation={[0, Math.PI / 2, 0]} side="right" radius={commonWheelOptions.radius} />
            </group>
            <group ref={bottomLeftWheelObject}>
                <Wheel rotation={[0, Math.PI / 2, 0]} side="left" radius={commonWheelOptions.radius} />
            </group>
            <group ref={bottomRightWheelObject}>
                <Wheel rotation={[0, Math.PI / 2, 0]} side="right" radius={commonWheelOptions.radius} />
            </group>
        </>
    )
})
