import { useEffect, useState } from 'react'
import { suspend } from 'suspend-react'
import * as THREE from 'three'
import { useVoxels } from './react'

export const useGoxelLevel = (url: string) => {
    const { voxels } = useVoxels()
    const [ready, setReady] = useState(false)

    const mapText = suspend(async () => {
        const response = await fetch(url)
        const text = await response.text()

        return text
    }, [])

    useEffect(() => {
        function* loadMap() {
            const cursor = new THREE.Vector3()
            const color = new THREE.Color()

            const batchSize = 100000

            const lines = mapText.split('\n')

            for (let i = 0; i < lines.length; i += batchSize) {
                for (let j = 0; j < batchSize; j++) {
                    const entry = lines[i + j]

                    if (entry === undefined || entry.trim() === '' || entry[0] === '#') continue

                    const [x, y, z, colorHex] = entry.split(' ')

                    cursor.set(Number(x), Number(z), Number(y))
                    color.set(`#${colorHex}`)

                    voxels.setBlock(cursor, {
                        solid: true,
                        color: color.getHex(),
                    })
                }

                yield
            }
        }

        let discard = false

        const iterator = loadMap()

        const tick = () => {
            if (discard) return

            const { done } = iterator.next()

            if (done) {
                setReady(true)
            } else {
                requestAnimationFrame(tick)
            }
        }

        tick()

        return () => {
            discard = true
        }
    }, [])

    return ready
}
