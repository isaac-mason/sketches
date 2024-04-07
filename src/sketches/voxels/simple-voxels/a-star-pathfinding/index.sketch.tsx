import { Canvas } from '@/common'
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei'
import { useControls } from 'leva'
import { Generator, noise } from 'maath/random'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'
import { PointerBuildTool, PointerBuildToolColorPicker } from '../pointer-build-tool'
import { computePath } from './compute-path'

type PathProps = {
    start: THREE.Vector3
    goal: THREE.Vector3
    smooth?: boolean
    showExplored?: boolean
}

const Path = ({ start, goal, smooth, showExplored }: PathProps) => {
    const { voxels } = useVoxels()

    const [path, setPath] = useState<THREE.Vector3[]>([])
    const [explored, setExplored] = useState<THREE.Vector3[]>([])
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
        const result = computePath({ world, start, goal, smooth, earlyExit: { searchIterations: 1000 }, keepIntermediates: true })
        console.timeEnd('pathfinding')

        if (!result.success) {
            setPath([])
            return
        }

        const path: THREE.Vector3[] = []

        for (const node of result.path) {
            const next = new THREE.Vector3(node.position.x, node.position.y, node.position.z)
            next.addScalar(0.5)
            path.push(next)
        }

        setPath(path)

        const explored: THREE.Vector3[] = []

        for (const node of result.intermediates?.explored.values() ?? []) {
            const next = new THREE.Vector3(node.position.x, node.position.y, node.position.z)
            next.addScalar(0.5)
            explored.push(next)
        }

        setExplored(explored)
    }, [start.toArray().join(','), goal.toArray().join(','), version, smooth, showExplored])

    if (!path.length) return null

    return (
        <>
            {/* path */}
            <Line points={path} lineWidth={5} color="orange" />
            {path.map((point, i) => (
                <mesh key={i} position={point}>
                    <sphereGeometry args={[0.15, 16, 16]} />
                    <meshBasicMaterial color="orange" />
                </mesh>
            ))}

            {/* explored positions */}
            {showExplored &&
                explored.map((exploredPoint) => (
                    <mesh key={exploredPoint.toArray().join(',')} position={exploredPoint}>
                        <sphereGeometry args={[0.2, 16, 16]} />
                        <meshBasicMaterial color="lightblue" transparent opacity={0.5} />
                    </mesh>
                ))}
        </>
    )
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
                // const y = 0
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
    const { smooth, showExplored } = useControls('simple-voxels/a-star-pathfinding', {
        smooth: true,
        showExplored: true,
    })

    const {
        voxels: { world },
    } = useVoxels()
    const ready = useLevel()

    if (!ready) return null

    // find y position for start and end
    const start = new THREE.Vector3(10, 50, 10)
    const goal = new THREE.Vector3(-10, 50, 12)

    while (true) {
        if (world.solid(start)) {
            start.y++
            break
        }

        start.y--
    }

    while (true) {
        if (world.solid(goal)) {
            goal.y++
            break
        }

        goal.y--
    }

    return <Path start={start} goal={goal} smooth={smooth} showExplored={showExplored} />
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
