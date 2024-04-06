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

        const root = this.heap[0]
        this.heap[0] = this.heap.pop()!

        if (this.heap.length > 0) {
            this.heapifyDown(0)
        }

        return root.element
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

const actions = (world: World, position: THREE.Vector3Like) => {
    const actions: Action[] = []
    const tempVector = new THREE.Vector3()

    const height = 2

    for (const direction of directions) {
        tempVector.copy(position).add(direction)
        const x = tempVector.x
        const y = tempVector.y
        const z = tempVector.z

        if (canStepAt(world, height, x, y, z)) {
            const cost = direction.y === 0 ? 1 : 2
            const jump = direction.y === 1
            const drop = direction.y === -1

            actions.push({ direction, newPosition: tempVector.clone(), cost, jump, drop })
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

const heuristic = (start: THREE.Vector3Like, end: THREE.Vector3Like) => {
    return Math.abs(start.x - end.x) + Math.abs(start.y - end.y) + Math.abs(start.z - end.z)
}

const hash = (position: THREE.Vector3Like) => {
    return `${position.x},${position.y},${position.z}`
}

const findPath = (world: World, start: THREE.Vector3, goal: THREE.Vector3, earlyExit?: ComputePathEarlyExit): Node[] | null => {
    const frontier = new PriorityQueue<Node>()
    const explored = new Map<string, Node>()

    const initialNode: Node = { position: start, parent: null, g: 0, h: heuristic(start, goal), f: heuristic(start, goal) }
    frontier.enqueue(initialNode, initialNode.f)

    let iterations = 0

    while (frontier.heap.length > 0) {
        if (earlyExit && iterations >= earlyExit.searchIterations) return null
        iterations++

        const currentNode = frontier.dequeue()!

        if (currentNode.position.equals(goal)) {
            const path: Node[] = []
            let current: Node | null = currentNode
            while (current !== null) {
                path.unshift(current)
                current = current.parent
            }
            return path
        }

        explored.set(hash(currentNode.position), currentNode)

        for (const action of actions(world, currentNode.position)) {
            const existingNode = explored.get(hash(action.newPosition))

            if (existingNode) continue

            const g = currentNode.g + action.cost
            const h = heuristic(action.newPosition, goal)
            const f = g + h

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

    return null
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
        if (world.solid(new THREE.Vector3(x, y, z))) return false
        while (y >= target.y && !world.solid(new THREE.Vector3(x, y - 1, z))) y--

        // todo: should canStepAt be used here?
        // if (!canStepAt(world, 2, x, y, z)) return false
        // while (y >= target.y && canStepAt(world, 2, x, y - 1, z)) y--

        if (y < target.y) return false
    }
    return true
}

const smoothPath = (world: World, path: Node[]): Node[] => {
    const result: Node[] = [path[0]]

    for (let i = 2; i < path.length; i++) {
        const prev = result[result.length - 1]
        const next = path[i]

        if (!prev.action?.jump && !next.action?.jump && hasDirectPath(world, prev.position, next.position)) continue

        result.push(path[i - 1])
    }

    if (path.length > 1) result.push(path[path.length - 1])

    return result
}

export type ComputePathEarlyExit = { searchIterations: number }

export type ComputePathProps = {
    world: World
    start: THREE.Vector3
    goal: THREE.Vector3
    smooth?: boolean
    earlyExit?: ComputePathEarlyExit
}

export const computePath = ({ world, start, goal, smooth = true, earlyExit }: ComputePathProps): Node[] | null => {
    const path = findPath(world, start, goal, earlyExit)

    if (!path) return null

    if (!smooth) return path

    return smoothPath(world, path)
}
