import * as THREE from 'three'

type GroundGeometryOptions = {
    width: number
    getGroundHeight: (x: number, z: number) => number
}

export class GroundGeometry extends THREE.PlaneGeometry {
    constructor({ width, getGroundHeight }: GroundGeometryOptions) {
        super(width, width, 32, 32)

        this.rotateX(-Math.PI / 2)

        for (let i = 0; i < this.attributes.position.array.length / 3; i++) {
            const x = this.attributes.position.array[i * 3 + 0]
            const z = this.attributes.position.array[i * 3 + 2]

            const y = getGroundHeight(x, z)
            this.attributes.position.array[i * 3 + 1] = y
        }

        this.computeVertexNormals()
    }
}
