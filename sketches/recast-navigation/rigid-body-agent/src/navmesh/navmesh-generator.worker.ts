import { RecastConfig, init } from 'recast-navigation'
import { createSoloNavMeshData } from './create-solo-nav-mesh-data'

let ready = false

let message: { positions: Float32Array; indices: Uint8Array; recastConfig: RecastConfig } | null = null

const process = () => {
    if (!message) return

    const { positions, indices, recastConfig } = message

    const { success, navMeshData } = createSoloNavMeshData(positions, indices, recastConfig)

    if (!success) return

    const ser = navMeshData.toTypedArray()

    navMeshData.destroy()

    self.postMessage({ navMeshData: ser }, [ser.buffer] as never) // todo: type woes
}

self.onmessage = (msg) => {
    message = msg.data

    if (ready) process()
}

init().then(() => {
    ready = true
    process()
})
