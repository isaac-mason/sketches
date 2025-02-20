export type BlockInfo = {
    index: number
    id: string
    texture: {
        x: number
        y: number
        width: number
        height: number
    }
}

export const AIR_BLOCK_TYPE = 0

export class BlockRegistry {
    indexCounter = 1 // 0 is reserved for air

    blocks: Map<number, BlockInfo> = new Map()

    blockIdToIndex: Map<string, number> = new Map()

    add({ id, texture }: { id: string; texture: BlockInfo['texture'] }): BlockInfo {
        const index = this.indexCounter
        this.indexCounter++

        const block = { index, id, texture }

        this.blocks.set(index, block)
        this.blockIdToIndex.set(id, index)

        return block
    }

    get(id: number): BlockInfo | undefined {
        return this.blocks.get(id)
    }
}
