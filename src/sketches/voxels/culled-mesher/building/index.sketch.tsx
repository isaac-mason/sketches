import { Bounds, OrbitControls } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'
import { useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { Color } from 'three'
import { create } from 'zustand'
import { Canvas } from '../../../../common'
import { CorePlugin, Vec3, traceRay } from '../../engine/core'
import { CulledMesherPlugin } from '../../engine/culled-mesher'
import { useVoxelEngine } from '../../engine/use-voxel-engine'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()

const tmpColor = new Color()

type ColorStore = { color: string; setColor: (color: string) => void }

const useColorStore = create<ColorStore>((set) => ({
    color: '#ff0000',
    setColor: (color: string) => set({ color }),
}))

const App = () => {
    const { world, voxelWorld, setBlock, CulledMeshes } = useVoxelEngine([CorePlugin, CulledMesherPlugin])

    const { color } = useColorStore()

    useEffect(() => {
        // ground
        for (let x = -15; x < 15; x++) {
            for (let z = -15; z < 15; z++) {
                setBlock([x, 0, z], {
                    solid: true,
                    color: Math.random() > 0.5 ? green1 : green2,
                })
            }
        }
    }, [world])

    const onClick = (event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation()

        const origin = event.ray.origin.toArray()
        const direction = event.ray.direction.toArray()

        const ray = traceRay(voxelWorld.isSolid, origin, direction)

        if (!ray.hit) return

        if (event.button === 2) {
            const block: Vec3 = [Math.floor(ray.hitPosition[0]), Math.floor(ray.hitPosition[1]), Math.floor(ray.hitPosition[2])]

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
                color: tmpColor.set(color).getHex(),
            })
        }
    }

    return (
        <>
            <Bounds fit margin={1.5}>
                <group onClick={onClick}>
                    <CulledMeshes />
                </group>
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
                bottom: '3em',
                left: '3em',
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