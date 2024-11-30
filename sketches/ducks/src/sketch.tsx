import sunsetEnvironment from '@pmndrs/assets/hdri/sunset.exr'
import { Environment, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'

export function Sketch() {
    return (
        <Canvas>
            <Environment files={sunsetEnvironment} />

            <PerspectiveCamera makeDefault position={[10, 10, 30]} />
            <OrbitControls makeDefault target={[0, 3, 0]} />
        </Canvas>
    )
}
