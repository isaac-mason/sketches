import { Subprocess } from 'bun'
import { getFreePort, rootDirectory } from './utils'
import * as path from 'path'

export type SketchDevServer = { proc: Subprocess; url: string; path: string; lastRequestTime: number }

export type SketchDevServerState = {
    runningSketches: Map<string, SketchDevServer>
}

export const init = () => {
    return {
        runningSketches: new Map<string, SketchDevServer>(),
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
    const existingSketch = state.runningSketches.get(sketchPath)

    if (existingSketch) {
        return existingSketch
    }

    const port = await getFreePort()

    if (!port) {
        throw new Error('no free ports')
    }

    const url = `https://localhost:${port}/`

    const cwd = path.resolve(rootDirectory, 'sketches', sketchPath)
    const proc = Bun.spawn({
        cmd: ['yarn', 'dev', '--port', String(port), '--base', url],
        cwd,
        env: {
            VITE_BASE: url,
        },
        stdout: 'pipe',
        stderr: 'pipe',
    })

    // wait until the dev server is up
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await fetch(url)
            break
        } catch (e) {
            await new Promise((r) => setTimeout(r, 100))
        }
    }

    console.log(`started dev server for ${sketchPath} at ${url}`)

    const sketch = { proc, url, path: sketchPath, lastRequestTime: Date.now() }

    state.runningSketches.set(sketchPath, sketch)

    watchSketchOutputReadableStream(sketch, proc.stdout, 'stdout')
    watchSketchOutputReadableStream(sketch, proc.stderr, 'stderr')

    return sketch
}

export const stop = async (state: SketchDevServerState, path: string) => {
    const sketch = state.runningSketches.get(path)

    if (!sketch) return

    sketch.proc.kill()

    state.runningSketches.delete(path)
}

export const stopAll = async (state: SketchDevServerState) => {
    for (const [, sketch] of state.runningSketches) {
        await stop(state, sketch.path)
    }
}

export const stopUnusedDevServers = (state: SketchDevServerState, msSinceLastRequest: number) => {
    for (const [, sketch] of state.runningSketches) {
        if (Date.now() - sketch.lastRequestTime > msSinceLastRequest) {
            console.log(`stopping unused dev server for ${sketch.path}`)
            stop(state, sketch.path)
        }
    }
}
