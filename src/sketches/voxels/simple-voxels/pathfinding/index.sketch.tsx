import { Canvas } from '@/common'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'
import { PointerBuildTool, PointerBuildToolColorPicker } from '../pointer-build-tool'
import { bestFirstGraphSearch } from './search'
import { VoxelPathfindingProblem, fScore } from './voxel-pathfinding-problem'

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

        const problem = new VoxelPathfindingProblem(world)
        problem.start.set(...start)
        problem.end.set(...end)

        if (world.solid(problem.start) || world.solid(problem.end)) {
            setPath([])
            return
        }

        const node = bestFirstGraphSearch(problem, fScore)

        if (!node) {
            setPath([])
            return
        }

        const solutionPath = node.path()

        const path: THREE.Vector3[] = []

        for (const node of solutionPath) {
            const next = new THREE.Vector3(node.state.x, node.state.y, node.state.z)
            next.addScalar(0.5)
            path.push(next)
        }

        setPath(path)
    }, [start.join(','), end.join(','), version])

    return path.length > 0 && <Line points={path} lineWidth={5} color="orange" />
}

const greenOne = new THREE.Color('green').getHex()
const greenTwo = new THREE.Color('green').addScalar(0.1).getHex()

const useScene = () => {
    const [ready, setReady] = useState(false)

    const { voxels } = useVoxels()

    useEffect(() => {
        for (let x = -15; x < 15; x++) {
            for (let z = -15; z < 15; z++) {
                voxels.setBlock(
                    { x, y: 0, z },
                    {
                        solid: true,
                        color: Math.random() > 0.5 ? greenOne : greenTwo,
                    },
                )
            }
        }

        for (let z = -10; z < 10; z++) {
            voxels.setBlock({ x: 0, y: 1, z }, { solid: true, color: 0xff0000 })
            voxels.setBlock({ x: 0, y: 2, z }, { solid: true, color: 0xff0000 })
        }

        voxels.setBlock({ x: -1, y: 1, z: 5 }, { solid: true, color: 0xff0000 })
        voxels.setBlock({ x: 1, y: 1, z: 5 }, { solid: true, color: 0xff0000 })

        setReady(true)
    }, [])

    return ready
}

const Scene = () => {
    const ready = useScene()

    if (!ready) return null

    return <Path start={[-10, 1, 0]} end={[10, 1, 0]} />
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

                <PerspectiveCamera makeDefault position={[3, 30, 10]} />
                <OrbitControls makeDefault />

                <ambientLight intensity={1.5} />
            </Canvas>

            <PointerBuildToolColorPicker />
        </>
    )
}
