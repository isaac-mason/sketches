import { Canvas, Crosshair } from '@/common'
import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { CameraBuildTool } from '../camera-build-tool'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'
import { SimpleLevel } from '../simple-level'
import { useControls } from 'leva'

const SKETCH = 'simple-voxels/fly-controls'

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
    const { voxels } = useVoxels()

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

        voxels.actor.copy(position.current)
    })

    return null
}

export default function Sketch() {
    const { chunkHelper } = useControls(SKETCH, {
        chunkHelper: false,
    })

    return (
        <>
            <Crosshair />

            <Canvas camera={{ near: 0.001 }}>
                <Voxels>
                    <VoxelChunkMeshes chunkHelper={chunkHelper} />

                    <SimpleLevel />

                    <PointerLockControls makeDefault />
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
                        <Player />
                    </KeyboardControls>

                    <CameraBuildTool />
                </Voxels>

                <ambientLight intensity={0.6} />
                <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
                <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />
            </Canvas>
        </>
    )
}
