import { Float, OrbitControls, Stats, useHelper } from '@react-three/drei'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { DirectionalLight, PointLight, SpotLight } from 'three'
import { Canvas } from '../../components/canvas'

const floatProps = {
    floatIntensity: 2,
}

const Shapes = () => (
    <>
        <Float {...floatProps}>
            <mesh position={[-2, 2, 0]} castShadow receiveShadow>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial />
            </mesh>
        </Float>
        <Float {...floatProps}>
            <mesh position={[0, 2, 0]} castShadow receiveShadow>
                <sphereGeometry args={[0.7]} />
                <meshStandardMaterial />
            </mesh>
        </Float>
        <Float {...floatProps}>
            <mesh position={[2, 2, 0]} castShadow receiveShadow>
                <torusKnotGeometry args={[0.5, 0.2, 64, 64]} />
                <meshStandardMaterial />
            </mesh>
        </Float>
    </>
)

const Ground = () => (
    <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="white" />
    </mesh>
)

const Lights = () => {
    const directionalLight = useRef<DirectionalLight>(null!)
    const spotLight = useRef<SpotLight>(null!)
    const pointLight = useRef<PointLight>(null!)

    useHelper(directionalLight, THREE.DirectionalLightHelper, 1, 'hotpink')
    useHelper(spotLight, THREE.SpotLightHelper, 'blue')
    useHelper(pointLight, THREE.PointLightHelper, 0.5, 'green')

    useEffect(() => {
        directionalLight.current.lookAt(0, 0, 0)
        spotLight.current.lookAt(0, 0, 0)
    }, [])

    return (
        <>
            <ambientLight intensity={0.1} />
            <directionalLight
                ref={directionalLight}
                castShadow
                intensity={0.3}
                color={0xffffff}
                position={[0, 3, 1]}
                shadow-camera-top={4}
                shadow-camera-right={4}
                shadow-camera-bottom={-4}
                shadow-camera-left={-4}
                shadow-mapSize-height={2048}
                shadow-mapSize-width={2048}
            />
            <spotLight
                ref={spotLight}
                args={[0xffffff, 0.3, 10, Math.PI * 0.3]}
                castShadow
                position={[-3, 4, 2]}
                shadow-camera-near={2}
                shadow-camera-far={10}
                shadow-camera-top={8}
                shadow-camera-right={8}
                shadow-camera-bottom={-8}
                shadow-camera-left={-8}
                shadow-mapSize-height={2048}
                shadow-mapSize-width={2048}
            />
            <pointLight
                ref={pointLight}
                args={[0xffffff, 0.3, 10, Math.PI * 0.3]}
                castShadow
                position={[3, 4, 2]}
                shadow-camera-top={8}
                shadow-camera-right={8}
                shadow-camera-bottom={-8}
                shadow-camera-left={-8}
                shadow-mapSize-height={2048}
                shadow-mapSize-width={2048}
            />
        </>
    )
}

const App = () => {
    return (
        <>
            <Stats />
            <Shapes />
            <Ground />
            <Lights />
        </>
    )
}

export default () => (
    <>
        <h1>Journey 16 - Shadows</h1>
        <Canvas
            camera={{ position: [0, 5, 6], fov: 50 }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
        >
            <App />
            <OrbitControls target={[0, 2, 0]} />
        </Canvas>
    </>
)
