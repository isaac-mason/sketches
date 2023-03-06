import { createECS } from '@arancini/react'
import {
    Bounds,
    MarchingCube,
    MarchingCubes,
    OrbitControls,
} from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Component, System, World as ECSWorld } from 'arancini'
import { Body, Box, Circle, ContactMaterial, Material, World } from 'p2-es'
import { Canvas } from '../Canvas'

const defaultMaterial = new Material()

const contactMaterial = new ContactMaterial(defaultMaterial, defaultMaterial, {
    restitution: 0.4,
    friction: 0,
})

const containerParts: {
    width: number
    height: number
    position: [number, number]
}[] = [
    { width: 1.8, height: 0.15, position: [0, -0.75] },
    { width: 0.15, height: 1.8, position: [0.75, 0] },
    { width: 0.15, height: 1.8, position: [-0.75, 0] },
    { width: 1.8, height: 0.15, position: [0, 0.75] },
]

const gooColors = [0xff0000, 0x00ff00, 0x0000ff]

class RotateTagComponent extends Component {}

class ThreeComponent extends Component {
    object!: THREE.Object3D

    construct(object: THREE.Object3D) {
        this.object = object
    }
}

class PhysicsBodyComponent extends Component {
    body!: Body

    construct(body: () => Body) {
        this.body = body()
    }
}

class RotateSystem extends System {
    rotate = this.query([RotateTagComponent, PhysicsBodyComponent])

    onUpdate(_delta: number, time: number): void {
        for (const entity of this.rotate.entities) {
            const { body } = entity.get(PhysicsBodyComponent)

            body.angle = time * -0.5
        }
    }
}

class PhysicsSystem extends System {
    physicsWorld = new World({ gravity: [0, -5] })

    physicsTimeStep = 1 / 60

    physicsMaxSubSteps = 10

    physicsBodies = new Map<string, Body>()

    physicsBodyQuery = this.query([PhysicsBodyComponent, ThreeComponent])

    onInit(): void {
        this.physicsWorld.addContactMaterial(contactMaterial)

        this.physicsBodyQuery.onEntityAdded.add((entity) => {
            const body = entity.get(PhysicsBodyComponent).body
            this.physicsWorld.addBody(body)
            this.physicsBodies.set(entity.id, body)
        })

        this.physicsBodyQuery.onEntityRemoved.add((entity) => {
            const body = this.physicsBodies.get(entity.id)
            this.physicsBodies.delete(entity.id)

            if (body) {
                this.physicsWorld.removeBody(body)
            }
        })
    }

    onUpdate(delta: number): void {
        this.physicsWorld.step(
            this.physicsTimeStep,
            delta,
            this.physicsMaxSubSteps
        )

        for (const entity of this.physicsBodyQuery.entities) {
            const body = entity.get(PhysicsBodyComponent).body
            const three = entity.get(ThreeComponent).object

            three.position.set(
                body.interpolatedPosition[0],
                body.interpolatedPosition[1],
                0
            )

            three.rotation.set(0, 0, body.angle)
        }
    }
}

const world = new ECSWorld()

world.registerComponent(ThreeComponent)
world.registerComponent(PhysicsBodyComponent)
world.registerComponent(RotateTagComponent)

world.registerSystem(RotateSystem)
world.registerSystem(PhysicsSystem)

const ECS = createECS(world)

const Balls = () => (
    <MarchingCubes
        resolution={64}
        maxPolyCount={20000}
        enableUvs={false}
        enableColors
    >
        <meshStandardMaterial vertexColors roughness={0.4} />

        {Array.from({ length: 150 })
            .fill(null)
            .map((_, i) => (
                <ECS.Entity key={i}>
                    <ECS.Component type={ThreeComponent}>
                        <MarchingCube
                            strength={0.08}
                            subtract={6}
                            // @ts-expect-error type incorrect
                            color={gooColors[i % gooColors.length]}
                        />
                    </ECS.Component>

                    <ECS.Component
                        type={PhysicsBodyComponent}
                        args={[
                            () => {
                                const body = new Body({
                                    mass: 1,
                                    position: [
                                        Math.random() - 0.5,
                                        Math.random() - 0.5,
                                    ],
                                })

                                body.addShape(
                                    new Circle({
                                        radius: 0.02,
                                        material: defaultMaterial,
                                    })
                                )

                                return body
                            },
                        ]}
                    />
                </ECS.Entity>
            ))}
    </MarchingCubes>
)

const Container = () => (
    <ECS.Entity>
        <ECS.Component type={RotateTagComponent} />

        <ECS.Component type={ThreeComponent}>
            <group>
                {containerParts.map(({ width, height, position }, i) => (
                    <mesh key={i} position={[position[0], position[1], 0]}>
                        <boxGeometry args={[width, height, 0.8]} />
                        <meshStandardMaterial color="#999" />
                    </mesh>
                ))}
            </group>
        </ECS.Component>

        <ECS.Component
            type={PhysicsBodyComponent}
            args={[
                () => {
                    const body = new Body({
                        mass: 0,
                        position: [0, 0],
                    })

                    containerParts.map(({ width, height, position }) => {
                        body.addShape(
                            new Box({
                                width,
                                height,
                                material: defaultMaterial,
                            }),
                            position,
                            0
                        )
                    })

                    return body
                },
            ]}
        />
    </ECS.Entity>
)

const Loop = () => {
    useFrame((_, delta) => {
        ECS.update(delta)
    })

    return null
}

export default () => (
    <>
        <h1>Marching Cubes - Goo</h1>
        <Canvas camera={{ position: [-0.5, 0, 5], fov: 25 }}>
            <Balls />
            <Container />

            <ambientLight />
            <pointLight intensity={0.5} position={[10, 10, 10]} />

            <Bounds fit clip observe margin={3}>
                <mesh>
                    <planeGeometry />
                    <meshBasicMaterial visible={false} />
                </mesh>
            </Bounds>

            <OrbitControls />

            <Loop />
        </Canvas>
    </>
)
