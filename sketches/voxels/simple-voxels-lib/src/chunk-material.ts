import { CanvasTexture } from 'three'
import { Fn } from 'three/src/nodes/TSL.js'
import { attribute, float, mul, sub, texture, uv } from 'three/tsl'
import { MeshStandardNodeMaterial } from 'three/webgpu'

export class ChunkMaterial extends MeshStandardNodeMaterial {
    updateTexture(atlasTexture: CanvasTexture) {
        this.map = atlasTexture

        this.colorNode = Fn(() => {
            const ao = attribute('ao', 'float')

            // TODO: centroid interpolation sampling?
            const color = texture(this.map!, uv())

            const ambientOcclusion = sub(float(1), mul(float(1).sub(ao), 0.5))

            return color.mul(ambientOcclusion)
        })()

        this.needsUpdate = true
    }
}
