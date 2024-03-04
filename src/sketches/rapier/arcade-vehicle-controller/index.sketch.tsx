import { BallCollider, Physics, RapierRigidBody, RigidBody } from '@react-three/rapier'
import { useRef, useState } from 'react'
import { Canvas } from '../../../common'
import { KeyboardControls, OrbitControls, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { AmbientLight } from 'three'
import { useFrame } from '@react-three/fiber'

type KeyControls = {
    accelerate: boolean
    decelerate: boolean
    left: boolean
    right: boolean
    hop: boolean
}

const controls = [
    { name: 'accelerate', keys: ['KeyW'] },
    { name: 'decelerate', keys: ['KeyS'] },
    { name: 'left', keys: ['KeyA'] },
    { name: 'right', keys: ['KeyD'] },
    { name: 'hop', keys: ['Space'] },
]

const ArcadeVehicle = () => {
    const body = useRef<RapierRigidBody>(null!)

    const [isOnGround, setIsOnGround] = useState(false)
    const [currentSpeed, setCurrentSpeed] = useState(0)

    const [, getKeyboardControls] = useKeyboardControls()

    useFrame((_, delta) => {
        const controls = getKeyboardControls() as KeyControls
        const { accelerate, decelerate, left, right, hop } = controls

        //
        
    })

    return (
        <RigidBody ref={body} colliders={false} position={[0, 2, 0]} mass={3} ccd name="player" type="dynamic">
            <BallCollider
                args={[0.5]}
                mass={3}
                onCollisionEnter={({ other }) => {
                    setIsOnGround(true)
                }}
                onCollisionExit={({ other }) => {
                    setIsOnGround(false)
                }}
            />
        </RigidBody>
    )
}
export default function Sketch() {
    return (
        <Canvas>
            <Physics debug>
                <KeyboardControls map={controls}>
                    <ArcadeVehicle />
                </KeyboardControls>

                <RigidBody type="fixed">
                    <mesh>
                        <boxGeometry args={[100, 1, 100]} />
                        <meshStandardMaterial color="#999" />
                    </mesh>
                </RigidBody>

                <ambientLight intensity={1.5} />
                <pointLight intensity={15} decay={1.5} position={[5, 5, 5]} />

                <OrbitControls makeDefault />
                <PerspectiveCamera makeDefault position={[0, 5, 10]} />
            </Physics>
        </Canvas>
    )
}
