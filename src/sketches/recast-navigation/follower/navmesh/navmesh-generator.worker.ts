import { RecastConfig, exportNavMesh, init } from 'recast-navigation'
import { generateSoloNavMesh } from 'recast-navigation/generators'

let ready = false

let message: { positions: Float32Array; indices: Uint8Array; recastConfig: RecastConfig } | null = null

const process = () => {
    if (!message) return

    const { positions, indices, recastConfig } = message

    const { success, navMesh } = generateSoloNavMesh(positions, indices, recastConfig)

    if (!success) return

    const navMeshExport = exportNavMesh(navMesh)

    self.postMessage({ navMeshExport })
}

self.onmessage = (msg) => {
    message = msg.data

    if (ready) process()
}

init().then(() => {
    ready = true
    process()
})
