import { Canvas } from '@react-three/fiber'
import { Bounds } from '@react-three/drei'
import { Color, useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { button, useControls } from 'leva'
import * as p2 from 'p2-es'
import { ReactNode, useMemo, useState } from 'react'
import * as THREE from 'three'
import { createTextShape } from './font'

const LEVA_ROOT = 'p2-text-box'

type EntityType = {
    isBox?: boolean
    physicsBody?: p2.Body
    object3D?: THREE.Object3D
    color?: Color
}

const world = new World<EntityType>()

const physicsWorld = new p2.World({ gravity: [0, 0] })

const physicsBodiesQuery = world.query((e) => e.is('physicsBody'))
const boxQuery = world.query((e) => e.is('isBox', 'physicsBody'))

physicsBodiesQuery.onEntityAdded.add(({ physicsBody }) => {
    physicsWorld.addBody(physicsBody)
})

physicsBodiesQuery.onEntityRemoved.add(({ physicsBody }) => {
    if (physicsBody) {
        physicsWorld.removeBody(physicsBody)
    }
})

const physicsUpdate = (delta: number) => {
    physicsWorld.step(1 / 60, delta, 10)

    for (const { physicsBody, object3D } of physicsBodiesQuery.entities) {
        if (!object3D) continue

        object3D.position.set(physicsBody.interpolatedPosition[0], physicsBody.interpolatedPosition[1], 0)
        object3D.rotation.set(0, 0, physicsBody.interpolatedAngle)
    }
}

const { Entity, Entities, Component } = createReactAPI(world)

const MAX_DELTA = (1 / 60) * 10

const Loop = () => {
    useFrame((_, delta) => {
        physicsUpdate(Math.min(delta, MAX_DELTA))
    })

    return null
}

type BoxProps = {
    position: [number, number]
    velocity?: [number, number]
    color?: Color
}

const BOX_SIZE = 0.1

const Box = ({ position, velocity, color }: BoxProps) => {
    const body = useMemo(() => {
        const b = new p2.Body({ mass: 1 })
        b.position = position
        b.velocity = velocity ? [...velocity] : [0, 0]

        const box = new p2.Box({ width: BOX_SIZE, height: BOX_SIZE })
        b.addShape(box)

        return b
    }, [])

    return <Entity isBox color={color ?? 'white'} physicsBody={body} />
}

const BoxRenderer = () => (
    <Entities in={boxQuery}>
        {({ color }) => {
            return (
                <Component name="object3D">
                    <mesh>
                        <boxGeometry args={[BOX_SIZE, BOX_SIZE, BOX_SIZE]} />
                        <meshBasicMaterial color={color} />
                    </mesh>
                </Component>
            )
        }}
    </Entities>
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

export function Sketch() {
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
