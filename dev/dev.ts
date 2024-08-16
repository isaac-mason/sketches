import express from 'express'
import * as vite from 'vite'
import { resolve } from 'path'
import containerViteConfig from '../container/vite.config.mts'
import * as SketchDevServers from './sketch-dev-servers'
import {
    containerAppDirectory,
    copySketchCoverImages,
    createSketchesMeta,
    getFreePort,
    SketchMeta,
    writeSketchesMeta,
} from './utils'

declare global {
    namespace Express {
        interface Locals {
            sketch?: { meta: SketchMeta; devServer: SketchDevServers.SketchDevServer }
        }
    }
}

const sketchesMeta = await createSketchesMeta()

await writeSketchesMeta(sketchesMeta)
await copySketchCoverImages(sketchesMeta)

const app = express()

// const proxyServer = createProxyServer()

const sketchDevServers = SketchDevServers.init()

// create vite dev server for container app in middleware mode
// so vite creates the hmr websocket server on its own.
// the ws server will be listening at port 24678 by default, and can be
// configured via server.hmr.port
const containerViteDevServer = await vite.createServer({
    ...containerViteConfig,
    root: containerAppDirectory,
    server: {
        middlewareMode: true,
    },
    logLevel: 'info',
})

// append headers required for SharedArrayBuffer
app.use((_req, res, next) => {
    res.appendHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.appendHeader('Cross-Origin-Embedder-Policy', 'credentialless') // 'require-corp')
    res.appendHeader('X-Frame-Options', 'SAMEORIGIN')
    next()
})

app.use('/sketches-static', async (req, res, next) => {
    const sketchMeta = sketchesMeta.find(({ path }) => req.url.startsWith(`/${path}`))

    if (!sketchMeta) {
        return res.status(404)
    }

    // redirect index.html to sketch dev servers
    // server cover images are served from static middlware
    const isIndex = req.url === `/${sketchMeta.path}/index.html`

    if (!isIndex) {
        return next()
    }

    const devServer = await SketchDevServers.get(sketchDevServers, sketchMeta.path)

    res.locals.sketch = { meta: sketchMeta, devServer }

    res.redirect(devServer.url)})

// server static files from public, for sketch cover images
app.use(express.static(resolve(containerAppDirectory, 'public')))

app.use(containerViteDevServer.middlewares)

setInterval(() => {
    // stop dev servers after 60 seconds of inactivity
    SketchDevServers.stopUnusedDevServers(sketchDevServers, 60 * 1000)
}, 5000)

// --port 5173
const portArgIndex = process.argv.indexOf('--port')

let preferredPort = 5173

if (portArgIndex !== -1 && process.argv[portArgIndex + 1]) {
    const portValue = process.argv[portArgIndex + 1]
    preferredPort = Number(portValue)
}

const port = await getFreePort({ from: preferredPort })

if (!port) {
    throw new Error('could not start dev server, no free ports')
}


// handle exit signals
;['exit', 'SIGINT', 'SIGTERM', 'SIGQUIT'].forEach((signal) => {
    process.on(signal, async () => {
        console.log(`Received ${signal}, stopping all sketches...`)

        await SketchDevServers.stopAll(sketchDevServers)

        process.exit()
    })
})

app.listen(port)

console.log(`sketches dev server running at http://127.0.0.1:${port}`)