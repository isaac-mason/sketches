export type BlockCubeFace = {
    texture?: { id: string }
    color?: string
}

export const CUBE_FACE_DIRS = ['px', 'nx', 'py', 'ny', 'pz', 'nz'] as const

export type BlockCubeInfo = {
    default?: BlockCubeFace
    px?: BlockCubeFace
    nx?: BlockCubeFace
    py?: BlockCubeFace
    ny?: BlockCubeFace
    pz?: BlockCubeFace
    nz?: BlockCubeFace
}

export type BlockInfo = {
    cube?: BlockCubeInfo
}

export type Block = {
    index: number
} & BlockInfo

export const init = () => {
    const blockIndexToBlock = new Map<number, Block>()

    return {
        blockIndexToBlock,
        indexCounter: 1, // 0 is reserved for air
        lastUpdateTime: 0,
    }
}

export type State = ReturnType<typeof init>

export const add = (state: State, block: BlockInfo) => {
    const index = state.indexCounter++

    const newBlock = { index, ...block }

    state.blockIndexToBlock.set(index, newBlock)

    state.lastUpdateTime = Date.now()

    return newBlock
}
