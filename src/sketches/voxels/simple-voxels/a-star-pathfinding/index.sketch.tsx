import { Canvas } from '@/common'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { Generator, noise } from 'maath/random'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'
import { PointerBuildTool, PointerBuildToolColorPicker } from '../pointer-build-tool'
import { computePath } from './compute-path'

type PathProps = {
    start: THREE.Vector3Tuple
    end: THREE.Vector3Tuple
}

const Path = ({ start, end }: PathProps) => {
    const { voxels } = useVoxels()

    const [path, setPath] = useState<THREE.Vector3[]>([])
    const [version, setVersion] = useState(0)

    useEffect(
        voxels.onUpdate.add(() => {
            setVersion((v) => v + 1)
        }),
        [],
    )

    useEffect(() => {
        const { world } = voxels

        console.time('pathfinding')
        const result = computePath(world, new THREE.Vector3(...start), new THREE.Vector3(...end))
        console.timeEnd('pathfinding')

        if (!result) {
            setPath([])
            return
        }

        const path: THREE.Vector3[] = []

        for (const node of result) {
            const next = new THREE.Vector3(node.position.x, node.position.y, node.position.z)
            next.addScalar(0.5)
            path.push(next)
        }

        setPath(path)
    }, [start.join(','), end.join(','), version])

    return path.length > 0 && <Line points={path} lineWidth={5} color="orange" />
}

const green1 = new THREE.Color('green').addScalar(-0.02).getHex()
const green2 = new THREE.Color('green').addScalar(0.02).getHex()
const _groundPosition = new THREE.Vector3()

const randomSeed = 42
const useLevel = () => {
    const { voxels } = useVoxels()

    const [ready, setReady] = useState(false)

    const generator = useMemo(() => new Generator(randomSeed), [])
    const random = () => generator.value()

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

                    voxels.setBlock(position, {
                        solid: true,
                        color,
                    })
                }
            }
        }

        setReady(true)
    }, [])

    return ready
}

const Scene = () => {
    const {
        voxels: { world },
    } = useVoxels()
    const ready = useLevel()

    if (!ready) return null

    const start = new THREE.Vector3(10, 50, 10)
    const end = new THREE.Vector3(-10, 50, -10)

    while (true) {
        if (world.solid(start)) {
            start.y++
            break
        }

        start.y--
    }

    while (true) {
        if (world.solid(end)) {
            end.y++
            break
        }

        end.y--
    }

    return <Path start={start.toArray()} end={end.toArray()} />
}

export default function Sketch() {
    return (
        <>
            <Canvas>
                <Voxels>
                    <Scene />

                    <PointerBuildTool>
                        <VoxelChunkMeshes />
                    </PointerBuildTool>
                </Voxels>

                <PerspectiveCamera makeDefault position={[50, 30, -10]} />
                <OrbitControls makeDefault />

                <ambientLight intensity={1.5} />
            </Canvas>

            <PointerBuildToolColorPicker />
        </>
    )
}
