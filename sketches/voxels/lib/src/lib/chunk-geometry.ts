import * as THREE from 'three'
import { BufferGeometry } from 'three'
import { CulledMesherResult } from './culled-mesher'
import { CHUNK_SIZE } from './world'

export class ChunkGeometry extends BufferGeometry {
    constructor() {
        super()

        this.boundingBox = new THREE.Box3()
        this.boundingBox.min.set(0, 0, 0)
        this.boundingBox.max.set(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE)

        this.boundingSphere = new THREE.Sphere()
        this.boundingSphere.center.set(CHUNK_SIZE / 2, CHUNK_SIZE / 2, CHUNK_SIZE / 2)
        this.boundingSphere.radius = (Math.sqrt(3) * CHUNK_SIZE) / 2
    }

    setMesherData({ indices, positions, normals, uv, ao }: CulledMesherResult) {
        this.setIndex(new THREE.BufferAttribute(indices, 1))
        this.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        this.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
        this.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
        this.setAttribute('ao', new THREE.BufferAttribute(ao, 1))
    }
}
