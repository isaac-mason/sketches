import { Vector2 } from './vector.js'
import { createRandomGenerator } from './random.js'
import { CHUNK_SIZE, getChunkPositionFromIndex, Grid } from './grid.js'

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

const createCorridors = (rooms, random) => {
    const corridors = []

    for (let i = 0; i < rooms.length - 1; i++) {
        const roomA = rooms[i]
        const roomB = rooms[i + 1]

        // does a corridor already exist between these rooms?
        if (
            corridors.some(
                (c) => (c.roomA === roomA.id && c.roomB === roomB.id) || (c.roomA === roomB.id && c.roomB === roomA.id),
            )
        ) {
            continue
        }

        const corridor = {
            id: i,
            roomA: roomA.id,
            roomB: roomB.id,
            path: [],
        }

        const x1 = roomA.x + Math.floor(roomA.width / 2)
        const y1 = roomA.y + Math.floor(roomA.height / 2)

        const x2 = roomB.x + Math.floor(roomB.width / 2)
        const y2 = roomB.y + Math.floor(roomB.height / 2)

        let x = x1
        let y = y1

        while (x !== x2 || y !== y2) {
            const dx = Math.sign(x2 - x)
            const dy = Math.sign(y2 - y)

            if (x !== x2 && random() > 0.5) {
                x += dx
            } else if (y !== y2) {
                y += dy
            }

            corridor.path.push({ x, y })
        }

        corridors.push(corridor)
    }

    return corridors
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

    // split the bsp nodes to create rooms
    for (let i = 0; i < splitIterations; i++) {
        splitBSPNode(bsp, random, minRoomSize)
    }

    // create rooms using bsp leaf nodes
    const leafNodes = getLeafNodes(bsp)

    /**
     * @type {Room[]}
     */
    const rooms = createRooms(leafNodes, random)

    // create corridors between rooms with a drunken walk
    const corridors = createCorridors(rooms, random)

    // create a grid map of the dungeon rooms and corridors
    const grid = new Grid()

    for (const room of rooms) {
        for (let y = room.y; y < room.y + room.height; y++) {
            for (let x = room.x; x < room.x + room.width; x++) {
                grid.set(x, y, TILE_ROOM)
            }
        }
    }

    for (const corridor of corridors) {
        for (const { x, y } of corridor.path) {
            // 3x3 brush
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (grid.get(x + dx, y + dy) === undefined) {
                        grid.set(x + dx, y + dy, TILE_CORRIDOR)
                    }
                }
            }
        }
    }

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

const CELL_COLORS = {
    [TILE_ROOM]: '#999',
    [TILE_CORRIDOR]: '#eee',
}

function draw(grid, rooms, corridors, options) {
    const [min, max] = grid.getChunkBounds()

    canvas.width = max[0] - min[0] + 1 * CHUNK_SIZE
    canvas.height = max[1] - min[1] + 1 * CHUNK_SIZE

    const ctx = canvas.getContext('2d')

    const _drawOffset = new Vector2(-min.x, -min.y)
    const _chunkOffset = new Vector2()
    const _drawCursor = new Vector2()

    if (options.drawGrid) {
        for (const chunk of Object.values(grid.chunks)) {
            _chunkOffset.copy(chunk.chunkPosition).multiplyScalar(CHUNK_SIZE)

            for (let i = 0; i < chunk.data.length; i++) {
                getChunkPositionFromIndex(i, _drawCursor)
                _drawCursor.add(_chunkOffset)
                _drawCursor.add(_drawOffset)

                const value = chunk.data[i]
                ctx.fillStyle = CELL_COLORS[value] ?? UNEXPLORED_COLOR
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
