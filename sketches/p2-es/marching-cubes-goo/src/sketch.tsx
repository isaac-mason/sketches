import { Bounds, MarchingCube, MarchingCubes, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { Executor, System } from 'arancini/systems'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Canvas } from '@/common'

const defaultMaterial = new p2.Material()

const contactMaterial = new p2.ContactMaterial(defaultMaterial, defaultMaterial, {
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

type EntityType = {
    isRotating?: boolean
    object3D?: THREE.Object3D
    physicsBody?: p2.Body
}

class RotateSystem extends System<EntityType> {
    rotating = this.query((e) => e.has('isRotating', 'physicsBody'))

    onUpdate(_delta: number, time: number): void {
        for (const { physicsBody } of this.rotating) {
            physicsBody.angle = time * -0.5
        }
    }
}

class PhysicsSystem extends System<EntityType> {
    physicsWorld = new p2.World({ gravity: [0, -5] })

    physicsBodies = this.query((e) => e.has('physicsBody', 'object3D'))

    static TIME_STEP = 1 / 60

    static MAX_SUB_STEPS = 10

    onInit(): void {
        this.physicsWorld.addContactMaterial(contactMaterial)

        this.physicsBodies.onEntityAdded.add(({ physicsBody }) => {
            this.physicsWorld.addBody(physicsBody)
        })

        this.physicsBodies.onEntityRemoved.add(({ physicsBody }) => {
            if (physicsBody) {
                this.physicsWorld.removeBody(physicsBody)
            }
        })
    }

    onUpdate(delta: number): void {
        this.physicsWorld.step(PhysicsSystem.TIME_STEP, delta, PhysicsSystem.MAX_SUB_STEPS)

        for (const { physicsBody, object3D } of this.physicsBodies) {
            object3D.position.set(physicsBody.interpolatedPosition[0], physicsBody.interpolatedPosition[1], 0)
            object3D.rotation.set(0, 0, physicsBody.angle)
        }
    }
}

const world = new World<EntityType>()

const executor = new Executor(world)

executor.add(RotateSystem)
executor.add(PhysicsSystem)

executor.init()

const { Entity, Component } = createReactAPI(world)

type BallProps = { index: number }

const Ball = ({ index }: BallProps) => {
    const circleBody = useMemo(() => {
        const body = new p2.Body({
            mass: 1,
            position: [Math.random() - 0.5, Math.random() - 0.5],
        })

        body.addShape(
            new p2.Circle({
                radius: 0.02,
                material: defaultMaterial,
            }),
        )

        return body
    }, [])

    return (
        <Entity physicsBody={circleBody}>
            <Component name="object3D">
                <MarchingCube
                    strength={0.08}
                    subtract={6}
                    // @ts-expect-error type incorrect
                    color={gooColors[index % gooColors.length]}
                />
            </Component>
        </Entity>
    )
}

const Balls = () => (
    <MarchingCubes resolution={64} maxPolyCount={20000} enableUvs={false} enableColors>
        <meshStandardMaterial vertexColors roughness={0.4} />

        {Array.from({ length: 150 })
            .fill(null)
            .map((_, i) => (
                <Ball key={i} index={i} />
            ))}
    </MarchingCubes>
)

const Container = () => {
    const body = useMemo(() => {
        const body = new p2.Body({
            mass: 0,
            position: [0, 0],
        })

        containerParts.map(({ width, height, position }) => {
            body.addShape(
                new p2.Box({
                    width,
                    height,
                    material: defaultMaterial,
                }),
                position,
                0,
            )
        })

        return body
    }, [])

    return (
        <Entity isRotating physicsBody={body}>
            <Component name="object3D">
                <group>
                    {containerParts.map(({ width, height, position }, i) => (
                        <mesh key={i} position={[position[0], position[1], 0]}>
                            <boxGeometry args={[width, height, 0.8]} />
                            <meshStandardMaterial color="#999" />
                        </mesh>
                    ))}
                </group>
            </Component>
        </Entity>
    )
}

const Loop = () => {
    useFrame((_, delta) => {
        executor.update(Math.min(delta, 0.1))
    })

    return null
}

export function Sketch() {
    return (
        <Canvas camera={{ position: [-0.5, 0, 5], fov: 25 }}>
            <Balls />
            <Container />

            <ambientLight intensity={3} />
            <pointLight decay={1.5} intensity={100} position={[15, 15, 15]} />

            <Bounds fit clip observe margin={3}>
                <mesh>
                    <planeGeometry />
                    <meshBasicMaterial visible={false} />
                </mesh>
            </Bounds>

            <OrbitControls />

            <Loop />
        </Canvas>
    )
}
