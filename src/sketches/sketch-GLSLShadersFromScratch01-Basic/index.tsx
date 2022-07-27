import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

const App = () => {
    return (
        <mesh>
            <meshBasicMaterial color="#ff8888" />
            <boxGeometry args={[1, 1, 1]} />
        </mesh>
    )
}

export default () => (
    <>
        <h1>Shaders From Scratch 1 - Basic</h1>
        <Canvas camera={{ position: [3, 3, 3] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
