import { Canvas } from '@/common'
import { Line, OrbitControls, PerspectiveCamera, PivotControls } from '@react-three/drei'
import { useControls } from 'leva'
import { Generator, noise } from 'maath/random'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { PointerBuildTool, PointerBuildToolColorPicker } from '../../lib/pointer-build-tool'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../../lib/react'
import { SearchType, computePath } from './compute-path'

type PathProps = {
    start: THREE.Vector3
    goal: THREE.Vector3
    smooth: boolean
    showExplored: boolean
    earlyExitSearchIterations: number
    searchType: 'greedy' | 'shortest'
}

const Path = ({ start, goal, smooth, showExplored, earlyExitSearchIterations, searchType }: PathProps) => {
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
        const result = computePath({
            world,
            start,
            goal,
            smooth,
            earlyExit: { searchIterations: earlyExitSearchIterations },
            keepIntermediates: true,
            searchType,
        })
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
    }, [
        start.toArray().join(','),
        goal.toArray().join(','),
        version,
        smooth,
        showExplored,
        earlyExitSearchIterations,
        searchType,
    ])

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

const green = new THREE.Color('green').getHex()
const _color = new THREE.Color()

const _cursor = new THREE.Vector3()

const randomSeed = 42

const useLevel = () => {
    const { voxels } = useVoxels()

    const [ready, setReady] = useState(false)

    const generator = useMemo(() => new Generator(randomSeed), [])
    const random = () => generator.value()

    useEffect(() => {
        generator.init(randomSeed)

        const size = 500
        const halfSize = size / 2

        for (let x = -halfSize; x < halfSize; x++) {
            for (let z = -halfSize; z < halfSize; z++) {
                let y = 0
                y += Math.floor(noise.simplex2(x / 100, z / 100) * 10)
                y += Math.floor(noise.simplex2(x / 50, z / 50) * 5)
                y += Math.floor(noise.simplex2(x / 25, z / 25) * 2)

                for (let i = y; i >= -20; i--) {
                    const color = _color.set(green)
                    color.addScalar(random() * 0.04 - 0.02)

                    const cursor = _cursor.set(x, i, z)

                    voxels.setBlock(cursor, {
                        solid: true,
                        color: color.getHex(),
                    })
                }
            }
        }

        setReady(true)
    }, [])

    return ready
}

type LevelProps = {
    children: React.ReactNode
}

const Level = ({ children }: LevelProps) => {
    const ready = useLevel()

    if (!ready) return null

    return <>{children}</>
}

type PositionPickerProps = {
    position: THREE.Vector3Tuple
    onChange: (position: THREE.Vector3) => void
}

const PositionPicker = ({ position: initial, onChange }: PositionPickerProps) => {
    const ref = useRef<THREE.Object3D>(null!)

    const [position] = useState<THREE.Vector3Tuple>(initial)

    const onDrag = () => {
        if (!ref.current) return

        const worldPosition = ref.current.getWorldPosition(new THREE.Vector3())
        worldPosition.floor()

        onChange(worldPosition)
    }

    return (
        <PivotControls offset={position} scale={20} disableRotations activeAxes={[true, false, true]} onDrag={onDrag}>
            <object3D position={position} ref={ref} />
        </PivotControls>
    )
}

const Scene = () => {
    const {
        voxels: { world },
    } = useVoxels()

    const { smooth, showExplored, earlyExitSearchIterations, searchType } = useControls('simple-voxels/a-star-pathfinding', {
        smooth: true,
        showExplored: true,
        earlyExitSearchIterations: {
            value: 1000,
            min: 0,
            max: 10000,
            step: 1,
        },
        searchType: {
            value: 'greedy',
            options: ['greedy', 'shortest'],
        },
    })

    const [start, setStart] = useState<THREE.Vector3>(new THREE.Vector3(20, 20, 20))
    const [goal, setGoal] = useState<THREE.Vector3>(new THREE.Vector3(-20, 20, -20))

    // find y position for start and end
    const adjustedStart = start.clone()
    const adjustedGoal = goal.clone()

    for (let i = 0; i < 200; i++) {
        if (world.getSolid(adjustedStart)) {
            adjustedStart.y++
            break
        }

        adjustedStart.y--
    }

    for (let i = 0; i < 200; i++) {
        if (world.getSolid(adjustedGoal)) {
            adjustedGoal.y++
            break
        }

        adjustedGoal.y--
    }

    return (
        <>
            <PositionPicker position={start?.toArray()} onChange={setStart} />
            <PositionPicker position={goal?.toArray()} onChange={setGoal} />

            <mesh position={adjustedStart}>
                <meshBasicMaterial color="red" />
                <sphereGeometry args={[0.5, 16, 16]} />
            </mesh>

            <mesh position={adjustedGoal}>
                <meshBasicMaterial color="blue" />
                <sphereGeometry args={[0.5, 16, 16]} />
            </mesh>

            <Path
                start={adjustedStart}
                goal={adjustedGoal}
                smooth={smooth}
                earlyExitSearchIterations={earlyExitSearchIterations}
                showExplored={showExplored}
                searchType={searchType as SearchType}
            />
        </>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <Voxels>
                    <Level>
                        <Scene />
                    </Level>

                    <PointerBuildTool>
                        <VoxelChunkMeshes />
                    </PointerBuildTool>
                </Voxels>

                <PerspectiveCamera makeDefault position={[100, 100, -10]} />
                <OrbitControls makeDefault />

                <ambientLight intensity={1.5} />
            </Canvas>

            <PointerBuildToolColorPicker />
        </>
    )
}
