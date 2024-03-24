import { ThreeEvent } from '@react-three/fiber'
import { HexColorPicker } from 'react-colorful'
import * as THREE from 'three'
import { create } from 'zustand'
import { useVoxels } from './lib/react'

const _color = new THREE.Color()

type ColorStore = { color: string; setColor: (color: string) => void }

const useColorStore = create<ColorStore>((set) => ({
    color: '#ff0000',
    setColor: (color: string) => set({ color }),
}))

export const PointerBuildTool = ({ children }: { children: React.ReactNode }) => {
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
                color: _color.set(color).getHex(),
            })
        }
    }

    return <scene onPointerDown={onClick}>{children}</scene>
}

export const PointerBuildToolColorPicker = () => {
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
