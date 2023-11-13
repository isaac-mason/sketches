import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { System, World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import Jolt from 'jolt-physics'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import { SpotLightHelper, Vector3Tuple } from 'three'
import { Canvas, Helper, useInterval } from '../../../common'

type EntityType = {
    body?: Jolt.Body
    object3D?: THREE.Object3D
    teleporting?: boolean
}

const jolt = await Jolt()

class PhysicsSystem extends System<EntityType> {
    settings: Jolt.JoltSettings
    joltInterface: Jolt.JoltInterface
    physicsSystem: Jolt.PhysicsSystem
    bodyInterface: Jolt.BodyInterface

    bodies = this.query((e) => e.has('body', 'object3D'))

    constructor(world: World) {
        super(world)

        this.settings = new jolt.JoltSettings()
        this.joltInterface = new jolt.JoltInterface(this.settings)
        this.physicsSystem = this.joltInterface.GetPhysicsSystem()
        this.bodyInterface = this.physicsSystem.GetBodyInterface()

        this.physicsSystem.SetGravity(new jolt.Vec3(0, -10, 0))
    }

    onInit(): void {
        this.bodies.onEntityAdded.add(({ body }) => {
            this.bodyInterface.AddBody(body.GetID(), jolt.Activate)
        })

        this.bodies.onEntityRemoved.add(({ body }) => {
            if (body) {
                this.bodyInterface.RemoveBody(body.GetID())
            }
        })
    }

    onUpdate(delta: number): void {
        // Don't go below 30 Hz to prevent spiral of death
        const deltaTime = Math.min(delta, 1.0 / 30.0)

        // When running below 55 Hz, do 2 steps instead of 1
        const numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1

        // Step the physics world
        this.joltInterface.Step(deltaTime, numSteps)

        // Update body transforms
        for (const { body, object3D } of this.bodies) {
            let p = body.GetPosition()
            let q = body.GetRotation()
            object3D.position.set(p.GetX(), p.GetY(), p.GetZ())
            object3D.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW())
        }
    }
}

const world = new World<EntityType>({
    components: ['body', 'object3D', 'teleporting'],
})

world.registerSystem(PhysicsSystem)

world.init()

const { Entity, Component } = createReactAPI(world)

const usePhysics = () => {
    return useMemo(() => world.getSystem(PhysicsSystem), [])!
}

const Ground = () => {
    const { bodyInterface } = usePhysics()

    const body = useMemo(() => {
        const shape = new jolt.BoxShape(new jolt.Vec3(100, 1, 100))

        const creationSettings = new jolt.BodyCreationSettings(
            shape,
            new jolt.Vec3(0, 0, 0),
            new jolt.Quat(0, 0, 0, 1),
            jolt.Static,
            jolt.NON_MOVING,
        )
        creationSettings.mRestitution = 0.5
        creationSettings.mFriction = 1

        return bodyInterface.CreateBody(creationSettings)
    }, [])

    return (
        <Entity body={body}>
            <Component name="object3D">
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[200, 2, 200]} />
                </mesh>
            </Component>
        </Entity>
    )
}

type BoxProps = {
    args: [number, number, number]
    position: [number, number, number]
    color?: string
}

const Box = ({ args, position, color }: BoxProps) => {
    const { bodyInterface } = usePhysics()

    const body = useMemo(() => {
        const shape = new jolt.BoxShape(new jolt.Vec3(...args))

        const creationSettings = new jolt.BodyCreationSettings(
            shape,
            new jolt.Vec3(...position),
            new jolt.Quat(0, 0, 0, 1),
            jolt.Dynamic,
            jolt.MOVING,
        )
        creationSettings.mRestitution = 0.5

        return bodyInterface.CreateBody(creationSettings)
    }, [])

    const boxGeometryArgs = useMemo(() => args.map((v) => v * 2) as Vector3Tuple, [args])

    return (
        <Entity body={body} teleporting>
            <Component name="object3D">
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color={color} />
                    <boxGeometry args={boxGeometryArgs} />
                </mesh>
            </Component>
        </Entity>
    )
}

const COLORS = ['orange', 'white', 'pink', 'skyblue']

const App = () => {
    const { bodyInterface } = usePhysics()

    useFrame((_, delta) => {
        world.step(delta)
    })

    const bodiesToTeleport = world.query((e) => e.has('body').and.is('teleporting'))
    const nextToTeleport = useRef(0)

    useInterval(() => {
        const index = nextToTeleport.current % bodiesToTeleport.entities.length

        const body = bodiesToTeleport.entities[index].body
        const bodyId = body.GetID()

        const x = (0.5 - Math.random()) * 10
        const y = 40
        const z = (0.5 - Math.random()) * 10

        bodyInterface.SetPosition(bodyId, new jolt.Vec3(x, y, z), jolt.Activate)
        body.SetLinearVelocity(new jolt.Vec3(0, 0, 0))

        nextToTeleport.current++
    }, 30)

    return (
        <>
            {Array.from({ length: 500 }).map((_, idx) => (
                <Box key={idx} args={[1, 1, 1]} position={[0, -100 - idx, 0]} color={COLORS[idx % COLORS.length]} />
            ))}

            <Ground />
        </>
    )
}

export default () => {
    const { spotLightHelper } = useControls('jolt-physics-cube-heap', {
        spotLightHelper: false,
    })

    return (
        <>
            <Canvas shadows camera={{ position: [-10, 30, 40] }}>
                <App />

                <spotLight
                    position={[50, 50, 50]}
                    angle={0.3}
                    intensity={100}
                    distance={1000}
                    decay={1}
                    penumbra={0.5}
                    castShadow
                >
                    {spotLightHelper && <Helper type={SpotLightHelper} />}
                </spotLight>

                <Environment files={cityEnvironment} />

                <OrbitControls target={[0, 10, 0]} />
            </Canvas>
        </>
    )
}
