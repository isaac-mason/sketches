import * as THREE from 'three'

const hash = (x: number, y: number, z: number) => `${x},${y},${z}`

export class Vector3Map<T> {
    map = new Map<string, T>()

    get(x: number, y: number, z: number) {
        return this.map.get(hash(x, y, z))
    }

    set({ x, y, z }: THREE.Vector3Like, value: T) {
        this.map.set(hash(x, y, z), value)
    }

    *[Symbol.iterator]() {
        for (const value of this.map.values()) {
            yield value
        }
    }
}
