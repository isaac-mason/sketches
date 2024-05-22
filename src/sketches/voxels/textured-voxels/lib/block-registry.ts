export type BlockInfo = {
    id: number
    name: string
    texture: {
        x: number
        y: number
        width: number
        height: number
    }
}

export class BlockRegistry {
    idCounter = 1 // 0 is reserved for air

    blocks: Map<number, BlockInfo> = new Map()

    blockNameToId: Map<string, number> = new Map()

    register(name: string, texture: BlockInfo['texture']): BlockInfo {
        const id = this.idCounter++
        const block = { id, name, texture }

        this.blocks.set(id, block)
        this.blockNameToId.set(name, id)

        return block
    }

    getBlock(id: number): BlockInfo | undefined {
        return this.blocks.get(id)
    }

    getBlockByName(name: string): BlockInfo | undefined {
        const id = this.blockNameToId.get(name)
        if (id === undefined) {
            return undefined
        }
        return this.getBlock(id)
    }
}
