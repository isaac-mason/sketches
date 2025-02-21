import { CanvasTexture } from 'three'
import { attribute, float, mul, sub, texture, uv } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

export class ChunkMaterial extends MeshStandardNodeMaterial {
    updateTexture(atlasTexture: CanvasTexture) {
        this.map = atlasTexture

        const ao = attribute('ambientOcclusion', 'float')

        const color = texture(this.map, uv())

        const ambientOcclusion = sub(float(1), mul(float(1).sub(ao), 0.5))

        this.colorNode = color.mul(ambientOcclusion)

        this.needsUpdate = true
    }
}
