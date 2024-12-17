import { Vector2 } from './vector.js'
import { createRandomGenerator } from './random.js'

// use BSP to generate a dungeon

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

const remap = (value, min, max) => {
    return min + value * (max - min)
}

/**
 * @param {BSPNode} node
 * @param {() => number} random
 */
const splitBSPNode = (node, random) => {
    if (node.children.length > 0) {
        for (const child of node.children) {
            splitBSPNode(child, random)
        }
        return
    }

    // try to even out width and height, but allow for some randomness
    const horizontalSplitChance = node.width / (node.width + node.height)
    const isHorizontalSplit = random() > horizontalSplitChance

    const splitPositionPercentage = remap(random(), 0.3, 0.7)
    const splitPosition = isHorizontalSplit
        ? remap(splitPositionPercentage, node.y + 1, node.y + node.height - 1)
        : remap(splitPositionPercentage, node.x + 1, node.x + node.width - 1)

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

const getLeafNodes = (node) => {
    if (node.children.length === 0) {
        return [node]
    }

    return node.children.flatMap(getLeafNodes)
}

const generate = (splitIterations) => {
    const random = createRandomGenerator(42)

    // create bsp to lay out dungeon structure
    const bsp = {
        x: 0,
        y: 0,
        width: 1000,
        height: 1000,
        children: [],
        parent: null,
    }

    for (let i = 0; i < splitIterations; i++) {
        splitBSPNode(bsp, random)
    }

    const leafNodes = getLeafNodes(bsp)

    let roomIdCounter = 0

    // create rooms within leaf nodes
    const rooms = leafNodes.map((node) => {
        const roomWidth = remap(random(), node.width * 0.7, node.width - 1)
        const roomHeight = remap(random(), node.height * 0.7, node.height - 1)

        const roomX = remap(random(), node.x, node.x + node.width - roomWidth)
        const roomY = remap(random(), node.y, node.y + node.height - roomHeight)

        return {
            id: roomIdCounter++,
            x: roomX,
            y: roomY,
            width: roomWidth,
            height: roomHeight,
            node,
        }
    })

    // create corridors between rooms

    // To build corridors, we loop through all the leafs of the tree, connecting each leaf to its sister. If the two rooms have face-to-face walls, we can use a straight corridor. Else we have to use a Z shaped corridor.
    // Now we get up one level in the tree and repeat the process for the parent sub-regions. Now, we can connect two sub-regions with a link either between two rooms, or a corridor and a room or two corridors.
    // We repeat the process until we have connected the first two sub-dungeons A and B :
    // https://roguebasin.com/index.php/Basic_BSP_Dungeon_generation




    /**
     * @type {Array<{ a: Vector2, b: Vector2 }>}
     */
    const corridors = []

    let leafNodeParents = new Set()

    for (const leafNode of leafNodes) {
        leafNodeParents.add(leafNode.parent)
    }

    for (const nodeWithChildren of leafNodeParents) {
        console.log(nodeWithChildren)
        const a = nodeWithChildren.children[0]
        const b = nodeWithChildren.children[1]

        const roomA = rooms.find((room) => room.node === a)
        const roomB = rooms.find((room) => room.node === b)

        const centerA = new Vector2(roomA.x + roomA.width / 2, roomA.y + roomA.height / 2)
        const centerB = new Vector2(roomB.x + roomB.width / 2, roomB.y + roomB.height / 2)

        const corridor = {
            a: centerA,
            b: centerB,
        }

        corridors.push(corridor)
    }
    
    return {
        bsp,
        rooms,
        corridors,
    }
}

const drawBSPNode = (node, ctx, depth, maxDepth) => {
    if (node.children.length === 0) {
        const hslValue = Math.floor((depth / maxDepth) * 360)
        ctx.fillStyle = `hsl(${hslValue}, ${hslValue}%, ${hslValue}%, 0.1)`
        ctx.strokeStyle = `hsl(${hslValue}, ${hslValue}%, ${hslValue}%)`
        ctx.lineWidth = 1

        ctx.beginPath()
        ctx.rect(node.x, node.y, node.width, node.height)
        ctx.fill()
        ctx.stroke()
    }

    for (const child of node.children) {
        drawBSPNode(child, ctx, depth + 1, maxDepth)
    }
}

const drawRooms = (rooms, ctx) => {
    ctx.fillStyle = '#333'

    for (const room of rooms) {
        ctx.fillRect(room.x, room.y, room.width, room.height)
    }
}

const drawCorridors = (corridors, ctx) => {
    ctx.strokeStyle = '#f33'
    ctx.lineWidth = 3

    for (const corridor of corridors) {
        ctx.beginPath()
        ctx.moveTo(corridor.a.x, corridor.a.y)
        ctx.lineTo(corridor.b.x, corridor.b.y)
        ctx.stroke()
    }
}

const splitIterations = 3

const { bsp, rooms, corridors } = generate(splitIterations)

console.log(bsp, rooms, corridors)

const canvas = document.createElement('canvas')
canvas.width = 1000
canvas.height = 1000
document.body.appendChild(canvas)

const ctx = canvas.getContext('2d')

ctx.fillStyle = '#fff'
ctx.fillRect(0, 0, canvas.width, canvas.height)

drawBSPNode(bsp, ctx, 0, splitIterations)
drawRooms(rooms, ctx)
drawCorridors(corridors, ctx)
