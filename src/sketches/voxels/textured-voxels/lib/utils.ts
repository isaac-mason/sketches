import * as THREE from 'three'

export class Vector3Map<T> {
    map = new Map<number, Map<number, Map<number, T>>>()

    get({ x, y, z }: THREE.Vector3Like) {
        const xMap = this.map.get(x)

        if (!xMap) {
            return
        }

        const yMap = xMap.get(y)

        if (!yMap) {
            return
        }

        return yMap.get(z)
    }

    set({ x, y, z }: THREE.Vector3Like, value: T) {
        let xMap = this.map.get(x)

        if (!xMap) {
            xMap = new Map()
            this.map.set(x, xMap)
        }

        let yMap = xMap.get(y)

        if (!yMap) {
            yMap = new Map()
            xMap.set(y, yMap)
        }

        yMap.set(z, value)
    }

    *[Symbol.iterator]() {
        for (const xMap of this.map.values()) {
            for (const yMap of xMap.values()) {
                for (const value of yMap.values()) {
                    yield value
                }
            }
        }
    }
}