import * as THREE from 'three'
import { BufferGeometry } from 'three'
import { CulledMesherResult } from './culled-mesher'

export class ChunkGeometry extends BufferGeometry {
    setMesherData({ indices, positions, normals, light, uv, tex }: CulledMesherResult) {
        this.setIndex(new THREE.BufferAttribute(indices, 1))
        this.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
        this.setAttribute('light', new THREE.BufferAttribute(light, 3))
        this.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        this.setAttribute('tex', new THREE.BufferAttribute(tex, 4))
        this.computeBoundingBox()
        this.computeBoundingSphere()
    }
}
