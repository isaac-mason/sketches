import * as THREE from 'three'
import { BufferGeometry } from 'three'
import { CulledMesherChunkResult } from './culled-mesher'

export class ChunkGeometry extends BufferGeometry {
    updateChunk({ indices, positions, normals, colors, ambientOcclusion }: CulledMesherChunkResult) {
        this.setIndex(new THREE.BufferAttribute(indices, 1))
        this.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
        this.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        this.setAttribute('ambientOcclusion', new THREE.BufferAttribute(ambientOcclusion, 1))

        this.computeBoundingBox()
        this.computeBoundingSphere()
    }
}
