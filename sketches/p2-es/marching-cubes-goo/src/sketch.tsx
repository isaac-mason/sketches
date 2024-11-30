import { Canvas } from '@/common'
import { Bounds, MarchingCube, MarchingCubes, OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import * as THREE from 'three'

type EntityType = {
    isRotating?: boolean
    object3D?: THREE.Object3D
    physicsBody?: p2.Body
}

const world = new World<EntityType>()
const { Entity, Component } = createReactAPI(world)

const physicsWorld = new p2.World({ gravity: [0, -5] })
const defaultMaterial = new p2.Material()
const contactMaterial = new p2.ContactMaterial(defaultMaterial, defaultMaterial, {
    restitution: 0.4,
    friction: 0,
})
physicsWorld.addContactMaterial(contactMaterial)

const rotatingPhysicsBodiesQuery = world.query((e) => e.has('isRotating', 'physicsBody', 'object3D'))
const physicsBodiesQuery = world.query((e) => e.has('physicsBody'))

physicsBodiesQuery.onEntityAdded.add(({ physicsBody }) => {
    physicsWorld.addBody(physicsBody)
})

physicsBodiesQuery.onEntityRemoved.add(({ physicsBody }) => {
    if (physicsBody) {
        physicsWorld.removeBody(physicsBody)
    }
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

const rotatingContainerUpdate = (time: number) => {
    for (const { physicsBody } of rotatingPhysicsBodiesQuery.entities) {
        // console.log(physicsBody.position)
        physicsBody.angle = time * -0.5
    }
}

const TIME_STEP = 1 / 60
const MAX_SUB_STEPS = 10

const physicsUpdate = (delta: number) => {
    physicsWorld.step(TIME_STEP, delta, MAX_SUB_STEPS)

    for (const { physicsBody, object3D } of physicsBodiesQuery.entities) {
        if (!object3D) continue
        object3D.position.set(physicsBody.interpolatedPosition[0], physicsBody.interpolatedPosition[1], 0)
        object3D.rotation.set(0, 0, physicsBody.angle)
    }
}

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
    useFrame(({ clock: { elapsedTime } }, delta) => {
        rotatingContainerUpdate(elapsedTime)
        physicsUpdate(Math.min(delta, 0.1))
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
