import { Generator, noise } from 'maath/random'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { useVoxels } from './react'

const green1 = new THREE.Color('green').addScalar(-0.02).getHex()
const green2 = new THREE.Color('green').addScalar(0.02).getHex()
const brown = new THREE.Color('brown').getHex()

const _groundPosition = new THREE.Vector3()
const _treeBasePosition = new THREE.Vector3()
const _treePosition = new THREE.Vector3()

const randomSeed = 42
export const useSimpleLevel = () => {
    const { voxels } = useVoxels()

    const [ready, setReady] = useState(false)

    const generator = useMemo(() => new Generator(randomSeed), [])
    const random = () => generator.value()

    const tree = (base: THREE.Vector3Like) => {
        const { x: treeX, y: treeY, z: treeZ } = base

        // trunk
        for (let y = 0; y < 10; y++) {
            const treeTrunkPosition = _treePosition.set(treeX, treeY + y, treeZ)
            voxels.setBlock(treeTrunkPosition.x, treeTrunkPosition.y, treeTrunkPosition.z, true, brown)
        }

        // leaves
        const radius = 5
        const center = [0, radius, 0]

        for (let x = -radius; x < radius; x++) {
            for (let y = -radius; y < radius; y++) {
                for (let z = -radius; z < radius; z++) {
                    const position = { x, y, z }
                    const distance = Math.sqrt(position.x ** 2 + position.y ** 2 + position.z ** 2)

                    if (distance < radius) {
                        const treeLeavesPosition = _treePosition.set(
                            center[0] + x + treeX,
                            center[1] + y + 5 + treeY,
                            center[2] + z + treeZ,
                        )
                        const color = random() > 0.5 ? green1 : green2
                        voxels.setBlock(treeLeavesPosition.x, treeLeavesPosition.y, treeLeavesPosition.z, true, color)
                    }
                }
            }
        }
    }

    useEffect(() => {
        generator.init(randomSeed)

        const size = 200
        const halfSize = size / 2

        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                let y = Math.floor(noise.simplex2(x / 150, z / 150) * 10)
                y += Math.floor(noise.simplex2(x / 75, z / 75) * 5)

                const color = random() > 0.5 ? green1 : green2

                for (let i = y; i >= -15; i--) {
                    const position = _groundPosition.set(x, i, z)

                    voxels.setBlock(position.x, position.y, position.z, true, color)
                }

                // random chance to place a tree
                if (random() < 0.002) {
                    const treeBase = _treeBasePosition.set(x, y, z)
                    tree(treeBase)
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
