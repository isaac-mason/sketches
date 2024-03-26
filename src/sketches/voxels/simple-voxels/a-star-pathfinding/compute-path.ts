import * as THREE from 'three'
import { World } from '../lib/world'

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

const actions = (world: World, position: THREE.Vector3Like) => {
    const actions: { cost: number; direction: THREE.Vector3; newPosition: THREE.Vector3 }[] = []
    const tempVector = new THREE.Vector3()

    const height = 2

    for (const direction of directions) {
        tempVector.copy(position).add(direction)
        const x = tempVector.x
        const y = tempVector.y
        const z = tempVector.z

        if (canStepAt(world, height, x, y, z)) {
            const cost = direction.y === 0 ? 1 : 2
            actions.push({ direction, newPosition: tempVector.clone(), cost })
        }
    }

    return actions
}

type Node = {
    position: THREE.Vector3
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

export const computePath = (world: World, start: THREE.Vector3, goal: THREE.Vector3): Node[] | null => {
    const frontier = new PriorityQueue<Node>()
    const explored = new Map<string, Node>()

    const initialNode: Node = { position: start, parent: null, g: 0, h: heuristic(start, goal), f: heuristic(start, goal) }
    frontier.enqueue(initialNode, initialNode.f)

    while (frontier.heap.length > 0) {
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
                const newNode: Node = { position: action.newPosition, parent: currentNode, g, h, f }

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
