import express from 'express'
import path from 'path'
import { getFreePorts } from './utils'

/**
 * A simple static file server that adds the necessary headers for SharedArrayBuffer and iframe embedding.
 *
 * Usage:
 * ```
 * bun run dev/static-server.ts ./path/to/directory --port 3000
 * ```
 */

const app = express()

const directory = process.argv[2]

if (!directory) {
    console.error('Please provide a directory to serve as the first command line argument.')
    process.exit(1)
}

const absolutePath = path.resolve(directory)

app.use((_req, res, next) => {
    // Required for SharedArrayBuffer
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')

    // Required for iframe embed
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')

    next()
})

app.use(express.static(absolutePath))

const portArgIndex = process.argv.indexOf('--port')
const portArgValue = portArgIndex !== -1 ? process.argv[portArgIndex + 1] : undefined

let port: number

if (portArgValue) {
    port = Number(portArgValue)
} else {
    const [freePort] = await getFreePorts({ count: 1 })
    port = freePort
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`)
    console.log(`Serving files from: ${absolutePath}`)
})
