import { noise } from 'maath/random'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { BlockValue, CorePlugin, Vec3 } from './engine/core'
import { useVoxelEngine } from './engine/voxel-engine'

const green1 = new THREE.Color('green').addScalar(-0.02).getHex()
const green2 = new THREE.Color('green').addScalar(0.02).getHex()
const brown = new THREE.Color('brown').getHex()

type SetBlockFn = (pos: Vec3, value: BlockValue) => void

const tree = (set: SetBlockFn, base: Vec3) => {
    const [treeX, treeY, treeZ] = base

    // trunk
    for (let y = 0; y < 10; y++) {
        set([treeX, treeY + y, treeZ], {
            solid: true,
            color: brown,
        })
    }

    // leaves
    const radius = 5
    const center = [0, radius, 0]

    for (let x = -radius; x < radius; x++) {
        for (let y = -radius; y < radius; y++) {
            for (let z = -radius; z < radius; z++) {
                const position: Vec3 = [x, y, z]
                const distance = Math.sqrt(position[0] ** 2 + position[1] ** 2 + position[2] ** 2)

                if (distance < radius) {
                    const block: Vec3 = [center[0] + x + treeX, center[1] + y + 5 + treeY, center[2] + z + treeZ]

                    set(block, {
                        solid: true,
                        color: Math.random() > 0.5 ? green1 : green2,
                    })
                }
            }
        }
    }
}

export const useSimpleLevel = () => {
    const [ready, setReady] = useState(false)

    const { voxelWorld } = useVoxelEngine<[CorePlugin]>()

    useEffect(() => {
        const size = 200
        const halfSize = size / 2

        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                let y = Math.floor(noise.simplex2(x / 150, z / 150) * 10)
                y += Math.floor(noise.simplex2(x / 75, z / 75) * 5)

                const color = Math.random() > 0.5 ? green1 : green2

                for (let i = y; i >= -15; i--) {
                    voxelWorld.setBlock([x, i, z], {
                        solid: true,
                        color,
                    })
                }

                // random chance to place a tree
                if (Math.random() < 0.002) {
                    tree(voxelWorld.setBlock, [x, y, z])
                }
            }
        }

        setReady(true)
    }, [])

    return ready
}

export const SimpleLevel = () => {
    useSimpleLevel()

    return null
}
