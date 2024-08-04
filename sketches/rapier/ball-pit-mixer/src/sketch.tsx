import { Canvas, usePageVisible } from '@/common'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { Physics, RapierRigidBody, RigidBody, Vector3Tuple } from '@react-three/rapier'
import { useControls } from 'leva'
import { useMemo, useRef } from 'react'
import { Euler, Quaternion } from 'three'

const LEVA_KEY = 'rapier-ball-pit-mixer'

const width = 20
const height = 50

const colors = ['orange', 'hotpink', 'white']

const Container = () => {
    const boxes: { position: Vector3Tuple; args: Vector3Tuple }[] = [
        {
            position: [0, 0, width / 2],
            args: [width, height, 1],
        },
        {
            position: [0, 0, -width / 2],
            args: [width, height, 1],
        },
        {
            position: [width / 2, 0, 0],
            args: [1, height, width],
        },
        {
            position: [-width / 2, 0, 0],
            args: [1, height, width],
        },
        {
            position: [0, -height / 2, 0],
            args: [width, 1, width],
        },
        {
            position: [0, height / 2, 0],
            args: [width, 1, width],
        },
    ]

    return (
        <>
            {boxes.map((box, index) => (
                <RigidBody key={index} position={box.position} type="fixed" rotation={[0, 0, 0]}>
                    <mesh>
                        <boxGeometry args={box.args} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                </RigidBody>
            ))}
        </>
    )
}

type BallProps = {
    position: Vector3Tuple
    color: string
    radius: number
}

const Ball = ({ position, color, radius }: BallProps) => {
    return (
        <RigidBody position={position} colliders="ball" type="dynamic" mass={0.5} rotation={[0, 0, 0]}>
            <mesh>
                <sphereGeometry args={[radius]} />
                <meshStandardMaterial color={color} />
            </mesh>
        </RigidBody>
    )
}

const Balls = () => {
    const balls = useMemo(() => {
        return Array.from({ length: 400 }).map((_, index) => ({
            id: index,
            position: [
                Math.random() * width - width / 2,
                Math.random() * 2 + 1,
                Math.random() * width - width / 2,
            ] as Vector3Tuple,
            color: colors[Math.floor(Math.random() * colors.length)],
            radius: Math.random() * 0.8 + 0.4,
        }))
    }, [])

    return (
        <>
            {balls.map(({ id, position, color, radius }) => (
                <Ball key={id} position={position} color={color} radius={radius} />
            ))}
        </>
    )
}

const euler = new Euler()
const quat = new Quaternion()

const Mixer = () => {
    const ref = useRef<RapierRigidBody>(null!)

    useFrame(({ clock: { elapsedTime } }) => {
        ref.current.setRotation(quat.setFromEuler(euler.set(0, elapsedTime * 1.5, 0)), true)
    })

    return (
        <RigidBody type="kinematicPosition" position={[0, -20, 0]} rotation={[0, 0, 0]} ref={ref}>
            <mesh>
                <boxGeometry args={[15, 8, 1]} />
                <meshStandardMaterial color="#999" />
            </mesh>
        </RigidBody>
    )
}

const Scene = () => (
    <>
        <Mixer />
        <Balls />
        <Container />

        <ambientLight intensity={1.5} />
        <pointLight position={[10, 10, 10]} decay={1.5} intensity={150} />

        <OrbitControls makeDefault target={[0, -25, 0]} minPolarAngle={0} maxPolarAngle={Math.PI / 16} />
    </>
)

export function Sketch() {
    const visible = usePageVisible()

    const { debug } = useControls(`${LEVA_KEY}-physics`, {
        debug: false,
    })

    return (
        <>
            <Canvas camera={{ fov: 60, position: [-2, 10, 2] }}>
                <Physics paused={!visible} debug={debug}>
                    <Scene />
                </Physics>
            </Canvas>
        </>
    )
}
