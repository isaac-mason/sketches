import { CHUNK_SIZE, getChunkPositionFromIndex, Grid } from './grid.js'
import { createRandomGenerator } from './random.js'
import { Vector2 } from './vector.js'

const TILE_FLOOR = 1
const TILE_WALL = 2

const ACTION_DIRECTIONS = [new Vector2(0, -1), new Vector2(0, 1), new Vector2(-1, 0), new Vector2(1, 0)]

/**
 * @typedef {{
 *   position: Vector2
 * }} State
 */

/**
 * @typedef {{
 *   direction: Vector2
 * }} Action
 */

const _actionPosition = new Vector2()

/**
 * @param {Grid} grid
 * @param {State} state
 * @returns {Array<Action>}
 */
const getActions = (grid, state) => {
    const actions = []

    for (const direction of ACTION_DIRECTIONS) {
        _actionPosition.copy(state.position).add(direction)

        if (grid.get(_actionPosition.x, _actionPosition.y) === undefined) {
            actions.push({ direction: direction.clone() })
        }
    }

    return actions
}

/**
 * @param {Grid} grid
 * @param {() => number} random
 * @param {number} maxIterations
 * @param {number} reshuffleIterations
 */
const carve = (grid, random, maxIterations, reshuffleIterations) => {
    grid.set(0, 0, TILE_FLOOR)

    /**
     * @type {Array<State>}
     */
    const frontier = [{ position: new Vector2(0, 0) }]

    let iteration = 0

    const _nextPosition = new Vector2()

    while (frontier.length > 0 && iteration < maxIterations) {
        iteration++

        if (iteration % reshuffleIterations === 0) {
            // shuffle the frontier
            for (let i = frontier.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1))
                const temp = frontier[i]
                frontier[i] = frontier[j]
                frontier[j] = temp
            }
        }

        // depth-first
        const state = frontier.pop()

        const actions = getActions(grid, state)

        if (actions.length === 0) {
            continue
        }

        // shuffle the actions
        for (let i = actions.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1))
            const temp = actions[i]
            actions[i] = actions[j]
            actions[j] = temp
        }

        for (const action of actions) {
            const nextPosition = _nextPosition.copy(state.position).add(action.direction)

            grid.set(nextPosition.x, nextPosition.y, TILE_FLOOR)

            frontier.push({ position: nextPosition.clone() })
        }
    }

    // change unexplored cells to walls
    for (const chunk of Object.values(grid.chunks)) {
        for (let i = 0; i < chunk.data.length; i++) {
            if (chunk.data[i] === undefined) {
                chunk.data[i] = TILE_WALL
            }
        }
    }
}

/**
 * @param {Grid} grid
 */
const smooth = (grid) => {
    const [min, max] = grid.getChunkBounds()

    for (let y = min.y; y <= max.y; y++) {
        for (let x = min.x; x <= max.x; x++) {
            if (grid.get(x, y) !== TILE_WALL) {
                continue
            }

            let floorCount = 0

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (grid.get(x + dx, y + dy) === TILE_FLOOR) {
                        floorCount++
                    }
                }
            }

            if (floorCount >= 6) {
                grid.set(x, y, TILE_FLOOR)
            }
        }
    }
}

/**
 * @param {number} seed
 * @param {number} carveMaxIterations
 * @param {number} carveReshuffleIterations
 * @returns {Grid}
 */
const generate = (seed, carveMaxIterations, carveReshuffleIterations) => {
    const grid = new Grid()

    const random = createRandomGenerator(seed)

    carve(grid, random, carveMaxIterations, carveReshuffleIterations)

    smooth(grid)

    return grid
}

const CELL_COLORS = {
    [TILE_FLOOR]: '#ccc',
    [TILE_WALL]: '#333',
}

const UNEXPLORED_COLOR = '#f00'

const CELL_SIZE = 8

/**
 * @param {HTMLCanvasElement} canvas
 * @param {Grid} grid
 */
function draw(canvas, grid) {
    // set the canvas size based on the chunks
    const [min, max] = grid.getChunkBounds()

    canvas.width = (max[0] - min[0] + 1) * CHUNK_SIZE
    canvas.height = (max[1] - min[1] + 1) * CHUNK_SIZE

    const ctx = canvas.getContext('2d')

    // calculate the offset to center the grid on the canvas
    const offsetX = -min.x + (canvas.width / CELL_SIZE - (max.x - min.x + CHUNK_SIZE)) / 2
    const offsetY = -min.y + (canvas.height / CELL_SIZE - (max.y - min.y + CHUNK_SIZE)) / 2

    const _drawCursor = new Vector2()
    const _chunkOffset = new Vector2()

    for (const chunk of Object.values(grid.chunks)) {
        _chunkOffset.copy(chunk.chunkPosition).multiplyScalar(CHUNK_SIZE)

        for (let i = 0; i < chunk.data.length; i++) {
            getChunkPositionFromIndex(i, _drawCursor)
            _drawCursor.add(_chunkOffset)

            const x = _drawCursor.x
            const y = _drawCursor.y
            const value = chunk.data[i]
            ctx.fillStyle = CELL_COLORS[value] ?? UNEXPLORED_COLOR
            ctx.fillRect((x + offsetX) * CELL_SIZE, (y + offsetY) * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        }
    }
}

const canvas = document.createElement('canvas')
document.querySelector('#app').appendChild(canvas)

const controls = document.createElement('div')
controls.className = 'controls'

const createControl = (label, value) => {
    const control = document.createElement('div')
    control.className = 'control'

    const labelElement = document.createElement('label')
    labelElement.textContent = label
    control.appendChild(labelElement)

    const input = document.createElement('input')
    input.type = 'number'
    input.value = value
    control.appendChild(input)

    controls.appendChild(control)

    return input
}

const seedInput = createControl('Seed', 42)
const carveMaxIterationsInput = createControl('Carve Max Iterations', 10000)
const carveReshuffleIterationsInput = createControl('Carve Reshuffle Iterations', 2000)

const runButton = document.createElement('button')
runButton.textContent = 'Generate'
controls.appendChild(runButton)
runButton.onclick = run

document.querySelector('#app').appendChild(controls)

function run() {
    const seed = parseInt(seedInput.value)
    const carveMaxIterations = parseInt(carveMaxIterationsInput.value)
    const carveReshuffleIterations = parseInt(carveReshuffleIterationsInput.value)

    const grid = generate(seed, carveMaxIterations, carveReshuffleIterations)

    draw(canvas, grid)
}

run()
