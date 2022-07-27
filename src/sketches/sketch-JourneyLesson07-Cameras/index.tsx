import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Mesh } from 'three'

const App = () => {
    const { camera } = useThree()
    const mesh = useRef<Mesh>(null!)

    useFrame(({ mouse }) => {
        camera.position.x = -mouse.x
        camera.position.y = -mouse.y
    })

    return (
        <mesh ref={mesh as never}>
            <meshBasicMaterial color="#ff8888" />
            <boxGeometry args={[1, 1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <h1>Journey 07 - Cameras</h1>
        <Canvas>
            <App />
        </Canvas>
    </>
)
