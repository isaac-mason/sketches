import { Bounds } from '@react-three/drei'
import { Color, useFrame } from '@react-three/fiber'
import { Component, System, World } from 'arancini'
import { createECS } from 'arancini/react'
import { button, useControls } from 'leva'
import * as p2 from 'p2-es'
import { ReactNode, useMemo, useState } from 'react'
import { MathUtils, Object3D } from 'three'
import { Canvas } from '../../../common'
import { createTextShape } from './font'

const LEVA_ROOT = 'p2-text-box'

const BOX_SIZE = 0.1

class BoxTagComponent extends Component {}

class PhysicsBodyComponent extends Component {
    body!: p2.Body

    construct(body: p2.Body) {
        this.body = body
    }
}

class ColorComponent extends Component {
    color!: Color

    construct(color: Color) {
        this.color = color
    }
}

class Object3DComponent extends Component {
    object!: THREE.Object3D

    construct() {
        this.object = new Object3D()
    }
}

class PhysicsSystem extends System {
    physicsWorld = new p2.World({ gravity: [0, 0] })

    bodies = this.query([PhysicsBodyComponent])

    physicsBodies = new Map<string, p2.Body>()

    static TIME_STEP = 1 / 60

    static MAX_SUB_STEPS = 10

    onInit() {
        this.bodies.onEntityAdded.add((entity) => {
            const { body } = entity.get(PhysicsBodyComponent)
            this.physicsBodies.set(entity.id, body)
            this.physicsWorld.addBody(body)
        })

        this.bodies.onEntityRemoved.add((entity) => {
            const body = this.physicsBodies.get(entity.id)
            this.physicsBodies.delete(entity.id)

            if (body) {
                this.physicsWorld.removeBody(body)
            }
        })
    }

    onUpdate(delta: number) {
        this.physicsWorld.step(PhysicsSystem.TIME_STEP, delta, PhysicsSystem.MAX_SUB_STEPS)

        for (const entity of this.bodies) {
            const { body } = entity.get(PhysicsBodyComponent)
            const { object } = entity.find(Object3DComponent) ?? {}

            if (object) {
                object.position.set(body.interpolatedPosition[0], body.interpolatedPosition[1], 0)
                object.rotation.set(0, 0, body.interpolatedAngle)
            }
        }
    }
}

const world = new World()

world.registerComponent(BoxTagComponent)
world.registerComponent(PhysicsBodyComponent)
world.registerComponent(ColorComponent)
world.registerComponent(Object3DComponent)

world.registerSystem(PhysicsSystem)

const ECS = createECS(world)

const MAX_DELTA = (1 / 60) * 10

const Loop = () => {
    useFrame((_, delta) => {
        ECS.update(MathUtils.clamp(delta, 0, MAX_DELTA))
    })

    return null
}

type BoxProps = {
    position: [number, number]
    velocity?: [number, number]
    color?: Color
}

const Box = ({ position, velocity, color }: BoxProps) => {
    const body = useMemo(() => {
        const b = new p2.Body({ mass: 1 })
        b.position = position
        b.velocity = velocity ? [...velocity] : [0, 0]

        const box = new p2.Box({ width: BOX_SIZE, height: BOX_SIZE })
        b.addShape(box)

        return b
    }, [])

    return (
        <ECS.Entity>
            <ECS.Component type={BoxTagComponent} />
            <ECS.Component type={ColorComponent} args={[color ?? 'white']} />
            <ECS.Component type={PhysicsBodyComponent} args={[body]} />
            <ECS.Component type={Object3DComponent} />
        </ECS.Entity>
    )
}

const BoxRenderer = () => (
    <ECS.QueryEntities query={[BoxTagComponent, Object3DComponent, ColorComponent]}>
        {(entity) => {
            const { object } = entity.get(Object3DComponent)
            const { color } = entity.get(ColorComponent)

            return (
                <primitive object={object}>
                    <mesh>
                        <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
                        <meshBasicMaterial color={color} />
                    </mesh>
                </primitive>
            )
        }}
    </ECS.QueryEntities>
)

type TextProps = {
    position: [number, number]
    velocity?: [number, number]
    color?: Color
    text: string
    underline?: boolean
}

const Text = ({ position, velocity, color, text, underline }: TextProps) => {
    const shape = useMemo(() => createTextShape(text, { underline }), [text, underline])

    const boxes: ReactNode[] = []

    shape.forEach((row, rowIndex) =>
        row.forEach((value, colIndex) => {
            if (value === ' ') return

            boxes.push(
                <Box
                    key={`${text}-${rowIndex}-${colIndex}`}
                    position={[
                        position[0] + (colIndex - Math.floor(row.length) / 2) / (1 / BOX_SIZE),
                        position[1] - (rowIndex - Math.floor(shape.length)) / (1 / BOX_SIZE),
                    ]}
                    velocity={velocity}
                    color={color}
                />,
            )
        }),
    )

    return <>{boxes}</>
}

export default () => {
    const [version, setVersion] = useState(0)

    const { firstWord, secondWord, thirdWord } = useControls(
        `${LEVA_ROOT}/text`,
        {
            firstWord: 'convincingly still',
            secondWord: 'moving',
            thirdWord: 'also moving',
            reset: button(() => setVersion(version + 1)),
        },
        [version],
    )

    const textKey = `${firstWord} ${secondWord} ${thirdWord} ${version}`

    return (
        <>
            <h1>p2-es - Pixelated Text</h1>
            <Canvas camera={{ position: [-0.5, 0, 5], fov: 25 }}>
                <Text key={`first ${textKey}`} text={firstWord} color="white" position={[0, 0]} underline />

                <Text key={`second ${textKey}`} text={secondWord} color="orange" position={[-3, 5]} velocity={[0, -2]} />

                <Text key={`third ${textKey}`} text={thirdWord} color="hotpink" position={[3, -10]} velocity={[0, 3]} />

                <BoxRenderer />

                <Loop />

                <Bounds fit margin={3.5}>
                    <mesh position={[0, 0, 0]} visible={false} />
                </Bounds>
            </Canvas>
        </>
    )
}
