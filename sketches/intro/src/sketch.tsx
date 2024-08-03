import { Html } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Group } from 'three'

const Home = () => {
    const group = useRef<Group>(null!)
    const time = useRef(0)

    useFrame((_, delta) => {
        time.current += delta * 3

        if (group.current) {
            group.current.rotation.z = Math.sin(time.current) / 6
        }
    })

    return (
        <group ref={group}>
            <Html
                transform
                style={{
                    fontSize: '2em',
                }}
            >
                👋
            </Html>
        </group>
    )
}

export function Sketch() {
    return (
        <>
            <h1>Select a sketch...</h1>
            <Canvas>
                <Home />
            </Canvas>
        </>
    )
}
