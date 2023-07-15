import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { HexColorPicker } from 'react-colorful'
import { Color } from 'three'
import { create } from 'zustand'
import { Canvas } from '../../../../common'
import { Vec3, VoxelUtils, createVoxelWorld } from '../culled-mesher-voxel-world'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()

const tmpColor = new Color()

type ColorStore = { color: string; setColor: (color: string) => void }

const useColorStore = create<ColorStore>((set) => ({
    color: '#ff0000',
    setColor: (color: string) => set({ color }),
}))

const { world, updateVoxelChunkMeshes, useVoxelWorld } = createVoxelWorld()

// ground
for (let x = -15; x < 15; x++) {
    for (let z = -15; z < 15; z++) {
        world.setBlock([x, 0, z], {
            solid: true,
            color: Math.random() > 0.5 ? green1 : green2,
        })
    }
}

updateVoxelChunkMeshes()

const App = () => {
    const { world, chunkMeshes } = useVoxelWorld()

    const { color } = useColorStore()

    const onClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const origin = event.ray.origin.toArray()
        const direction = event.ray.direction.toArray()

        const ray = VoxelUtils.traceRay(world, origin, direction)

        if (ray.hit) {
            if (event.button === 2) {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0]),
                    Math.floor(ray.hitPosition[1]),
                    Math.floor(ray.hitPosition[2]),
                ]

                world.setBlock(block, {
                    solid: false,
                })
            } else {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                    Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                    Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
                ]

                world.setBlock(block, {
                    solid: true,
                    color: tmpColor.set(color).getHex(),
                })
            }
        }
    }

    return (
        <>
            <Bounds fit margin={1.5}>
                {chunkMeshes.map((chunkMesh) => (
                    <primitive key={chunkMesh.mesh.id} object={chunkMesh.mesh} onPointerDown={onClick} />
                ))}
            </Bounds>

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
        </>
    )
}

const ColorPicker = () => {
    const { color, setColor } = useColorStore()

    return (
        <div
            style={{
                position: 'absolute',
                bottom: '2em',
                left: '2em',
            }}
        >
            <HexColorPicker className="picker" color={color} onChange={(c) => setColor(c)} />
        </div>
    )
}

export default () => {
    return (
        <>
            <Canvas camera={{ position: [20, 20, 20], near: 0.001 }}>
                <App />

                <OrbitControls makeDefault />
            </Canvas>

            <ColorPicker />
        </>
    )
}
