import { Vector2 } from './vector.js'

export const CHUNK_SIZE = Math.pow(2, 6)

const getChunkCoords = (x, y) => {
    const chunkX = Math.floor(x / CHUNK_SIZE)
    const chunkY = Math.floor(y / CHUNK_SIZE)

    return [chunkX, chunkY]
}

const getChunkKey = (x, y) => {
    return `${x},${y}`
}

const getChunkIndex = (x, y) => {
    const localX = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
    const localY = ((y % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE

    return localX + localY * CHUNK_SIZE
}

export const getChunkPositionFromIndex = (index, out) => {
    const x = index % CHUNK_SIZE
    const y = Math.floor(index / CHUNK_SIZE)

    out.set(x, y)
}

export class Grid {
    /**
     * @type {Record<string, { chunkPosition: Vector2, data: Array<number> }>}
     */
    chunks = {}

    /**
     * @param {number} x
     * @param {number} y
     * @param {number} value
     */
    set(x, y, value) {
        const [chunkX, chunkY] = getChunkCoords(x, y)
        const chunkKey = getChunkKey(chunkX, chunkY)

        let chunk = this.chunks[chunkKey]
        if (!chunk) {
            this.chunks[chunkKey] = chunk = { chunkPosition: [chunkX, chunkY], data: new Array(CHUNK_SIZE * CHUNK_SIZE) }
        }

        const chunkIndex = getChunkIndex(x, y)

        chunk.data[chunkIndex] = value
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    get(x, y) {
        const [chunkX, chunkY] = getChunkCoords(x, y)
        const chunk = this.chunks[getChunkKey(chunkX, chunkY)]

        if (!chunk) {
            return undefined
        }

        return chunk.data[getChunkIndex(x, y)]
    }

    /**
     * @returns {{ min: Vector2, max: Vector2 }}
     */
    getChunkBounds() {
        const min = new Vector2()
        const max = new Vector2()

        for (const chunk of Object.values(this.chunks)) {
            min[0] = Math.min(min[0], chunk.chunkPosition[0])
            min[1] = Math.min(min[1], chunk.chunkPosition[1])

            max[0] = Math.max(max[0], chunk.chunkPosition[0])
            max[1] = Math.max(max[1], chunk.chunkPosition[1])
        }

        min.multiplyScalar(CHUNK_SIZE)
        max.multiplyScalar(CHUNK_SIZE)

        return { min, max }
    }

    /**
     * @returns {{ min: Vector2, max: Vector2 }}
     */
    getBounds() {
        const { min, max } = this.getChunkBounds()

        return {
            min: new Vector2(min[0], min[1]),
            max: new Vector2(max[0] + CHUNK_SIZE - 1, max[1] + CHUNK_SIZE - 1),
        }
    }

    /**
     * @returns {Vector2}
     */
    getSize() {
        const { min, max } = this.getChunkBounds()

        return new Vector2(max[0] - min[0] + 1 * CHUNK_SIZE, max[1] - min[1] + 1 * CHUNK_SIZE)
    }
}
