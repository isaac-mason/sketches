import { Canvas } from '@/common'
import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Color } from 'three'
import { create } from 'zustand'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()

const tmpColor = new Color()

type ColorStore = { color: string; setColor: (color: string) => void }

const useColorStore = create<ColorStore>((set) => ({
    color: '#ff0000',
    setColor: (color: string) => set({ color }),
}))

const PointerBuildTool = ({ children }: { children: React.ReactNode }) => {
    const { voxels } = useVoxels()

    const { color } = useColorStore()

    const onClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const origin = event.ray.origin
        const direction = event.ray.direction

        const ray = voxels.world.raycast({ origin, direction })

        if (!ray.hit) return

        if (event.button === 2) {
            const block = ray.hitPosition.floor()

            voxels.setBlock(block, { solid: false })
        } else {
            const block = ray.hitPosition.add(ray.hitNormal).floor()

            voxels.setBlock(block, {
                solid: true,
                color: tmpColor.set(color).getHex(),
            })
        }
    }

    return <scene onPointerDown={onClick}>{children}</scene>
}

const ColorPicker = () => {
    const { color, setColor } = useColorStore()

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '3em',
                left: '3em',
            }}
        >
            <HexColorPicker className="picker" color={color} onChange={(c) => setColor(c)} />
        </div>
    )
}

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

export default () => {
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

            <ColorPicker />
        </>
    )
}
