import { OrbitControls, useHelper, useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '../Canvas'
import bricksAmbientOcclusionImage from './textures/bricks/ambientOcclusion.jpg'
import bricksColorImage from './textures/bricks/color.jpg'
import bricksNormalImage from './textures/bricks/normal.jpg'
import bricksRoughnessImage from './textures/bricks/roughness.jpg'
import doorAlphaImage from './textures/door/alpha.jpg'
import doorAmbientOcclusionImage from './textures/door/ambientOcclusion.jpg'
import doorColorImage from './textures/door/color.jpg'
import doorHeightImage from './textures/door/height.jpg'
import doorMetalnessImage from './textures/door/metalness.jpg'
import doorNormalImage from './textures/door/normal.jpg'
import doorRoughnessImage from './textures/door/roughness.jpg'
import grassAmbientOcclusionImage from './textures/grass/ambientOcclusion.jpg'
import grassColorImage from './textures/grass/color.jpg'
import grassNormalImage from './textures/grass/normal.jpg'
import grassRoughnessImage from './textures/grass/roughness.jpg'

const BACKGROUND_COLOR = 0x262837

const House = (props: JSX.IntrinsicElements['group']) => {
    const lightRef = useRef<THREE.PointLight>(null!)
    useHelper(lightRef, THREE.PointLightHelper)

    const bricksColor = useTexture(bricksColorImage)
    const bricksAmbientOcclusion = useTexture(bricksAmbientOcclusionImage)
    const bricksNormal = useTexture(bricksNormalImage)
    const bricksRoughness = useTexture(bricksRoughnessImage)

    const doorColor = useTexture(doorColorImage)
    const doorAlpha = useTexture(doorAlphaImage)
    const doorAmbientOcclusion = useTexture(doorAmbientOcclusionImage)
    const doorHeight = useTexture(doorHeightImage)
    const doorNormal = useTexture(doorNormalImage)
    const doorMetalness = useTexture(doorMetalnessImage)
    const doorRoughness = useTexture(doorRoughnessImage)

    return (
        <>
            <group {...props}>
                {/* Walls */}
                <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
                    <boxBufferGeometry args={[4, 2.5, 4]}>
                        <bufferAttribute attach="uv2" />
                    </boxBufferGeometry>
                    <meshStandardMaterial
                        map={bricksColor}
                        aoMap={bricksAmbientOcclusion}
                        normalMap={bricksNormal}
                        normalMap-encoding={THREE.LinearEncoding}
                        normalScale={new THREE.Vector2(0.01, 0.01)}
                        roughnessMap={bricksRoughness}
                    />
                </mesh>
                {/* Roof */}
                <mesh
                    castShadow
                    receiveShadow
                    position={[0, 2.5 + 0.5, 0]}
                    rotation={[0, Math.PI / 4, 0]}
                >
                    <coneBufferGeometry args={[3.5, 1, 4]} />
                    <meshStandardMaterial color={0xb35f45} />
                </mesh>
                {/* Door */}
                <mesh position={[0, 1, 2.001]}>
                    <planeBufferGeometry args={[2.2, 2.2, 100, 100]}>
                        <bufferAttribute attach="uv2" />
                    </planeBufferGeometry>
                    <meshStandardMaterial
                        transparent
                        map={doorColor}
                        alphaMap={doorAlpha}
                        aoMap={doorAmbientOcclusion}
                        aoMapIntensity={2}
                        displacementMap={doorHeight}
                        displacementScale={0.2}
                        normalMap={doorNormal}
                        metalnessMap={doorMetalness}
                        roughnessMap={doorRoughness}
                    />
                </mesh>
                {/* Door light */}
                <pointLight
                    ref={lightRef}
                    position={[0, 2, 2.3]}
                    color={0xff7d67}
                    intensity={2}
                    distance={12}
                    castShadow
                    shadow-mapSize-width={256}
                    shadow-mapSize-height={256}
                    shadow-camera-far={7}
                />
            </group>
        </>
    )
}

const Bush = (props: JSX.IntrinsicElements['group']) => {
    return (
        <group {...props}>
            <mesh receiveShadow castShadow>
                <sphereBufferGeometry args={[1, 16, 16]} />
                <meshStandardMaterial color={0x89c854} />
            </mesh>
        </group>
    )
}

const Grave = (props: JSX.IntrinsicElements['group']) => {
    return (
        <group {...props}>
            <mesh position={[0, 0.3, 1]} receiveShadow castShadow>
                <boxBufferGeometry args={[0.6, 0.8, 0.2]} />
                <meshStandardMaterial color={0xb2b6b1} />
            </mesh>
        </group>
    )
}

const Ghost = (props: { color: string; offset: number }) => {
    const ref = useRef<THREE.PointLight>(null!)
    useHelper(ref, THREE.PointLightHelper)

    useFrame(({ clock: { elapsedTime } }) => {
        const ghostAngle = elapsedTime * 0.5
        ref.current.position.x =
            Math.cos(ghostAngle + props.offset) *
            (7 + Math.sin(elapsedTime * 2) * 2)
        ref.current.position.z =
            Math.sin(ghostAngle + props.offset) *
            (7 + Math.sin(elapsedTime * 2) * 2)
        ref.current.position.y = Math.sin(ghostAngle * 2) - 0.5
    })

    return (
        <pointLight
            ref={ref as never}
            color={props.color}
            intensity={2}
            distance={4}
            castShadow
            shadow-mapSize-width={256}
            shadow-mapSize-height={256}
            shadow-camera-far={4}
        />
    )
}

const Grass = () => {
    const color = useTexture(grassColorImage)
    const ambientOcclusion = useTexture(grassAmbientOcclusionImage)
    const normal = useTexture(grassNormalImage)
    const roughness = useTexture(grassRoughnessImage)

    return (
        <mesh rotation={[-Math.PI * 0.5, 0, 0]} receiveShadow>
            <planeBufferGeometry args={[50, 50]}>
                <bufferAttribute attach="uv2" />
            </planeBufferGeometry>
            <meshStandardMaterial
                map={color}
                map-repeat={[20, 20]}
                map-wrapS={THREE.RepeatWrapping}
                map-wrapT={THREE.RepeatWrapping}
                aoMap={ambientOcclusion}
                aoMap-repeat={[20, 20]}
                aoMap-wrapS={THREE.RepeatWrapping}
                aoMap-wrapT={THREE.RepeatWrapping}
                normalMap={normal}
                normalMap-repeat={[20, 20]}
                normalMap-wrapS={THREE.RepeatWrapping}
                normalMap-wrapT={THREE.RepeatWrapping}
                normalMap-encoding={THREE.LinearEncoding}
                roughnessMap={roughness}
                roughnessMap-repeat={[20, 20]}
                roughnessMap-wrapS={THREE.RepeatWrapping}
                roughnessMap-wrapT={THREE.RepeatWrapping}
            />
        </mesh>
    )
}

const Lights = () => {
    return (
        <>
            <ambientLight color={0xb5b5ff} intensity={0.2} />
        </>
    )
}

const ghosts = [
    { color: '#ff0000', offset: 0 },
    { color: '#00ff00', offset: 1.7 },
    { color: '#0000ff', offset: 3.4 },
]

const App = () => {
    return (
        <>
            <color attach="background" args={[BACKGROUND_COLOR]} />
            <fog attach="fog" args={[BACKGROUND_COLOR, 12, 24]} />

            <Lights />
            <Grass />
            <House />

            {/* right bushes */}
            <Bush position={[1, 0.2, 2.2]} scale={[0.5, 0.5, 0.5]} />
            <Bush position={[1.6, 0.1, 2.1]} scale={[0.25, 0.25, 0.25]} />

            {/* left bushes */}
            <Bush position={[-0.8, 0.1, 2.2]} scale={[0.4, 0.4, 0.4]} />
            <Bush position={[-1, 0.05, 2.7]} scale={[0.15, 0.15, 0.15]} />

            {/* ghosts */}
            {ghosts.map((ghost, idx) => (
                <Ghost key={idx} {...ghost} />
            ))}

            {/* graves */}
            {Array.from({ length: 50 }).map((_, idx) => {
                const angle = Math.random() * Math.PI * 2
                const radius = 3 + Math.random() * 10
                const x = Math.sin(angle) * radius
                const z = Math.cos(angle) * radius

                return (
                    <Grave
                        key={idx}
                        position={[x, 0, z]}
                        rotation={[
                            0,
                            (Math.random() - 0.5) * 0.4,
                            (Math.random() - 0.5) * 0.4,
                        ]}
                    />
                )
            })}
        </>
    )
}

export default () => (
    <>
        <h1>Journey 17 - Haunted House</h1>
        <Canvas
            camera={{ position: [6, 6, 12], fov: 50 }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
        >
            <OrbitControls />
            <App />
        </Canvas>
    </>
)
