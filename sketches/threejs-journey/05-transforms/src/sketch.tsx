import { TransformControls } from '@react-three/drei'
import { extend } from '@react-three/fiber'
import { AxesHelper } from 'three'
import { Canvas } from '@react-three/fiber'

extend(AxesHelper)

const App = () => {
    return (
        <TransformControls>
            <mesh>
                <meshBasicMaterial color="#ff8888" />
                <boxGeometry args={[1, 1, 1]} />
            </mesh>
        </TransformControls>
    )
}

export function Sketch() {
    return (
        <Canvas camera={{ position: [3, 3, 3] }}>
            <App />
            <axesHelper scale={2} />
        </Canvas>
    )
}
