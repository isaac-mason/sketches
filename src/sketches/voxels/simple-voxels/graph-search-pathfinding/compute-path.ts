import * as THREE from 'three'
import { World } from '../lib/world'
import { sweep } from './sweep'

class PriorityQueue<T> {
    heap: { element: T; priority: number }[] = []

    enqueue(element: T, priority: number): void {
        this.heap.push({ element, priority })
        this.heapifyUp(this.heap.length - 1)
    }

    dequeue(): T | undefined {
        if (this.heap.length === 0) {
            return undefined
        }

        const first = this.heap[0]
        const last = this.heap.pop()!

        if (this.heap.length > 0) {
            this.heap[0] = last
            this.heapifyDown(0)
        }

        return first.element
    }

    private heapifyUp(index: number): void {
        const parentIndex = Math.floor((index - 1) / 2)

        if (parentIndex >= 0 && this.heap[parentIndex].priority > this.heap[index].priority) {
            this.swap(index, parentIndex)
            this.heapifyUp(parentIndex)
        }
    }

    private heapifyDown(index: number): void {
        const leftChildIndex = 2 * index + 1
        const rightChildIndex = 2 * index + 2
        let smallestIndex = index

        if (leftChildIndex < this.heap.length && this.heap[leftChildIndex].priority < this.heap[smallestIndex].priority) {
            smallestIndex = leftChildIndex
        }

        if (rightChildIndex < this.heap.length && this.heap[rightChildIndex].priority < this.heap[smallestIndex].priority) {
            smallestIndex = rightChildIndex
        }

        if (smallestIndex !== index) {
            this.swap(index, smallestIndex)
            this.heapifyDown(smallestIndex)
        }
    }

    private swap(i: number, j: number): void {
        const temp = this.heap[i]
        this.heap[i] = this.heap[j]
        this.heap[j] = temp
    }
}

const canGoThrough = (world: World, height: number, x: number, y: number, z: number): boolean => {
    for (let h = 0; h < height; h++) {
        if (world.solid({ x, y: y + h, z })) {
            return false
        }
    }
    return true
}

const canStepAt = (world: World, height: number, x: number, y: number, z: number): boolean => {
    if (!world.solid({ x, y: y - 1, z })) {
        return false
    }

    return canGoThrough(world, height, x, y, z)
}

const directions: THREE.Vector3[] = [
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(-1, 1, 0),
    new THREE.Vector3(-1, -1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(1, 1, 0),
    new THREE.Vector3(1, -1, 0),
    new THREE.Vector3(0, 0, -1),
    new THREE.Vector3(0, 1, -1),
    new THREE.Vector3(0, -1, -1),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 1, 1),
    new THREE.Vector3(0, -1, 1),
]

type Action = { cost: number; direction: THREE.Vector3; newPosition: THREE.Vector3; jump: boolean; drop: boolean }

const _actionDirection = new THREE.Vector3()

const agentHeight = 2

const actions = (world: World, position: THREE.Vector3Like) => {
    const actions: Action[] = []

    for (const direction of directions) {
        _actionDirection.copy(position).add(direction)
        const x = _actionDirection.x
        const y = _actionDirection.y
        const z = _actionDirection.z

        if (canStepAt(world, agentHeight, x, y, z)) {
            const cost = 1

            // todo: vertical movement cost?
            // const cost = direction.y === 0 ? 1 : 2

            const jump = direction.y === 1
            const drop = direction.y === -1

            actions.push({ direction, newPosition: _actionDirection.clone(), cost, jump, drop })
        }
    }

    return actions
}

type Node = {
    position: THREE.Vector3
    action?: Action
    parent: Node | null
    g: number
    h: number
    f: number
}

const _heuristicStart = new THREE.Vector3()
const _heuristicGoal = new THREE.Vector3()

const heuristic = (start: THREE.Vector3Like, goal: THREE.Vector3Like) => {
    _heuristicStart.copy(start)
    _heuristicGoal.copy(goal)

    return _heuristicStart.distanceTo(_heuristicGoal)
}

// some alternative heuristics:

// const heuristic = (start: THREE.Vector3Like, goal: THREE.Vector3Like) => {
//     _heuristicStart.copy(start)
//     _heuristicGoal.copy(goal)

//     const dx = Math.abs(_heuristicGoal.x - _heuristicStart.x);
//     const dy = Math.abs(_heuristicGoal.y - _heuristicStart.y);
//     const dz = Math.abs(_heuristicGoal.z - _heuristicStart.z);

//     // Give a lower cost to horizontal movements
//     const horizontalFactor = 0.5;
//     return dx * horizontalFactor + dy + dz;
// }

// const heuristic = (start: THREE.Vector3Like, goal: THREE.Vector3Like) => {
//     return Math.abs(start.x - goal.x) + Math.abs(start.y - goal.y) + Math.abs(start.z - goal.z)
// }

const vector3ToString = (position: THREE.Vector3Like) => {
    return `${position.x},${position.y},${position.z}`
}

export type SearchType = 'greedy' | 'shortest'

type FindPathProps = {
    world: World
    start: THREE.Vector3
    goal: THREE.Vector3
    searchType: SearchType
    earlyExit?: ComputePathEarlyExit
}

type FindPathResult = {
    success: boolean
    path: Node[]
    iterations: number
    explored: Map<string, Node>
}

const findPath = ({ world, start, goal, searchType, earlyExit }: FindPathProps): FindPathResult => {
    const frontier = new PriorityQueue<Node>()
    const explored = new Map<string, Node>()

    const initialNode: Node = { position: start, parent: null, g: 0, h: heuristic(start, goal), f: heuristic(start, goal) }
    frontier.enqueue(initialNode, initialNode.f)

    let iterations = 0

    const fail = () => {
        return { success: false, path: [], iterations, explored }
    }

    const succeed = (path: Node[]) => {
        return { success: true, path, iterations, explored }
    }

    while (frontier.heap.length > 0) {
        if (earlyExit && iterations >= earlyExit.searchIterations) return fail()
        iterations++

        const currentNode = frontier.dequeue()!

        if (currentNode.position.equals(goal)) {
            const path: Node[] = []
            let current: Node | null = currentNode
            while (current !== null) {
                path.unshift(current)
                current = current.parent
            }

            return succeed(path)
        }

        explored.set(vector3ToString(currentNode.position), currentNode)

        for (const action of actions(world, currentNode.position)) {
            const existingNode = explored.get(vector3ToString(action.newPosition))

            if (existingNode) continue

            const g = currentNode.g + action.cost
            const h = heuristic(action.newPosition, goal)
            const f = searchType === 'greedy' ? h : g + h

            // todo: f as a parameter
            // shortest path
            // const f = g + h
            // greedy best-first search
            // const f = h

            const openNode = frontier.heap.find((item) => item.element.position.equals(action.newPosition))

            if (!openNode || f < openNode.element.f) {
                const newNode: Node = { position: action.newPosition, parent: currentNode, g, h, f, action }

                if (openNode) {
                    const openNodeIndex = frontier.heap.indexOf(openNode)
                    frontier.heap.splice(openNodeIndex, 1)
                }

                frontier.enqueue(newNode, f)
            }
        }
    }

    return fail()
}

// computes the diagonal path from (0,0) to (x,z)
const precomputeDiagonal = (x: number, z: number): THREE.Vector3[] => {
    const result: THREE.Vector3[] = []
    result.push(new THREE.Vector3(0, 0, 0))

    const addToPath = (x: number, y: number, z: number) => {
        result.push(new THREE.Vector3(x, y, z))
        return true
    }

    const min: THREE.Vector3Tuple = [0, 0, 0]
    const max: THREE.Vector3Tuple = [1, 1, 1]
    const delta: THREE.Vector3Tuple = [x, 0, z]
    const impacts: THREE.Vector3Tuple = [0, 0, 0]

    sweep(min, max, delta, impacts, addToPath)

    return result
}

const kSweepDistance = 16
const kSweeps: THREE.Vector3[][] = []

for (let z = 0; z < kSweepDistance; z++) {
    for (let x = 0; x < kSweepDistance; x++) {
        kSweeps.push(precomputeDiagonal(x, z))
    }
}

const hasDirectPath = (world: World, source: THREE.Vector3, target: THREE.Vector3): boolean => {
    if (source.y < target.y) return false

    const sx = source.x
    const sz = source.z
    const dx = target.x - sx
    const dz = target.z - sz
    const ax = Math.abs(dx)
    const az = Math.abs(dz)
    if (ax >= kSweepDistance || az >= kSweepDistance) return false

    const index = ax + az * kSweepDistance
    const sweep = kSweeps[index]
    const limit = sweep.length - 1

    let y = source.y
    for (let i = 1; i < limit; i++) {
        const p = sweep[i]
        const x = dx > 0 ? sx + p.x : sx - p.x
        const z = dz > 0 ? sz + p.z : sz - p.z

        if (!canStepAt(world, agentHeight, x, y, z)) return false
        while (y >= target.y && canStepAt(world, agentHeight, x, y - 1, z)) y--

        if (y < target.y) return false
    }

    return true
}

const smoothPath = (world: World, path: Node[]): Node[] => {
    const smoothedPath: Node[] = [path[0]]

    for (let i = 2; i < path.length; i++) {
        const prev = smoothedPath[smoothedPath.length - 1]
        const next = path[i]

        if (!prev.action?.jump && !next.action?.jump && hasDirectPath(world, prev.position, next.position)) continue

        smoothedPath.push(path[i - 1])
    }

    if (path.length > 1) smoothedPath.push(path[path.length - 1])

    return smoothedPath
}

export type ComputePathEarlyExit = { searchIterations: number }

export type ComputePathProps = {
    world: World
    start: THREE.Vector3
    goal: THREE.Vector3
    smooth?: boolean
    searchType: 'greedy' | 'shortest'
    earlyExit?: ComputePathEarlyExit
    keepIntermediates?: boolean
}

export type ComputePathResult = {
    success: boolean
    path: Node[]
    intermediates?: {
        explored: Map<string, Node>
        iterations: number
    }
}

export const computePath = ({
    world,
    start,
    goal,
    smooth = true,
    searchType,
    earlyExit,
    keepIntermediates = false,
}: ComputePathProps): ComputePathResult => {
    const { success, path, iterations, explored } = findPath({ world, start, goal, searchType, earlyExit })

    const intermediates = keepIntermediates ? { explored, iterations } : undefined

    if (!success) return { success: false, path: [], intermediates }

    const resultPath = smooth ? smoothPath(world, path!) : path!

    return { success, path: resultPath, intermediates }
}
