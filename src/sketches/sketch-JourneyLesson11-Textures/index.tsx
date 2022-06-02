import { OrbitControls, useTexture } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import doorImage from './textures/door/color.jpg'
import minecraftImage from './textures/minecraft.png'

const App = () => {
    const doorTexture = useTexture(doorImage)
    doorTexture.wrapS = THREE.MirroredRepeatWrapping
    doorTexture.wrapT = THREE.MirroredRepeatWrapping
    doorTexture.offset.x = -0.2
    doorTexture.offset.y = 0.5
    doorTexture.rotation = Math.PI / 4

    const minecraftTexture = useTexture(minecraftImage)
    minecraftTexture.magFilter = THREE.NearestFilter

    return (
        <>
            <mesh position={[-3, 0, 0]}>
                <boxBufferGeometry args={[3, 3, 3]} />
                <meshBasicMaterial map={doorTexture} />
            </mesh>
            <mesh position={[2, 0, 0]}>
                <boxBufferGeometry args={[3, 3, 3]} />
                <meshBasicMaterial map={minecraftTexture} />
            </mesh>
        </>
    )
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
