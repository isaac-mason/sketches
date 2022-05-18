import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

const App = () => {
    return null
}

export default () => (
    <>
        <h1>11 - Textures</h1>
        <Canvas camera={{ position: [0, 0, 10], fov: 60 }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
