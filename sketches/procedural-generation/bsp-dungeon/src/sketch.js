import { CHUNK_SIZE, getChunkPositionFromIndex as chunkIndexToPosition, Grid } from './grid.js'
import { createRandomGenerator } from './random.js'
import { Vector2 } from './vector.js'

const TILE_ROOM = 0
const TILE_CORRIDOR = 1

/**
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   parent: BSPNode,
 *   children: Array<BSPNode>
 * }} BSPNode
 */

/**
 * @typedef {{
 *   id: number,
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number,
 *   node: BSPNode
 * }} Room
 */

/**
 * @typedef {{
 *   id: number,
 *   roomA: number,
 *   roomB: number,
 *   path: Array<Vector2>
 * }} Corridor
 */

/**
 * @param {number} value
 * @param {number} fromMin
 * @param {number} fromMax
 * @param {number} toMin
 * @param {number} toMax
 * @returns {number}
 */
const remap = (value, fromMin, fromMax, toMin, toMax) => {
    return ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin) + toMin
}

/**
 * @param {BSPNode} node
 * @param {() => number} random
 */
const splitBSPNode = (node, random, minSize) => {
    if (node.children.length > 0) {
        for (const child of node.children) {
            splitBSPNode(child, random, minSize)
        }
        return
    }

    // try to even out width and height, but allow for some randomness
    const horizontalSplitChance = node.width / (node.width + node.height)
    const isHorizontalSplit = random() > horizontalSplitChance

    const splitPositionPercentage = remap(random(), 0, 1, 0.3, 0.7)
    const splitPosition = isHorizontalSplit
        ? Math.round(remap(splitPositionPercentage, 0, 1, node.y + 1, node.y + node.height - 1))
        : Math.round(remap(splitPositionPercentage, 0, 1, node.x + 1, node.x + node.width - 1))

    const splitRoomSize = isHorizontalSplit ? splitPosition - node.y : splitPosition - node.x

    // don't split if under min size
    if (splitRoomSize < minSize) {
        return
    }

    const childA = {
        x: node.x,
        y: node.y,
        width: isHorizontalSplit ? node.width : splitPosition - node.x,
        height: isHorizontalSplit ? splitPosition - node.y : node.height,
        children: [],
        parent: node,
    }

    const childB = {
        x: isHorizontalSplit ? node.x : splitPosition,
        y: isHorizontalSplit ? splitPosition : node.y,
        width: isHorizontalSplit ? node.width : node.width - (splitPosition - node.x),
        height: isHorizontalSplit ? node.height - (splitPosition - node.y) : node.height,
        children: [],
        parent: node,
    }

    node.children.push(childA, childB)
}

/**
 * @param {BSPNode} node
 * @returns {BSPNode[]}
 */
const getLeafNodes = (node) => {
    if (node.children.length === 0) {
        return [node]
    }

    return node.children.flatMap(getLeafNodes)
}

/**
 * @param {BSPNode} node
 * @returns {BSPNode[]}
 */
const getBranches = (node) => {
    const branches = []

    if (node.children.length === 0) {
        return branches
    }

    if (node.children.length === 2) {
        branches.push([node.children[0], node.children[1]])

        branches.push(...getBranches(node.children[0]))
        branches.push(...getBranches(node.children[1]))
    }

    return branches
}

/**
 * @param {BSPNode[]} leafNodes
 * @param {() => number} random
 * @returns {Room[]}
 */
const createRooms = (leafNodes, random) => {
    /**
     * @type {Room[]}
     */
    const rooms = []

    let roomIdCounter = 0

    for (const node of leafNodes) {
        if (random() < 0.1) {
            continue
        }

        const roomPadding = 1
        const roomMinSizePercentage = 0.5
        const romMaxSizePercentage = 0.99

        const roomMinWidth = Math.floor(node.width * roomMinSizePercentage)
        const roomMaxWidth = Math.floor(node.width * romMaxSizePercentage) - roomPadding * 2
        const roomMinHeight = Math.floor(node.height * roomMinSizePercentage)
        const roomMaxHeight = Math.floor(node.height * romMaxSizePercentage) - roomPadding * 2

        const roomWidth = Math.floor(remap(random(), 0, 1, roomMinWidth, roomMaxWidth))
        const roomHeight = Math.floor(remap(random(), 0, 1, roomMinHeight, roomMaxHeight))

        const roomMinX = node.x + roomPadding
        const roomMaxX = node.x + node.width - roomWidth - roomPadding
        const roomMinY = node.y + roomPadding
        const roomMaxY = node.y + node.height - roomHeight - roomPadding

        const roomX = Math.floor(remap(random(), 0, 1, roomMinX, roomMaxX))
        const roomY = Math.floor(remap(random(), 0, 1, roomMinY, roomMaxY))

        rooms.push({
            id: roomIdCounter++,
            x: roomX,
            y: roomY,
            width: roomWidth,
            height: roomHeight,
            node,
        })
    }

    return rooms
}

/**
 * @param {BSPNode} bsp
 * @param {Room[]} rooms
 * @param {() => number} random
 * @returns
 */
const createCorridors = (bsp) => {
    const corridors = []

    const connectLeaves = (leaf1, leaf2) => {
        const corridor = {
            id: corridors.length,
            path: [],
        }

        corridors.push(corridor)

        const center1 = {
            x: Math.floor(leaf1.x + leaf1.width / 2),
            y: Math.floor(leaf1.y + leaf1.height / 2),
        }
        const center2 = {
            x: Math.floor(leaf2.x + leaf2.width / 2),
            y: Math.floor(leaf2.y + leaf2.height / 2),
        }

        let x = Math.min(center1.x, center2.x)
        let y = Math.min(center1.y, center2.y)
        let w = 1
        let h = 1

        const horizontal = Math.abs(center1.y - center2.y) > Math.abs(center1.x - center2.x)

        if (horizontal) {
            x -= Math.floor(w / 2) + 1
            h = Math.abs(center1.y - center2.y)
        } else {
            y -= Math.floor(h / 2) + 1
            w = Math.abs(center1.x - center2.x)
        }

        x = Math.max(0, x)
        y = Math.max(0, y)

        for (let i = x; i < x + w; i++) {
            for (let j = y; j < y + h; j++) {
                corridor.path.push({ x: i, y: j })
            }
        }
    }

    const branches = getBranches(bsp)

    for (const [a, b] of branches) {
        connectLeaves(a, b)
    }

    return corridors
}

/**
 * @param {Grid} grid
 * @param {Room[]} rooms
 */
const addRoomsToGrid = (grid, rooms) => {
    for (const room of rooms) {
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++) {
                grid.set(x, y, TILE_ROOM)
            }
        }
    }
}

/**
 * @param {Grid} grid
 * @param {Corridor[]} corridors
 */
const addCorridorsToGrid = (grid, corridors) => {
    for (const corridor of corridors) {
        for (const { x, y } of corridor.path) {
            if (grid.get(x, y) === undefined) {
                grid.set(x, y, TILE_CORRIDOR)
            }
        }
    }
}

/**
 * @param {Grid} grid
 */
const clearDeadends = (grid) => {
    let done = false

    const cursor = new Vector2()
    const chunkOffset = new Vector2()

    while (!done) {
        done = true

        for (const chunk of Object.values(grid.chunks)) {
            chunkOffset.copy(chunk.chunkPosition).multiplyScalar(CHUNK_SIZE)

            for (let i = 0; i < chunk.data.length; i++) {
                if (chunk.data[i] !== TILE_CORRIDOR) continue

                chunkIndexToPosition(i, cursor)
                cursor.add(chunkOffset)

                let undefinedCount = 0
                if (grid.get(cursor.x, cursor.y - 1) === undefined) undefinedCount += 1
                if (grid.get(cursor.x, cursor.y + 1) === undefined) undefinedCount += 1
                if (grid.get(cursor.x - 1, cursor.y) === undefined) undefinedCount += 1
                if (grid.get(cursor.x + 1, cursor.y) === undefined) undefinedCount += 1

                if (undefinedCount === 3) {
                    grid.set(cursor.x, cursor.y, undefined)
                    done = false
                }
            }
        }
    }
}

/**
 * @param {number} seed
 * @param {BSPNode} bsp
 * @param {number} splitIterations
 * @param {number} minRoomSize
 * @returns {{ grid: Grid, bsp: BSPNode, rooms: Room[], corridors: Corridor[] }}
 */
const generate = (seed, bsp, splitIterations, minRoomSize) => {
    const random = createRandomGenerator(seed)

    for (let i = 0; i < splitIterations; i++) {
        splitBSPNode(bsp, random, minRoomSize)
    }

    const leafNodes = getLeafNodes(bsp)

    const rooms = createRooms(leafNodes, random)

    const corridors = createCorridors(bsp)

    const grid = new Grid()

    addRoomsToGrid(grid, rooms)

    addCorridorsToGrid(grid, corridors)

    clearDeadends(grid)

    return {
        grid,
        bsp,
        rooms,
        corridors,
    }
}

const options = {
    seed: 42,
    drawGrid: true,
    drawRooms: false,
    drawBSP: false,
    drawCorridors: false,
    minRoomSize: 20,
    splitIterations: 5,
}

function run() {
    const bsp = {
        x: 0,
        y: 0,
        width: 128,
        height: 128,
        children: [],
        parent: null,
    }

    console.time('generate')
    const { grid, rooms, corridors } = generate(options.seed, bsp, options.splitIterations, options.minRoomSize)
    console.timeEnd('generate')

    console.log(grid, bsp, rooms, corridors)

    draw(grid, rooms, corridors, options)
}

const canvas = document.createElement('canvas')
document.body.appendChild(canvas)

const UNEXPLORED_COLOR = '#333'

const TILE_COLORS = {
    [TILE_ROOM]: '#999',
    [TILE_CORRIDOR]: '#eee',
}

function draw(grid, rooms, corridors, options) {
    const size = grid.getSize()
    const bounds = grid.getBounds()

    canvas.width = size.x
    canvas.height = size.y

    const ctx = canvas.getContext('2d')

    const _drawOffset = new Vector2(-bounds.min.x, -bounds.min.y)
    const _chunkOffset = new Vector2()
    const _drawCursor = new Vector2()

    if (options.drawGrid) {
        for (const chunk of Object.values(grid.chunks)) {
            _chunkOffset.copy(chunk.chunkPosition).multiplyScalar(CHUNK_SIZE)

            for (let i = 0; i < chunk.data.length; i++) {
                chunkIndexToPosition(i, _drawCursor)
                _drawCursor.add(_chunkOffset)
                _drawCursor.add(_drawOffset)

                const value = chunk.data[i]
                ctx.fillStyle = TILE_COLORS[value] ?? UNEXPLORED_COLOR
                ctx.fillRect(_drawCursor.x, _drawCursor.y, 1, 1)
            }
        }
    }

    if (options.drawRooms || options.drawBSP) {
        for (const room of rooms) {
            const h = room.id * 30

            if (options.drawRooms) {
                ctx.fillStyle = `hsl(${h}, 50%, 50%, 1)`
                ctx.fillRect(room.x + _drawOffset.x, room.y + _drawOffset.y, room.width, room.height)
            }

            if (options.drawBSP) {
                ctx.fillStyle = `hsl(${h}, 50%, 50%, ${options.drawGrid ? 0.3 : 0.5})`
                ctx.fillRect(room.node.x + _drawOffset.x, room.node.y + _drawOffset.y, room.node.width, room.node.height)
            }
        }
    }

    if (options.drawCorridors) {
        for (const corridor of corridors) {
            for (const { x, y } of corridor.path) {
                ctx.fillStyle = `hsl(${corridor.id * 30}, 100%, 50%, ${options.drawGrid ? 0.5 : 1})`
                ctx.fillRect(x + _drawOffset.x, y + _drawOffset.y, 1, 1)
            }
        }
    }
}

const controls = document.querySelector('#controls')

// add draw rooms checkbox
const createControl = (label, controlElement, controls) => {
    const control = document.createElement('div')
    control.className = 'control'

    const labelElement = document.createElement('label')
    labelElement.textContent = label
    control.appendChild(labelElement)

    control.appendChild(controlElement)

    controls.appendChild(control)
}

const drawGridCheckbox = document.createElement('input')
drawGridCheckbox.type = 'checkbox'
drawGridCheckbox.checked = true
drawGridCheckbox.addEventListener('change', () => {
    options.drawGrid = drawGridCheckbox.checked
    run()
})
createControl('Draw Grid', drawGridCheckbox, controls)

const drawRoomsCheckbox = document.createElement('input')
drawRoomsCheckbox.type = 'checkbox'
drawRoomsCheckbox.checked = options.drawRooms
drawRoomsCheckbox.addEventListener('change', () => {
    options.drawRooms = drawRoomsCheckbox.checked
    run()
})
createControl('Draw Rooms', drawRoomsCheckbox, controls)

const drawBSPCheckbox = document.createElement('input')
drawBSPCheckbox.type = 'checkbox'
drawBSPCheckbox.checked = options.drawBSP
drawBSPCheckbox.addEventListener('change', () => {
    options.drawBSP = drawBSPCheckbox.checked
    run()
})
createControl('Draw BSP', drawBSPCheckbox, controls)

const drawCorridorsCheckbox = document.createElement('input')
drawCorridorsCheckbox.type = 'checkbox'
drawCorridorsCheckbox.checked = options.drawCorridors
drawCorridorsCheckbox.addEventListener('change', () => {
    options.drawCorridors = drawCorridorsCheckbox.checked
    run()
})
createControl('Draw Corridors', drawCorridorsCheckbox, controls)

const splitIterationsInput = document.createElement('input')
splitIterationsInput.type = 'number'
splitIterationsInput.value = options.splitIterations
splitIterationsInput.addEventListener('change', () => {
    options.splitIterations = parseInt(splitIterationsInput.value)
    run()
})
createControl('Split Iterations', splitIterationsInput, controls)

const minRoomSizeInput = document.createElement('input')
minRoomSizeInput.type = 'number'
minRoomSizeInput.value = options.minRoomSize
minRoomSizeInput.addEventListener('change', () => {
    options.minRoomSize = parseInt(minRoomSizeInput.value)
    run()
})
createControl('Min Room Size', minRoomSizeInput, controls)

const seedInput = document.createElement('input')
seedInput.type = 'number'
seedInput.value = options.seed
seedInput.addEventListener('change', () => {
    options.seed = parseInt(seedInput.value)
    run()
})
createControl('Seed', seedInput, controls)

run()
