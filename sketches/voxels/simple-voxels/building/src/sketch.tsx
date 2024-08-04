import { Canvas } from '@/common'
import { Bounds, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { Color } from 'three'
import { PointerBuildTool, PointerBuildToolColorPicker } from '../../lib/pointer-build-tool'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../../lib/react'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()

const Level = () => {
    const { voxels } = useVoxels()

    useLayoutEffect(() => {
        // ground
        for (let x = -15; x < 15; x++) {
            for (let z = -15; z < 15; z++) {
                voxels.setBlock(
                    { x, y: 0, z },
                    {
                        solid: true,
                        color: Math.random() > 0.5 ? green1 : green2,
                    },
                )
            }
        }
    }, [])

    return null
}

const CameraVoxelWorldActor = () => {
    const { voxels } = useVoxels()

    const camera = useThree((s) => s.camera)

    useFrame(() => {
        voxels.actor.copy(camera.position)
    })

    return null
}

export function Sketch() {
    return (
        <>
            <Canvas camera={{ position: [20, 20, 20], near: 0.001 }}>
                <Bounds fit margin={1.5}>
                    <Voxels>
                        <Level />

                        <PointerBuildTool>
                            <VoxelChunkMeshes />
                        </PointerBuildTool>

                        <CameraVoxelWorldActor />
                    </Voxels>
                </Bounds>

                <ambientLight intensity={0.6} />
                <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
                <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />

                <OrbitControls makeDefault />
            </Canvas>

            <PointerBuildToolColorPicker />
        </>
    )
}
