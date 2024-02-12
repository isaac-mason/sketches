import bunny from '@pmndrs/assets/models/bunny.glb'
import { Instance, Instances, MeshReflectorMaterial, PerspectiveCamera, useGLTF } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { easing } from 'maath'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { Canvas, useMutableCallback, usePageVisible } from '../../common'
import { FixedTimeStep } from '../../common/utils/fixed-time-step'

const gameOfLifeStep = (current: Uint8Array, next: Uint8Array, width: number, height: number) => {
    for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
            let neighbors = 0

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue
                    if (current[(y + dy) * width + (x + dx)]) neighbors++
                }
            }

            const i = y * width + x

            if (current[i]) {
                if (neighbors === 2 || neighbors === 3) next[i] = 1
            } else {
                if (neighbors === 3) next[i] = 1
            }
        }
    }
}

const gameOfLifeVertexShader = /* glsl */ `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`

const gameOfLifeFragmentShader = /* glsl */ `
    uniform sampler2D uState;
    uniform float uGameWidth;
    uniform float uGameHeight;
    uniform float uTime;

    varying vec2 vUv;

    void main() {
        vec2 cellPosition = vec2(
            floor(vUv.x * uGameWidth + 0.5),
            floor(vUv.y * uGameHeight + 0.5)
        );
        vec2 samplePosition = cellPosition / vec2(uGameWidth, uGameHeight);

        vec4 textureSample = texture2D(uState, samplePosition);

        bool isAlive = textureSample.r > 0.5;

        vec4 color = vec4(0.0, 0.0, 0.0, 0.5);

        if (isAlive) {
            color = vec4(1.0, 1.0, 1.0, 1.0);
        }

        gl_FragColor = color;
    }
`

const GameOfLifeMaterial = ({ width, height }: { width: number; height: number }) => {
    const time = useRef({ value: 0 })
    const state = useMemo(() => new Uint8Array(width * height), [])
    const nextState = useMemo(() => new Uint8Array(width * height), [])
    const dataTexture = useMemo(() => {
        const data = new Uint8Array(width * height * 4)
        const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat)
        return { data, texture }
    }, [])

    const pageVisibile = usePageVisible()

    const step = useMutableCallback(() => {
        /* update game state */
        gameOfLifeStep(state, nextState, width, height)
        state.set(nextState)
        nextState.fill(0)

        /* update texture */
        for (let i = 0; i < width * height; i++) {
            dataTexture.data[i * 4] = state[i] * 255
            dataTexture.data[i * 4 + 1] = 0
            dataTexture.data[i * 4 + 2] = 0
            dataTexture.data[i * 4 + 3] = 255

            dataTexture.texture.needsUpdate = true
        }
    })

    useEffect(() => {
        state.fill(0)
        nextState.fill(0)

        for (let i = 0; i < width * height; i++) {
            state[i] = Math.random() > 0.4 ? 1 : 0
        }

        step.current()
    }, [])

    const fixedTimeStep = useMemo(() => {
        return new FixedTimeStep({ timeStep: 1 / 5, maxSubSteps: 5, step: () => step.current() })
    }, [])

    useFrame(({ clock: { elapsedTime } }, delta) => {
        if (!pageVisibile) return

        fixedTimeStep.update(delta)

        time.current.value = elapsedTime
    })

    return (
        <shaderMaterial
            uniforms={{
                uState: { value: dataTexture.texture },
                uGameWidth: { value: width },
                uGameHeight: { value: height },
                uTime: time.current,
            }}
            vertexShader={gameOfLifeVertexShader}
            fragmentShader={gameOfLifeFragmentShader}
        />
    )
}

const Bunnies = (props: React.PropsWithChildren) => {
    const gltf = useGLTF(bunny)

    const material = useMemo(() => {
        return new THREE.MeshBasicMaterial()
    }, [])

    return (
        <Instances geometry={(gltf.nodes.mesh as THREE.Mesh).geometry} material={material}>
            {props.children}
        </Instances>
    )
}

type BunnyProps = ThreeElements['group'] & { color: THREE.ColorRepresentation }

const Bunny = ({ color, ...props }: BunnyProps) => {
    return (
        <group {...props}>
            <Instance color={color} />
        </group>
    )
}

const nBunnies = 80
const bunnyMinDistance = 5
const bunnyPositionRange = { min: new THREE.Vector2(-60, -20), max: new THREE.Vector2(60, 70) }
const bunnyColor = new THREE.Color(1.5, 1.5, 1.5)
const bunnies: { position: THREE.Vector3; color: THREE.ColorRepresentation; rotation: number }[] = []

const rand = (low: number, high: number) => Math.random() * (high - low) + low

for (let i = 0; i < nBunnies; i++) {
    let position: THREE.Vector3

    do {
        position = new THREE.Vector3(
            rand(bunnyPositionRange.min.x, bunnyPositionRange.max.x),
            0.9,
            rand(bunnyPositionRange.min.y, bunnyPositionRange.max.y),
        )
    } while (bunnies.some((bunny) => bunny.position.distanceTo(position) < bunnyMinDistance))

    const rotation = Math.random() * Math.PI * 2

    bunnies.push({ position, color: bunnyColor, rotation })
}

const CameraRig = () => {
    useFrame((state, delta) => {
        easing.damp3(
            state.camera.position,
            [10 + (state.pointer.x * state.viewport.width) / 8, (10 + state.pointer.y) / 3, 70],
            0.5,
            delta,
        )
        state.camera.lookAt(10, 12, 0)
    })

    return null
}

export default function Sketch() {
    return (
        <Canvas shadows dpr={[1, 1.5]}>
            {/* bunnies */}
            <Bunnies>
                {bunnies.map((bunny, i) => (
                    <Bunny key={i} position={bunny.position} color={bunny.color} rotation-y={bunny.rotation} />
                ))}
            </Bunnies>

            {/* floor */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 25]}>
                <planeGeometry args={[200, 100]} />
                <MeshReflectorMaterial
                    mirror={0}
                    blur={[300, 30]}
                    resolution={1024}
                    mixBlur={1}
                    mixStrength={80}
                    roughness={1}
                    depthScale={1.2}
                    minDepthThreshold={0.4}
                    maxDepthThreshold={1.4}
                    color="#999"
                    metalness={0.8}
                />
            </mesh>

            {/* screen */}
            <mesh position={[0, 74.5, -25]}>
                <planeGeometry args={[225, 150]} />
                <GameOfLifeMaterial width={200} height={150} />
            </mesh>

            {/* lights */}
            <hemisphereLight intensity={0.15} groundColor="black" />

            {/* background */}
            <color attach="background" args={['black']} />

            {/* effects */}
            <EffectComposer disableNormalPass>
                <Bloom luminanceThreshold={0} mipmapBlur luminanceSmoothing={5.0} intensity={3} />
            </EffectComposer>

            {/* camera */}
            <PerspectiveCamera makeDefault position={[20, 10, 80]} />
            <CameraRig />
        </Canvas>
    )
}
