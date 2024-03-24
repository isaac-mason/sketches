type BaseState = { dedupe: string }

export class Node<State extends BaseState, Action> {
    state: State

    action?: Action

    parent?: Node<State, Action>

    pathCost: number

    constructor({
        state,
        action,
        parent,
        pathCost,
    }: {
        state: State
        action?: Action
        parent?: Node<State, Action>
        pathCost?: number
    }) {
        this.state = state
        this.action = action
        this.parent = parent
        this.pathCost = pathCost ?? 0
    }

    path(): Node<State, Action>[] {
        const nodes: Node<State, Action>[] = [this]
        let node: Node<State, Action> = this

        while (node.parent) {
            nodes.push(node.parent)
            node = node.parent
        }

        return nodes.reverse()
    }

    actions(): Action[] {
        const actions = this.path().map((n) => n.action!)
        actions.shift()

        return actions
    }
}

class KeyedPriorityQueue<T> {
    private values: { key: string; value: T; priority: number }[] = []

    private keyToPriority = new Map<string, number>()

    constructor(public order: 'min' | 'max' = 'min') {}

    add(key: string, value: T, priority: number): boolean {
        const existingPriority = this.keyToPriority.get(key)

        if (existingPriority) {
            // exit if the existing item takes priority
            if (
                (this.order === 'min' && existingPriority <= priority) ||
                (this.order === 'max' && existingPriority >= priority)
            ) {
                return false
            }

            // otherwise remove the existing item
            this.remove(key)
        }

        const item = { key, value, priority }

        // binary search for insertion index
        let low = 0
        let high = this.values.length

        while (low < high) {
            // effectively divides the sum of low and high by 2 and rounds down to the nearest whole number
            const mid = (low + high) >>> 1

            if (this.values[mid].priority < priority) {
                low = mid + 1
            } else {
                high = mid
            }
        }

        this.values.splice(low, 0, item)

        this.keyToPriority.set(key, item.priority)

        return true
    }

    remove(key: string): void {
        let index = -1

        for (let i = 0; i < this.values.length; i++) {
            if (this.values[i]?.key === key) {
                index = i
            }
        }

        if (index !== -1) {
            this.values.splice(index, 1)
            this.keyToPriority.delete(key)
        }
    }

    next(): T | undefined {
        const value = this.order === 'min' ? this.values.shift() : this.values.pop()

        if (!value) return undefined

        this.keyToPriority.delete(value.key)

        return value.value
    }

    isEmpty(): boolean {
        return this.values.length === 0
    }
}

export interface ProblemDefinition<State extends BaseState, Action> {
    initial(): State

    actions(state: State): Action[]

    apply(state: State, action: Action): State

    goalTest(state: State): boolean

    pathCost(cost: number, start: State, action: Action, end: State): number
}

/**
 * Search nodes with the lowest f scores first
 *
 * @param problem The problem definition
 * @param f a function that returns the f score to minimize
 *
 * If f is a heuristic estimate to the goal, then the search will be a greedy best first search
 * If f is the depth of the node, the search will be breadth first
 *
 * @returns a node passing the problem definition's goal test, or undefined if no such node exists
 */
export function bestFirstGraphSearch<State extends BaseState, Action, ProblemDef extends ProblemDefinition<State, Action>>(
    problem: ProblemDef,
    f: (problemDefinition: ProblemDef, node: Node<State, Action>) => number,
): Node<State, Action> | undefined {
    const initialNode = new Node<State, Action>({ state: problem.initial() })

    if (problem.goalTest(initialNode.state)) {
        return initialNode
    }

    const explored = new Set<string>()

    const frontier = new KeyedPriorityQueue<Node<State, Action>>()

    frontier.add(initialNode.state.dedupe, initialNode, 0)

    while (!frontier.isEmpty()) {
        const node = frontier.next()!

        if (problem.goalTest(node.state)) {
            return node
        }

        explored.add(node.state.dedupe)

        const actions = problem.actions(node.state)

        for (const action of actions) {
            const state = problem.apply(node.state, action)

            if (explored.has(state.dedupe)) {
                continue
            }

            const child = new Node({
                parent: node,
                state,
                action,
                pathCost: problem.pathCost(node.pathCost, node.state, action, state),
            })

            const fScore = f(problem, child)

            frontier.add(child.state.dedupe, child, fScore)
        }
    }

    return undefined
}
