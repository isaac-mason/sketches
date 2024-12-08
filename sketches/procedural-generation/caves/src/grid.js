import { Vector2 } from './vector.js'

export const CHUNK_SIZE = 16

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
     * @type {Record<string, { coords: Vector2, array: Array<number> }>}
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

        if (!this.chunks[chunkKey]) {
            this.chunks[chunkKey] = { coords: [chunkX, chunkY], array: new Array(CHUNK_SIZE * CHUNK_SIZE) }
        }

        const chunkIndex = getChunkIndex(x, y)

        this.chunks[chunkKey].array[chunkIndex] = value
    }

    /**
     * @param {number} x
     * @param {number} y
     * @returns {number}
     */
    get(x, y) {
        const [chunkX, chunkY] = getChunkCoords(x, y)
        const chunkKey = getChunkKey(chunkX, chunkY)
        const chunkIndex = getChunkIndex(x, y)

        return this.chunks[chunkKey] ? this.chunks[chunkKey].array[chunkIndex] : undefined
    }

    /**
     * @returns {[Vector2, Vector2]}
     */
    getChunkBounds() {
        const min = new Vector2()
        const max = new Vector2()

        for (const chunk of Object.values(this.chunks)) {
            min[0] = Math.min(min[0], chunk.coords[0])
            min[1] = Math.min(min[1], chunk.coords[1])

            max[0] = Math.max(max[0], chunk.coords[0])
            max[1] = Math.max(max[1], chunk.coords[1])
        }

        min.multiplyScalar(CHUNK_SIZE)
        max.multiplyScalar(CHUNK_SIZE)

        return [min, max]
    }
}
