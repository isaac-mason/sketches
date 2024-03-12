import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { styled } from 'styled-components'
import { Color, Vector3 } from 'three'
import { Canvas } from '@/common'
import { CorePlugin, Vec3 } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes } from '../engine/culled-mesher'
import { createVoxelEngine } from '../engine/voxel-engine'
import { SimpleLevel } from '../simple-level'

const PLUGINS = [CorePlugin, CulledMesherPlugin] as const

const { VoxelEngine, useVoxelEngine } = createVoxelEngine(PLUGINS)

const orange = new Color('orange').getHex()

const frontVector = new Vector3()
const sideVector = new Vector3()
const direction = new Vector3()

type Input = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    ascend: boolean
    descend: boolean
}

const Player = () => {
    const { voxelWorldActor } = useVoxelEngine()

    const position = useRef<Vector3>(new Vector3(0, 30, 0))

    const [, getControls] = useKeyboardControls()

    const camera = useThree((s) => s.camera)

    useFrame((_, delta) => {
        const t = 1.0 - Math.pow(0.01, delta)

        const { forward, backward, left, right, ascend, descend } = getControls() as Input

        frontVector.set(0, 0, Number(backward) - Number(forward))
        sideVector.set(Number(left) - Number(right), 0, 0)

        direction.subVectors(frontVector, sideVector).normalize().applyEuler(camera.rotation)
        direction.y += Number(ascend) - Number(descend)
        direction.multiplyScalar(5 * t)

        position.current.add(direction)

        camera.position.lerp(position.current, t * 2)

        voxelWorldActor.position.copy(position.current)
    })

    return null
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

const App = () => {
    return (
        <>
            <SimpleLevel />

            <Player />

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
                    { name: 'ascend', keys: [' '] },
                    { name: 'descend', keys: ['Shift'] },
                ]}
            >
                <Canvas camera={{ near: 0.001 }}>
                    <VoxelEngine>
                        <App />
                    </VoxelEngine>
                    <PointerLockControls makeDefault />
                </Canvas>
            </KeyboardControls>
        </>
    )
}
