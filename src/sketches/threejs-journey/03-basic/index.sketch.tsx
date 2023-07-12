import { OrbitControls } from '@react-three/drei'
import { Canvas } from '../../../common'

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
        <Canvas camera={{ position: [3, 3, 3] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
