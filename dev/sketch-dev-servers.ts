import * as path from 'node:path';
import { $, type Subprocess } from 'bun';
import {
    type SketchMeta,
    getFreePorts,
    isPortFree,
    rootDirectory,
} from './utils';

export type SketchDevServer = {
    process?: Subprocess;
    port: number;
    url: string;
    path: string;
    lastRequestTime: number;
};

export type SketchDevServerState = {
    sketches: Map<string, SketchDevServer>;
};

export const init = () => {
    return {
        sketches: new Map<string, SketchDevServer>(),
    };
};

async function watchSketchOutputReadableStream(
    sketch: SketchDevServer,
    stream: ReadableStream,
    streamName: string,
) {
    const reader = stream.getReader();

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (value) {
                const text = new TextDecoder().decode(value);

                console.log(`[${sketch.path}] [${streamName}]:\n${text}`);
            }

            if (done) {
                // stream is closed, exit loop
                break;
            }

            sketch.lastRequestTime = Date.now();
        }
    } catch (error) {
        console.error('Stream processing error:', error);
    } finally {
        reader.releaseLock();
    }
}

export const get = async (
    state: SketchDevServerState,
    sketchPath: string,
    sketchMeta: SketchMeta,
): Promise<SketchDevServer> => {
    const previouslyStartedSketch = state.sketches.get(sketchPath);

    // if the sketch is already running, return it
    if (previouslyStartedSketch?.process) {
        return previouslyStartedSketch;
    }

    let port: number | undefined = undefined;

    if (previouslyStartedSketch) {
        const isPreviousSketchPortFree = await isPortFree(
            previouslyStartedSketch.port,
        );

        if (isPreviousSketchPortFree) {
            port = previouslyStartedSketch.port;
        }
    }

    if (!port) {
        const freePorts = await getFreePorts();

        // if the sketch was previously started, try to reuse the port.
        // otherwise use the first port not reserved by another sketch.
        if (
            previouslyStartedSketch &&
            freePorts.includes(previouslyStartedSketch.port)
        ) {
            port = previouslyStartedSketch.port;
        } else {
            const sketchPorts = Array.from(state.sketches.values()).map(
                (sketch) => sketch.port,
            );

            const unreservedPorts = freePorts.filter(
                (freePort) => !sketchPorts.includes(freePort),
            );

            port = unreservedPorts[0];
        }
    }

    if (!port) {
        throw new Error('no free ports');
    }

    const secure = sketchMeta.dev?.secure ?? true;
    const url = `http${secure ? 's' : ''}://localhost:${port}/`;

    const cwd = path.resolve(rootDirectory, 'sketches', sketchPath);

    const process = Bun.spawn({
        cmd: ['pnpm', 'run', 'dev', '--port', String(port)],
        cwd,
        stdout: 'pipe',
        stderr: 'pipe',
    });

    // try to wait until the dev server is up
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            await fetch(url);
            break;
        } catch (e) {
            await new Promise((r) => setTimeout(r, 100));
        }
    }

    console.log(`started dev server for ${sketchPath} at ${url}`);

    const sketch = {
        proc: process,
        url,
        path: sketchPath,
        port,
        lastRequestTime: Date.now(),
    };

    state.sketches.set(sketchPath, sketch);

    watchSketchOutputReadableStream(sketch, process.stdout, 'stdout');
    watchSketchOutputReadableStream(sketch, process.stderr, 'stderr');

    return sketch;
};

export const stop = async (state: SketchDevServerState, path: string) => {
    const sketch = state.sketches.get(path);

    if (!sketch) return;

    if (sketch.process) {
        sketch.process.kill();

        // also kill any process using the sketch port
        // proc.kill does not kill grandchildren processes
        await $`lsof -i :${sketch.port} | grep LISTEN | awk '{print $2}' | xargs kill -9`.quiet();

        sketch.process = undefined;
    }
};

export const stopAll = async (state: SketchDevServerState) => {
    for (const [, sketch] of state.sketches) {
        await stop(state, sketch.path);
    }
};

export const stopUnusedDevServers = (
    state: SketchDevServerState,
    msSinceLastRequest: number,
) => {
    for (const [, sketch] of state.sketches) {
        if (
            sketch.process &&
            Date.now() - sketch.lastRequestTime > msSinceLastRequest
        ) {
            console.log(`stopping unused dev server for ${sketch.path}`);
            stop(state, sketch.path);
        }
    }
};
