import { Canvas } from '@/common'
import sunsetEnvironment from '@pmndrs/assets/hdri/sunset.exr'
import { Environment, Html, OrbitControls } from '@react-three/drei'
import { useControls } from 'leva'
import { useCallback, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import * as THREE from 'three'
import { create } from 'zustand'
import { Flag } from './components/flag'
import { Floor } from './components/floor'
import { Rocks } from './components/rocks'
import { GridPathfindingProblemDefinition, MovementAction, PositionState, fScore } from './grid-pathfinding-problem'
import { Node, bestFirstGraphSearch } from './search'
import { Vec2 } from './vec2'

type PathfindingState = {
    start: Vec2
    setStart: (start: Vec2) => void

    goal: Vec2
    setGoal: (end: Vec2) => void

    levelSize: number
    setLevelSize: (levelSize: number) => void

    obstacles: Vec2[]
    setObstacles: (obstacles: Vec2[]) => void

    path?: Node<PositionState, MovementAction>[]
    setPath: (path?: Node<PositionState, MovementAction>[]) => void
}

const usePathfindingState = create<PathfindingState>((set) => ({
    start: { x: 0, y: 0 },
    setStart: (start) => set({ start }),

    goal: { x: 4, y: 4 },
    setGoal: (end) => set({ goal: end }),

    levelSize: 5,
    setLevelSize: (levelSize) => set({ levelSize }),

    obstacles: [
        {
            x: 1,
            y: 0,
        },
        {
            x: 1,
            y: 1,
        },
        {
            x: 1,
            y: 2,
        },
        {
            x: 3,
            y: 2,
        },
        {
            x: 3,
            y: 3,
        },
        {
            x: 3,
            y: 4,
        },
    ],
    setObstacles: (obstacles) => set({ obstacles }),

    path: undefined,
    setPath: (path) => set({ path }),
}))

const Level = () => {
    const { obstacles, setObstacles, levelSize } = usePathfindingState()

    const removeObstacle = useCallback(
        (obstacle: Vec2) => {
            setObstacles(obstacles.filter((o) => o.x !== obstacle.x || o.y !== obstacle.y))
        },
        [obstacles],
    )

    const addObstacle = useCallback(
        (obstacle: Vec2) => {
            setObstacles([...obstacles, obstacle])
        },
        [obstacles],
    )

    const elements = useMemo(() => {
        const elems: JSX.Element[] = []

        for (let x = 0; x < levelSize; x++) {
            for (let y = 0; y < levelSize; y++) {
                elems.push(
                    <Html
                        key={`label:${x},${y}`}
                        style={{ pointerEvents: 'none', color: 'white' }}
                        position={[x - levelSize / 2, 0, y - levelSize / 2]}
                        center
                    >
                        {`${x},${y}`}
                    </Html>,
                )
            }
        }

        for (let x = 0; x < levelSize; x++) {
            for (let y = 0; y < levelSize; y++) {
                if (obstacles.find((obstacle) => obstacle.x === x && obstacle.y === y)) continue

                elems.push(
                    <Floor
                        key={`floor:${x},${y}`}
                        position={[x - levelSize / 2, 0, y - levelSize / 2]}
                        scale={[0.9, 0.9, 0.9]}
                        onClick={() => addObstacle({ x, y })}
                    />,
                )
            }
        }

        for (const obstacle of obstacles) {
            elems.push(
                <Rocks
                    key={`obstacle:${obstacle.x},${obstacle.y}`}
                    position={[obstacle.x - levelSize / 2, 0, obstacle.y - levelSize / 2]}
                    scale={[0.9, 0.9, 0.9]}
                    onClick={() => removeObstacle({ x: obstacle.x, y: obstacle.y })}
                />,
            )
        }

        return elems
    }, [levelSize, obstacles, addObstacle, removeObstacle])

    return elements
}

const Path = () => {
    const { start, goal, path, levelSize } = usePathfindingState()

    const pathElements = useMemo(() => {
        if (!path) return null

        const meshes: JSX.Element[] = []

        for (let i = 0; i < path.length; i++) {
            const part = path[i]

            if (i === 0 || i === path.length - 1) {
                continue
            }
            let color: THREE.ColorRepresentation

            if (i === 0) {
                color = 'blue'
            } else {
                color = '#333'
            }

            meshes.push(
                <mesh
                    key={`${part.state.x},${part.state.y}`}
                    position={[part.state.x - levelSize / 2, 0, part.state.y - levelSize / 2]}
                >
                    <sphereGeometry args={[0.3, 16, 16]} />
                    <meshStandardMaterial color={color} />
                </mesh>,
            )
        }

        return meshes
    }, [path, levelSize])

    return (
        <>
            {/* start */}
            <mesh position={[start.x - levelSize / 2, 0, start.y - levelSize / 2]}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial color="blue" />
            </mesh>

            {/* goal */}
            <Flag position={[goal.x - levelSize / 2, 0, goal.y - levelSize / 2]} rotation-y={Math.PI} />

            {/* path */}
            {pathElements}
        </>
    )
}

const Configuration = () => {
    const { levelSize, setLevelSize, start, setStart, goal, setGoal } = usePathfindingState()

    useControls('grid-pathfinding-basic', {
        levelSize: {
            label: 'Level Size',
            value: levelSize,
            onChange: (levelSize) => setLevelSize(levelSize),
            step: 1,
            min: 5,
            max: 10,
        },
        start: {
            label: 'Start',
            value: start,
            onChange: (start) => setStart(start),
            step: 1,
            joystick: false,
        },
        goal: {
            label: 'Goal',
            value: goal,
            onChange: (end) => setGoal(end),
            step: 1,
            joystick: false,
        },
    })

    return null
}

const Info = styled.div`
    position: absolute;
    bottom: 2em;
    left: 0;
    width: 100%;
    padding: 0 2em;
    text-align: center;
    color: white;
`

export default () => {
    const { start, goal, levelSize, obstacles, setPath } = usePathfindingState()

    useEffect(() => {
        const problem = new GridPathfindingProblemDefinition(start, goal, levelSize, obstacles)

        const node = bestFirstGraphSearch(problem, fScore)

        const path = node?.path() ?? []

        setPath(path)
    }, [start, goal, levelSize, obstacles])

    return (
        <>
            <Canvas camera={{ position: [0, 5, 3] }}>
                <Level />

                <Path />

                <Configuration />

                <Environment files={sunsetEnvironment} />

                <OrbitControls makeDefault target={[-0.5, 0, 0]} />
            </Canvas>

            <Info>
                <p>
                    Pathfinding from {start.x},{start.y} to {goal.x},{goal.y}
                </p>
                <p>Click on the floor to add and remove obstacles.</p>
                <p>Use the controls to change the initial position, the goal, and the level size.</p>
            </Info>
        </>
    )
}
