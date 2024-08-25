import { $, Subprocess } from 'bun'
import { getFreePorts, isPortFree, rootDirectory } from './utils'
import * as path from 'path'

export type SketchDevServer = { process?: Subprocess; port: number; url: string; path: string; lastRequestTime: number }

export type SketchDevServerState = {
    sketches: Map<string, SketchDevServer>
}

export const init = () => {
    return {
        sketches: new Map<string, SketchDevServer>(),
    }
}

async function watchSketchOutputReadableStream(sketch: SketchDevServer, stream: ReadableStream, streamName: string) {
    const reader = stream.getReader()

    try {
        while (true) {
            const { done, value } = await reader.read()

            if (value) {
                const text = new TextDecoder().decode(value)

                console.log(`[${sketch.path}] [${streamName}]:\n${text}`)
            }

            if (done) {
                // stream is closed, exit loop
                break
            }

            sketch.lastRequestTime = Date.now()
        }
    } catch (error) {
        console.error('Stream processing error:', error)
    } finally {
        reader.releaseLock()
    }
}

export const get = async (state: SketchDevServerState, sketchPath: string): Promise<SketchDevServer> => {
    const existingSketch = state.sketches.get(sketchPath)

    // if the sketch is already running, return it
    if (existingSketch && existingSketch.process) {
        return existingSketch
    }

    let port: number | undefined = undefined

    if (existingSketch) {
        const existingSketchPortFree = await isPortFree(existingSketch.port)

        if (existingSketchPortFree) {
            port = existingSketch.port
        }
    }

    if (!port) {
        const freePorts = await getFreePorts()

        // if the sketch was previously started, try to reuse the port.
        // otherwise use the first port not reserved by another sketch.
        if (existingSketch && freePorts.includes(existingSketch.port)) {
            port = existingSketch.port
        } else {
            const sketchPorts = Array.from(state.sketches.values()).map((sketch) => sketch.port)

            const unreservedPorts = freePorts.filter((freePort) => !sketchPorts.includes(freePort))

            port = unreservedPorts[0]
        }
    }

    if (!port) {
        throw new Error('no free ports')
    }

    const url = `https://localhost:${port}/`

    const cwd = path.resolve(rootDirectory, 'sketches', sketchPath)

    const process = Bun.spawn({
        cmd: ['yarn', 'dev', '--port', String(port)],
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    })

    // try to wait until the dev server is up
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await fetch(url)
            break
        } catch (e) {
            await new Promise((r) => setTimeout(r, 100))
        }
    }

    console.log(`started dev server for ${sketchPath} at ${url}`)

    const sketch = { proc: process, url, path: sketchPath, port, lastRequestTime: Date.now() }

    state.sketches.set(sketchPath, sketch)

    watchSketchOutputReadableStream(sketch, process.stdout, 'stdout')
    watchSketchOutputReadableStream(sketch, process.stderr, 'stderr')

    return sketch
}

export const stop = async (state: SketchDevServerState, path: string) => {
    const sketch = state.sketches.get(path)

    if (!sketch) return

    if (sketch.process) {
        sketch.process.kill()

        // also kill any process using the sketch port
        // proc.kill does not kill grandchildren processes
        await $`lsof -i :${sketch.port} | grep LISTEN | awk '{print $2}' | xargs kill -9`.quiet()

        sketch.process = undefined
    }
}

export const stopAll = async (state: SketchDevServerState) => {
    for (const [, sketch] of state.sketches) {
        await stop(state, sketch.path)
    }
}

export const stopUnusedDevServers = (state: SketchDevServerState, msSinceLastRequest: number) => {
    for (const [, sketch] of state.sketches) {
        if (sketch.process && Date.now() - sketch.lastRequestTime > msSinceLastRequest) {
            console.log(`stopping unused dev server for ${sketch.path}`)
            stop(state, sketch.path)
        }
    }
}
