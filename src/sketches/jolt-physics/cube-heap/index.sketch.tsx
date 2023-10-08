import cityEnvironment from '@pmndrs/assets/hdri/city.exr'
import { Environment, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, Entity, System, World } from 'arancini'
import { createECS } from 'arancini/react'
import Jolt from 'jolt-physics'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import { SpotLightHelper, Vector3Tuple } from 'three'
import { Canvas, Helper, useInterval } from '../../../common'

const jolt = await Jolt()

class PhysicsBodyComponent extends Component {
    body!: Jolt.Body

    construct(body: Jolt.Body) {
        this.body = body
    }
}

const Object3DComponent = Component.object<THREE.Object3D>('Object3D')

class PhysicsSystem extends System {
    settings: Jolt.JoltSettings
    joltInterface: Jolt.JoltInterface
    physicsSystem: Jolt.PhysicsSystem
    bodyInterface: Jolt.BodyInterface

    bodies = this.query([PhysicsBodyComponent, Object3DComponent])

    entityToBody = new Map<Entity, Jolt.Body>()

    constructor(world: World) {
        super(world)

        this.settings = new jolt.JoltSettings()
        this.joltInterface = new jolt.JoltInterface(this.settings)
        this.physicsSystem = this.joltInterface.GetPhysicsSystem()
        this.bodyInterface = this.physicsSystem.GetBodyInterface()

        this.physicsSystem.SetGravity(new jolt.Vec3(0, -10, 0))
    }

    onInit(): void {
        this.bodies.onEntityAdded.add((entity) => {
            const body = entity.get(PhysicsBodyComponent).body

            this.bodyInterface.AddBody(body.GetID(), jolt.Activate)
            this.entityToBody.set(entity, body)
        })

        this.bodies.onEntityRemoved.add((entity) => {
            const body = this.entityToBody.get(entity)

            if (body) {
                this.bodyInterface.RemoveBody(body.GetID())
                this.entityToBody.delete(entity)
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
        for (const entity of this.bodies) {
            const body = entity.get(PhysicsBodyComponent).body
            const three = entity.get(Object3DComponent)

            let p = body.GetPosition()
            let q = body.GetRotation()
            three.position.set(p.GetX(), p.GetY(), p.GetZ())
            three.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW())
        }
    }
}

const TeleportTagComponent = Component.tag('Teleport')

const world = new World()

world.registerComponent(PhysicsBodyComponent)
world.registerComponent(Object3DComponent)
world.registerComponent(TeleportTagComponent)

world.registerSystem(PhysicsSystem)

world.init()

const ecs = createECS(world)

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
        <ecs.Entity>
            <ecs.Component type={Object3DComponent}>
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color="#333" />
                    <boxGeometry args={[200, 2, 200]} />
                </mesh>
            </ecs.Component>
            <ecs.Component type={PhysicsBodyComponent} args={[body]} />
        </ecs.Entity>
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
        <ecs.Entity>
            <ecs.Component type={Object3DComponent}>
                <mesh receiveShadow castShadow>
                    <meshStandardMaterial color={color} />
                    <boxGeometry args={boxGeometryArgs} />
                </mesh>
            </ecs.Component>
            <ecs.Component type={PhysicsBodyComponent} args={[body]} />
            <ecs.Component type={TeleportTagComponent} />
        </ecs.Entity>
    )
}

const COLORS = ['orange', 'white', 'pink', 'skyblue']

const App = () => {
    const { bodyInterface } = usePhysics()

    useFrame((_, delta) => {
        world.update(delta)
    })

    const bodiesToTeleport = world.query([TeleportTagComponent, PhysicsBodyComponent])
    const nextToTeleport = useRef(0)

    useInterval(() => {
        const index = nextToTeleport.current % bodiesToTeleport.entities.length

        const body = bodiesToTeleport.entities[index].get(PhysicsBodyComponent).body
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
