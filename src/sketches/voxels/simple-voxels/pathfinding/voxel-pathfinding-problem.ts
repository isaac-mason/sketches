import * as THREE from 'three'
import { World } from '../lib/world'
import { Node, ProblemDefinition } from './search'

type VoxelPathfindingState = { x: number; y: number; z: number; dedupe: string }

type VoxelPathfindingAction = { x: number; y: number; z: number; cost: number }

const getDedupeKey = (v: THREE.Vector3Like) => `${v.x},${v.y},${v.z}`

const createState = (v: THREE.Vector3Like): VoxelPathfindingState => {
    return { ...v, dedupe: getDedupeKey(v) }
}

const directions = [
    [-1, 0, 0],
    [-1, 1, 0],
    [-1, -1, 0],
    [1, 0, 0],
    [1, 1, 0],
    [1, -1, 0],
    [0, 0, -1],
    [0, 1, -1],
    [0, -1, -1],
    [0, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
]

const _nextPosition = new THREE.Vector3()

const _distanceStart = new THREE.Vector3()
const _distanceEnd = new THREE.Vector3()

export class VoxelPathfindingProblem implements ProblemDefinition<VoxelPathfindingState, VoxelPathfindingAction> {
    start = new THREE.Vector3()
    end = new THREE.Vector3()

    constructor(public world: World) {}

    initial(): VoxelPathfindingState {
        return createState(this.start)
    }

    goalTest(state: VoxelPathfindingState): boolean {
        return state.dedupe === getDedupeKey(this.end)
    }

    apply(state: VoxelPathfindingState, action: VoxelPathfindingAction): VoxelPathfindingState {
        return createState(_nextPosition.copy(state).add(action))
    }

    pathCost(cost: number, _start: VoxelPathfindingState, action: VoxelPathfindingAction, _end: VoxelPathfindingState): number {
        return cost + action.cost + 1
    }

    canGoThrough(height: number, x: number, y: number, z: number): boolean {
        for (let h = 0; h < height; h++) {
            if (this.world.solid({ x, y: y + h, z })) {
                return false
            }
        }
        return true
    }

    canStepAt(height: number, x: number, y: number, z: number): boolean {
        if (!this.world.solid({ x, y: y - 1, z })) {
            return false
        }

        return this.canGoThrough(height, x, y, z)
    }

    actions(state: VoxelPathfindingState): VoxelPathfindingAction[] {
        const actions: VoxelPathfindingAction[] = []

        const height = 3

        for (const [xDir, yDir, zDir] of directions) {
            const x = state.x + xDir
            const y = state.y + yDir
            const z = state.z + zDir

            if (this.canStepAt(height, x, y, z)) {
                const cost = yDir === 0 ? 1 : 2
                actions.push({ x: xDir, y: yDir, z: zDir, cost })
            }
        }

        return actions
    }
}

const distanceHeuristic = (start: THREE.Vector3Like, end: THREE.Vector3Like) => {
    return _distanceStart.copy(start).distanceTo(_distanceEnd.copy(end))
}

export const fScore = (problemDefinition: VoxelPathfindingProblem, node: Node<VoxelPathfindingState, VoxelPathfindingAction>) => {
    return node.pathCost + distanceHeuristic(node.state, problemDefinition.end)
}
