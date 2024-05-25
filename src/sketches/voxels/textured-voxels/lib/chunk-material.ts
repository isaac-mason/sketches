import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { MeshStandardNodeMaterial, attribute, texture, uv, vec2 } from 'three/examples/jsm/nodes/Nodes.js'
import { TextureAtlas } from './texture-atlas'

export class ChunkMaterial extends MeshStandardNodeMaterial {
    constructor(textureAtlas: TextureAtlas) {
        super()

        const atlas = new CanvasTexture(textureAtlas.canvas)
        atlas.magFilter = NearestFilter
        atlas.colorSpace = SRGBColorSpace
        atlas.needsUpdate = true

        const tex = attribute('tex', 'vec4') // x, y, w, h

        const coord = uv().mul(vec2(tex.z, tex.w)).add(vec2(tex.x, tex.y)).div(vec2(atlas.image.width, atlas.image.height))

        const color = texture(atlas, coord)

        this.colorNode = color
    }
}
