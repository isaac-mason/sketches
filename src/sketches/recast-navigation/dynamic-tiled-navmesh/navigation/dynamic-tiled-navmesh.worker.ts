import { init } from 'recast-navigation'
import { BuildTileMeshProps, buildTile } from './build-tile'

let ready = false

const inbox: BuildTileMeshProps[] = []

self.onmessage = (msg) => {
    if (ready) {
        process(msg.data)
    } else {
        inbox.push(msg.data)
    }
}

const process = (props: BuildTileMeshProps) => {
    const result = buildTile(props)

    if (!result.success || !result.data) return

    // todo: get from heap
    const ser = new Uint8Array(result.data.size)
    for (let i = 0; i < result.data.size; i++) {
        ser[i] = result.data.get(i)
    }
    
    result.data.free()

    self.postMessage({ tileX: props.tileX, tileY: props.tileY, navMeshData: ser }, [ser.buffer] as never) // todo: type woes
}

init().then(() => {
    ready = true

    for (const job of inbox) {
        process(job)
    }
})

