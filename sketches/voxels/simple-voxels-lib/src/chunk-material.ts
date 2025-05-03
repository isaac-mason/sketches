import type { CanvasTexture } from 'three';
import { Fn } from 'three/src/nodes/TSL.js';
import { attribute, float, mul, sub, texture, uv } from 'three/tsl';
import { InterpolationSamplingMode, InterpolationSamplingType, MeshStandardNodeMaterial } from 'three/webgpu';

export class ChunkMaterial extends MeshStandardNodeMaterial {
    updateTexture(atlasTexture: CanvasTexture) {
        this.colorNode = Fn(() => {
            const ao = attribute('ao', 'float');

            const atlasUv = uv().toVarying().setInterpolation(InterpolationSamplingType.PERSPECTIVE, InterpolationSamplingMode.CENTROID);
            const color = texture(atlasTexture, atlasUv);

            const ambientOcclusion = sub(float(1), mul(float(1).sub(ao), 0.5));

            return color.mul(ambientOcclusion);
        })();

        this.needsUpdate = true;
    }
}
