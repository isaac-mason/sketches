import { Node, ProblemDefinition, State } from './search'
import { Vec2, vec2 } from './vec2'

type PositionState = Vec2 & { dedupe: string }

const createPositionState = (position: Vec2): PositionState => {
    return {
        ...position,
        dedupe: vec2.hash(position),
    }
}

type MovementAction = Vec2

export type GridPathfindingProblem = {
    state: PositionState
    action: MovementAction
}

export class GridPathfindingProblemDefinition implements ProblemDefinition<GridPathfindingProblem> {
    private movementDirections: Vec2[] = [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
        { x: 0, y: -1 },
        { x: 0, y: 1 },
    ]

    private obstaclePositionHashes = new Set<string>()

    constructor(
        public start: Vec2,
        public goal: Vec2,
        public levelSize: number,
        public obstacles: Vec2[],
    ) {
        for (const obstacle of obstacles) {
            this.obstaclePositionHashes.add(vec2.hash(obstacle))
        }
    }

    initial() {
        return createPositionState(this.start)
    }

    actions(state: PositionState): MovementAction[] {
        const actions: MovementAction[] = []

        for (const direction of this.movementDirections) {
            const newPosition = vec2.add(state, direction)

            const outOfBounds =
                newPosition.x < 0 || newPosition.x >= this.levelSize || newPosition.y < 0 || newPosition.y >= this.levelSize

            if (outOfBounds) continue

            const obstacleAtPosition = this.obstaclePositionHashes.has(vec2.hash(newPosition))

            if (obstacleAtPosition) continue

            actions.push(direction)
        }

        return actions
    }

    apply(state: PositionState, action: Vec2): PositionState {
        return createPositionState(vec2.add(state, action))
    }

    goalTest(state: PositionState) {
        return vec2.equals(state, this.goal)
    }

    pathCost(
        cost: number,
        _start: GridPathfindingProblem['state'],
        _action: GridPathfindingProblem['action'],
        _end: GridPathfindingProblem['state'],
    ) {
        return cost + 1
    }
}

const cartesianDistanceHeuristic = (state: State<GridPathfindingProblem>, goal: Vec2) => {
    const dx = state.x - goal.x
    const dy = state.y - goal.y
    return Math.sqrt(dx * dx + dy * dy)
}

export const fScore = (problemDefinition: GridPathfindingProblemDefinition, node: Node<GridPathfindingProblem>) => {
    return node.pathCost + cartesianDistanceHeuristic(node.state, problemDefinition.goal)
}
