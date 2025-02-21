import * as BlockRegistry from './block-registry'
import * as THREE from 'three'

const N_MIPMAPS = 4
const MIN_FACE_SIZE = Math.pow(2, N_MIPMAPS)

const hashFace = (face: BlockRegistry.BlockCubeFace) => {
    if (face.texture) {
        return `tex-${face.texture.id}`
    } else {
        return `col-${face.color}`
    }
}

type LayoutData = {
    uv: { u1: number; v1: number; u2: number; v2: number }
    canvas: { x: number; y: number; width: number; height: number }
}

const makeEmptyLayoutData = (): LayoutData => ({
    uv: { u1: 0, v1: 0, u2: 0, v2: 0 },
    canvas: { x: 0, y: 0, width: 0, height: 0 },
})

type BlockCubeAtlasLayout = {
    nx: LayoutData
    px: LayoutData
    ny: LayoutData
    py: LayoutData
    nz: LayoutData
    pz: LayoutData
}

export type Layout = ReturnType<typeof createLayout>

export const createLayout = (blockRegistry: BlockRegistry.State, textureSize: number) => {
    const tileMap = new Map<string, { face: BlockRegistry.BlockCubeFace; size: number; layout: LayoutData }>()

    const blockFaceToHash = new Map<BlockRegistry.BlockCubeFace, string>()

    const missingFace: BlockRegistry.BlockCubeFace = { color: '#ff0000' }

    // find unique faces, create atlas tiles for them
    for (const block of blockRegistry.blockIndexToBlock.values()) {
        if (block.cube) {
            for (const faceDir of BlockRegistry.CUBE_FACE_DIRS) {
                const face = block.cube[faceDir] ?? block.cube.default ?? missingFace

                const hash = hashFace(face)

                blockFaceToHash.set(face, hash)

                if (tileMap.has(hash)) continue

                const size = face.texture ? textureSize : MIN_FACE_SIZE

                tileMap.set(hash, { face, size, layout: makeEmptyLayoutData() })
            }
        }
    }

    const tiles = Array.from(tileMap.values()).sort((a, b) => b.size - a.size)

    // find the smallest power of 2 canvas size that can fit all the tiles
    let totalPixels = 0

    for (const tile of tiles) {
        totalPixels += tile.size ** 2
    }

    const canvasSize = Math.pow(2, Math.ceil(Math.log2(Math.sqrt(totalPixels))))
    const canvasWidth = canvasSize
    const canvasHeight = canvasSize

    // layout the tiles in the canvas
    let x = 0
    let y = 0
    let rowHeight = 0

    for (const tile of tiles) {
        if (x + tile.size > canvasSize) {
            x = 0
            y += rowHeight
            rowHeight = 0
        }
        if (y + tile.size > canvasSize) {
            throw new Error('Atlas size too small, increase textureSize')
        }

        tile.layout.canvas = { x, y, width: tile.size, height: tile.size }
        tile.layout.uv = {
            u1: x / canvasWidth, // L
            v1: (canvasHeight - y - tile.size) / canvasHeight, // B
            u2: (x + tile.size) / canvasWidth, // R
            v2: (canvasHeight - y) / canvasHeight, // T
        }

        x += tile.size
        rowHeight = Math.max(rowHeight, tile.size)
    }

    // formt result data
    const blockCubeLayouts = new Map<BlockRegistry.BlockCubeInfo, BlockCubeAtlasLayout>()

    for (const block of blockRegistry.blockIndexToBlock.values()) {
        if (block.cube) {
            const layout: BlockCubeAtlasLayout = {
                nx: tileMap.get(blockFaceToHash.get(block.cube.nx ?? block.cube.default ?? missingFace)!)!.layout,
                px: tileMap.get(blockFaceToHash.get(block.cube.px ?? block.cube.default ?? missingFace)!)!.layout,
                ny: tileMap.get(blockFaceToHash.get(block.cube.ny ?? block.cube.default ?? missingFace)!)!.layout,
                py: tileMap.get(blockFaceToHash.get(block.cube.py ?? block.cube.default ?? missingFace)!)!.layout,
                nz: tileMap.get(blockFaceToHash.get(block.cube.nz ?? block.cube.default ?? missingFace)!)!.layout,
                pz: tileMap.get(blockFaceToHash.get(block.cube.pz ?? block.cube.default ?? missingFace)!)!.layout,
            }
            blockCubeLayouts.set(block.cube, layout)
        }
    }

    return { tiles, blockCubeLayouts, canvasSize }
}

export type Canvas = ReturnType<typeof createCanvas>

export const createCanvas = (layout: Layout, assets: Record<string, HTMLImageElement>) => {
    // create a canvas
    const canvas = document.createElement('canvas')
    canvas.width = layout.canvasSize
    canvas.height = layout.canvasSize

    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingEnabled = false

    // paint tiles into the canvas
    for (const tile of layout.tiles) {
        if (tile.face.color) {
            ctx.fillStyle = tile.face.color // e.g. '#ff0000'
            ctx.fillRect(tile.layout.canvas.x, tile.layout.canvas.y, tile.layout.canvas.width, tile.layout.canvas.height)
        } else if (tile.face.texture) {
            const image = assets[tile.face.texture.id]
            if (!image) continue

            ctx.drawImage(
                image,
                0,
                0,
                image.width,
                image.height,
                tile.layout.canvas.x,
                tile.layout.canvas.y,
                tile.layout.canvas.width,
                tile.layout.canvas.height,
            )
        }
    }

    // create mipmaps
    // generate mipmaps
    const mipmaps: HTMLCanvasElement[] = []

    let currentCanvas = canvas
    for (let i = 0; i < N_MIPMAPS; i++) {
        if (currentCanvas.width <= 1 && currentCanvas.height <= 1) {
            break
        }

        const nextWidth = Math.max(1, Math.floor(currentCanvas.width / 2))
        const nextHeight = Math.max(1, Math.floor(currentCanvas.height / 2))

        const newCanvas = document.createElement('canvas')
        newCanvas.width = nextWidth
        newCanvas.height = nextHeight

        const ctx = newCanvas.getContext('2d')!

        ctx.drawImage(currentCanvas, 0, 0, nextWidth, nextHeight)

        mipmaps.push(newCanvas)
        currentCanvas = newCanvas
    }

    return { canvas, mipmaps }
}

export type Texture = ReturnType<typeof createTexture>

export const createTexture = (canvas: Canvas) => {
    const texture = new THREE.CanvasTexture(canvas.canvas)

    texture.colorSpace = THREE.SRGBColorSpace
    texture.mapping = THREE.UVMapping
    texture.wrapS = THREE.RepeatWrapping
    texture.wrapT = THREE.RepeatWrapping
    texture.magFilter = THREE.NearestFilter
    texture.minFilter = THREE.NearestMipmapLinearFilter
    texture.format = THREE.RGBAFormat
    texture.type = THREE.UnsignedByteType
    texture.anisotropy = 16

    texture.generateMipmaps = false;
    texture.mipmaps = canvas.mipmaps

    return texture
}
