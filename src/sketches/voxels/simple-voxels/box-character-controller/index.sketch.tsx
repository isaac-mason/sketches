import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo } from 'react'
import { styled } from 'styled-components'
import { Color, PerspectiveCamera, Vector3 } from 'three'
import { Canvas } from '@/common'
import {
    BoxCharacterController,
    BoxCharacterControllerCameraMode,
    BoxCharacterControllerPlugin,
} from '../engine/box-character-controller'
import { CorePlugin, Vec3 } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes } from '../engine/culled-mesher'
import { createVoxelEngine } from '../engine/voxel-engine'
import { useSimpleLevel } from '../simple-level'

const PLUGINS = [CorePlugin, CulledMesherPlugin, BoxCharacterControllerPlugin] as const

const { VoxelEngine, useVoxelEngine } = createVoxelEngine(PLUGINS)

type Input = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
}

const orange = new Color('orange').getHex()

const Camera = () => {
    const {
        react: { Entity },
    } = useVoxelEngine()

    const camera = useThree((s) => s.camera)

    const cameraConfiguration = useMemo(() => {
        return { mode: 'first-person' as BoxCharacterControllerCameraMode }
    }, [])

    useControls('voxel-box-character-controller-camera', {
        cameraMode: {
            value: cameraConfiguration.mode,
            options: ['first-person', 'third-person'],
            onChange: (value: BoxCharacterControllerCameraMode) => {
                cameraConfiguration.mode = value
            },
        },
    })

    return (
        <Entity
            boxCharacterControllerCamera={camera as PerspectiveCamera}
            boxCharacterControllerCameraConfiguration={cameraConfiguration}
        />
    )
}

const CameraBuildTool = () => {
    const { voxelWorld, setBlock } = useVoxelEngine()

    const gl = useThree((s) => s.gl)
    const camera = useThree((s) => s.camera)

    useEffect(() => {
        const vec3 = new Vector3()

        const onClick = (event: MouseEvent) => {
            const origin = camera.position.toArray()
            const direction = camera.getWorldDirection(vec3).toArray()

            const ray = voxelWorld.traceRay(origin, direction)

            if (!ray.hit) return

            if (event.button === 0) {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0]),
                    Math.floor(ray.hitPosition[1]),
                    Math.floor(ray.hitPosition[2]),
                ]

                setBlock(block, {
                    solid: false,
                })
            } else {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                    Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                    Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
                ]

                setBlock(block, {
                    solid: true,
                    color: orange,
                })
            }
        }

        gl.domElement.addEventListener('mousedown', onClick)

        return () => {
            gl.domElement.removeEventListener('mousedown', onClick)
        }
    }, [gl])

    return null
}

const Player = () => {
    const {
        react: { Entity, Component },
    } = useVoxelEngine()

    const [, getControls] = useKeyboardControls()

    const { width, height } = useControls('voxel-box-character-controller', {
        width: 0.8,
        height: 3,
    })

    const options = useMemo(
        () => ({
            width,
            height,
            initialPosition: new Vector3(0, 30, 0), // fall from the sky!
        }),
        [width, height],
    )

    const input: Input = useMemo(
        () => ({
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
        }),
        [],
    )

    useFrame(() => {
        const { forward, backward, left, right, jump, sprint } = getControls() as Input

        input.forward = forward
        input.backward = backward
        input.left = left
        input.right = right
        input.jump = jump
        input.sprint = sprint
    })

    const boxCharacterController = useMemo(() => {
        return new BoxCharacterController(options)
    }, [width, height])

    return (
        <Entity boxCharacterControllerInput={input} boxCharacterController={boxCharacterController}>
            <Component name="object3D">
                <mesh>
                    <boxGeometry args={[width, height, width]} />
                    <meshStandardMaterial color="red" />
                </mesh>
            </Component>
        </Entity>
    )
}

const App = () => {
    const levelReady = useSimpleLevel()

    return (
        <>
            {levelReady && <Player />}

            <Camera />

            <CameraBuildTool />

            <VoxelChunkCulledMeshes />

            <ambientLight intensity={0.6} />
            <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
            <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />
        </>
    )
}

const Crosshair = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate3d(-50%, -50%, 0);
    border: 2px solid white;
    z-index: 100;
`

export default () => {
    return (
        <>
            <Crosshair />

            <KeyboardControls
                map={[
                    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                    { name: 'jump', keys: ['Space'] },
                    { name: 'sprint', keys: ['ShiftLeft'] },
                ]}
            >
                <Canvas>
                    <VoxelEngine>
                        <App />
                    </VoxelEngine>
                    <PointerLockControls makeDefault />
                </Canvas>
            </KeyboardControls>
        </>
    )
}
