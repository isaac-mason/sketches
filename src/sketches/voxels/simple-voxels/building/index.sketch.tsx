import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Color } from 'three'
import { create } from 'zustand'
import { Canvas } from '@/common'
import { CorePlugin, Vec3 } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes } from '../engine/culled-mesher'
import { createVoxelEngine } from '../engine/voxel-engine'

const PLUGINS = [CorePlugin, CulledMesherPlugin] as const

const { VoxelEngine, useVoxelEngine } = createVoxelEngine(PLUGINS)

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()

const tmpColor = new Color()

type ColorStore = { color: string; setColor: (color: string) => void }

const useColorStore = create<ColorStore>((set) => ({
    color: '#ff0000',
    setColor: (color: string) => set({ color }),
}))

const PointerBuildTool = ({ children }: { children: React.ReactNode }) => {
    const { voxelWorld, setBlock } = useVoxelEngine()

    const { color } = useColorStore()

    const onClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const origin = event.ray.origin.toArray()
        const direction = event.ray.direction.toArray()

        const ray = voxelWorld.traceRay(origin, direction)

        if (!ray.hit) return

        if (event.button === 2) {
            const block: Vec3 = [Math.floor(ray.hitPosition[0]), Math.floor(ray.hitPosition[1]), Math.floor(ray.hitPosition[2])]

            setBlock(block, { solid: false })
        } else {
            const block: Vec3 = [
                Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
            ]

            setBlock(block, {
                solid: true,
                color: tmpColor.set(color).getHex(),
            })
        }
    }

    return <group onPointerDown={onClick}>{children}</group>
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
    const { setBlock } = useVoxelEngine()

    useLayoutEffect(() => {
        // ground
        for (let x = -15; x < 15; x++) {
            for (let z = -15; z < 15; z++) {
                setBlock([x, 0, z], {
                    solid: true,
                    color: Math.random() > 0.5 ? green1 : green2,
                })
            }
        }
    }, [])

    return null
}

const CameraVoxelWorldActor = () => {
    const { voxelWorldActor } = useVoxelEngine()

    const camera = useThree((s) => s.camera)

    useFrame(() => {
        voxelWorldActor.position.copy(camera.position)
    })

    return null
}

export default () => {
    return (
        <>
            <Canvas camera={{ position: [20, 20, 20], near: 0.001 }}>
                <VoxelEngine>
                    <Level />

                    <PointerBuildTool>
                        <Bounds fit margin={1.5}>
                            <VoxelChunkCulledMeshes />
                        </Bounds>
                    </PointerBuildTool>

                    <CameraVoxelWorldActor />
                </VoxelEngine>

                <ambientLight intensity={0.6} />
                <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
                <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />

                <OrbitControls makeDefault />
            </Canvas>

            <ColorPicker />
        </>
    )
}
