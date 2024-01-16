import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { Executor } from 'arancini/systems'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import { SpotLightHelper, Vector3Tuple } from 'three'
import { Canvas, Helper, useInterval } from '../../../common'
import { JoltEntity, PhysicsSystem, createBodyUtils, jolt, joltComponents } from '../jolt-common'

type EntityType = JoltEntity & {
    teleporting?: boolean
}

const world = new World<EntityType>({
    components: [...joltComponents, 'teleporting'],
})

world.create({ physicsConfig: { gravity: [0, -9.81, 0] } })

const executor = new Executor(world)
executor.add(PhysicsSystem)
executor.init()

const { bodyInterface } = executor.get(PhysicsSystem)!

const { createBoxBody } = createBodyUtils(bodyInterface)

const { Entity, Component } = createReactAPI(world)

type GroundProps = {
    args: Vector3Tuple
    position: Vector3Tuple
}

const Ground = ({ args, position }: GroundProps) => {
    const body = useMemo(
        () =>
            createBoxBody({
                args,
                position,
                motionType: 'static',
                layer: 'nonMoving',
                restitution: 0.5,
                friction: 1,
            }),
        [],
    )

    return (
        <Entity body={body}>
            <Component name="three">
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={args.map((v) => v * 2) as Vector3Tuple} />
                </mesh>
            </Component>
        </Entity>
    )
}

type FallingBoxProps = {
    args: Vector3Tuple
    position: Vector3Tuple
    color?: string
}

const FallingBox = ({ args, position, color }: FallingBoxProps) => {
    const body = useMemo(
        () =>
            createBoxBody({
                args,
                position,
                motionType: 'dynamic',
                layer: 'moving',
                restitution: 0.5,
            }),
        [],
    )

    return (
        <Entity body={body} teleporting>
            <Component name="three">
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color={color} />
                    <boxGeometry args={args.map((v) => v * 2) as Vector3Tuple} />
                </mesh>
            </Component>
        </Entity>
    )
}

const COLORS = ['orange', 'white', 'pink', 'skyblue']

const Scene = () => {
    const { spotLightHelper } = useControls('jolt-physics-cube-heap', {
        spotLightHelper: false,
    })

    useFrame((_, delta) => {
        executor.update(delta)
    })

    const bodiesToTeleport = world.query((e) => e.has('body').and.is('teleporting'))
    const nextToTeleport = useRef(0)

    useInterval(() => {
        if (bodiesToTeleport.entities.length <= 0) return

        const index = nextToTeleport.current % bodiesToTeleport.entities.length

        const body = bodiesToTeleport.entities[index].body
        const bodyId = body.GetID()

        const x = (0.5 - Math.random()) * 10
        const y = 40
        const z = (0.5 - Math.random()) * 10

        bodyInterface.SetPosition(bodyId, new jolt.Vec3(x, y, z), jolt.EActivation_Activate)
        body.SetLinearVelocity(new jolt.Vec3(0, 0, 0))

        nextToTeleport.current++
    }, 30)

    return (
        <>
            {Array.from({ length: 500 }).map((_, idx) => (
                <FallingBox key={idx} args={[1, 1, 1]} position={[0, -100 - idx * 2, 0]} color={COLORS[idx % COLORS.length]} />
            ))}

            <Ground args={[200, 2, 200]} position={[0, 0, 0]} />

            <spotLight position={[50, 50, 50]} angle={0.3} intensity={100} distance={1000} decay={1} penumbra={0.5} castShadow>
                {spotLightHelper && <Helper type={SpotLightHelper} />}
            </spotLight>

            <Environment files={cityEnvironment} />
        </>
    )
}

export default () => {
    return (
        <>
            <Canvas shadows camera={{ position: [-10, 30, 40] }}>
                <Scene />

                <OrbitControls target={[0, 10, 0]} />
            </Canvas>
        </>
    )
}
