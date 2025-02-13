import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three'
import { attribute, float, texture, uv, vec2 } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { TextureAtlas } from './texture-atlas'

export class ChunkMaterial extends MeshStandardNodeMaterial {
    constructor(textureAtlas: TextureAtlas) {
        super()

        const atlas = new CanvasTexture(textureAtlas.canvas)
        atlas.magFilter = NearestFilter
        atlas.colorSpace = SRGBColorSpace
        atlas.needsUpdate = true

        const tex = attribute('tex', 'vec4') // x, y, w, h

        const atlasHeight = float(atlas.image.height)
        const adjustedY = atlasHeight.sub(tex.y).sub(tex.w)

        const coord = uv().mul(vec2(tex.z, tex.w)).add(vec2(tex.x, adjustedY)).div(vec2(atlas.image.width, atlas.image.height))

        const color = texture(atlas, coord)

        this.colorNode = color
    }
}
