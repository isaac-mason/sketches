type BaseState = { dedupe: string }

export type Node<State extends BaseState, Action> = {
    state: State
    action?: Action
    parent?: Node<State, Action>
    pathCost: number
}

export function getPath<State extends BaseState, Action>(node: Node<State, Action>): Node<State, Action>[] {
    const path: Node<State, Action>[] = []
    let currentNode: Node<State, Action> | undefined = node

    while (currentNode) {
        path.push(currentNode)
        currentNode = currentNode.parent
    }

    return path.reverse()
}

class PriorityQueue<T> {
    private values: Array<{ key: string; value: T; priority: number }> = []
    private keyToPriority = new Map<string, number>()

    add(key: string, value: T, priority: number): boolean {
        const existingPriority = this.keyToPriority.get(key)

        if (existingPriority) {
            // exit if the existing item takes priority
            if (existingPriority <= priority) {
                return false
            }

            // otherwise remove the existing item
            this.remove(key)
        }

        const item = { key, value, priority }
        let low = 0
        let high = this.values.length

        while (low < high) {
            const mid = (low + high) >>> 1
            if (this.values[mid].priority < priority) {
                low = mid + 1
            } else {
                high = mid
            }
        }

        this.values.splice(low, 0, item)
        this.keyToPriority.set(key, priority)

        return true
    }

    remove(key: string): void {
        const index = this.values.findIndex((item) => item.key === key)
        if (index !== -1) {
            this.values.splice(index, 1)
            this.keyToPriority.delete(key)
        }
    }

    next(): T | undefined {
        const value = this.values.shift()
        if (value) {
            this.keyToPriority.delete(value.key)
            return value.value
        }
        return undefined
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

export function bestFirstGraphSearch<State extends BaseState, Action, ProblemDef extends ProblemDefinition<State, Action>>(
    problem: ProblemDef,
    f: (problemDefinition: ProblemDef, node: Node<State, Action>) => number,
): Node<State, Action> | undefined {
    const initialNode = { state: problem.initial(), pathCost: 0 }

    if (problem.goalTest(initialNode.state)) {
        return initialNode
    }

    const explored = new Set<string>()

    const frontier = new PriorityQueue<Node<State, Action>>()
    frontier.add(initialNode.state.dedupe, initialNode, 0)

    while (!frontier.isEmpty()) {
        const node = frontier.next()!

        if (problem.goalTest(node.state)) {
            return node
        }

        explored.add(node.state.dedupe)

        for (const action of problem.actions(node.state)) {
            const state = problem.apply(node.state, action)

            if (explored.has(state.dedupe)) {
                continue
            }

            const child = {
                state,
                action,
                parent: node,
                pathCost: problem.pathCost(node.pathCost, node.state, action, state),
            }

            frontier.add(state.dedupe, child, f(problem, child))
        }
    }

    return undefined
}
