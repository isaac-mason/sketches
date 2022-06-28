import { PresentationControls, useTexture } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Fog, PointLight } from 'three'
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
                    <meshStandardMaterial /* color={0xac8e82} */
                        map={bricksColor}
                        aoMap={bricksAmbientOcclusion}
                        normalMap={bricksNormal}
                        roughnessMap={bricksRoughness}
                    />
                </mesh>
                {/* Roof */}
                <mesh
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
                    position={[0, 2.2, 2.7]}
                    color={0xff7d67}
                    intensity={1}
                    distance={7}
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
            <mesh castShadow>
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
    const ref = useRef<PointLight>(null!)

    useFrame(({ clock: { elapsedTime } }) => {
        const ghostAngle = elapsedTime * 0.5
        ref.current.position.x =
            Math.cos(ghostAngle + props.offset) *
            (7 + Math.sin(elapsedTime * 2) * 2)
        ref.current.position.z =
            Math.sin(ghostAngle + props.offset) *
            (7 + Math.sin(elapsedTime * 2) * 2)
        ref.current.position.y = Math.sin(ghostAngle * 3) + 1
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
            shadow-camera-far={7}
        />
    )
}

const Grass = () => {
    const color = useTexture(grassColorImage)
    const ambientOcclusion = useTexture(grassAmbientOcclusionImage)
    const normal = useTexture(grassNormalImage)
    const roughness = useTexture(grassRoughnessImage)

    color.repeat.set(12, 12)
    ambientOcclusion.repeat.set(12, 12)
    normal.repeat.set(12, 12)
    roughness.repeat.set(12, 12)

    color.wrapS = THREE.RepeatWrapping
    color.wrapT = THREE.RepeatWrapping

    ambientOcclusion.wrapS = THREE.RepeatWrapping
    ambientOcclusion.wrapT = THREE.RepeatWrapping

    normal.wrapS = THREE.RepeatWrapping
    normal.wrapT = THREE.RepeatWrapping

    roughness.wrapS = THREE.RepeatWrapping
    roughness.wrapT = THREE.RepeatWrapping

    return (
        <mesh rotation={[-Math.PI * 0.5, 0, 0]} receiveShadow>
            <planeBufferGeometry args={[50, 50]}>
                <bufferAttribute attach="uv2" />
            </planeBufferGeometry>
            <meshStandardMaterial
                aoMap={ambientOcclusion}
                map={color}
                normalMap={normal}
                roughnessMap={roughness}
            />
        </mesh>
    )
}

const Lights = () => {
    return (
        <>
            <ambientLight color={0xb5b5ff} intensity={0.12} />
            <directionalLight
                color={0xb5b5ff}
                intensity={0.12}
                position={[5, 2, 5]}
                lookAt={() => [0, 0, 0]}
            />
        </>
    )
}

const ghosts = [
    { color: '#ff0000', offset: 0 },
    { color: '#00ff00', offset: 1.7 },
    { color: '#0000ff', offset: 3.4 },
]

const App = () => {
    const { gl, scene } = useThree()

    useEffect(() => {
        scene.fog = new Fog(BACKGROUND_COLOR, 12, 24)
        gl.setClearColor(BACKGROUND_COLOR)
    })

    return (
        <>
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
        <h1 style={{ zIndex: 1 }}>17 - Haunted House</h1>
        <Canvas
            camera={{ position: [6, 6, 12], fov: 50 }}
            shadows={{ type: THREE.PCFSoftShadowMap }}
        >
            <PresentationControls snap>
                <App />
            </PresentationControls>
        </Canvas>
    </>
)
