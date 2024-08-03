import * as vite from 'vite'
import express from 'express'
import viteConfig from './vite.config.mts'

const app = express()

// create vite dev server in middleware mode
// so vite creates the hmr websocket server on its own.
// the ws server will be listening at port 24678 by default, and can be
// configured via server.hmr.port
const viteServer = await vite.createServer({
    ...viteConfig,
    server: {
        middlewareMode: true,
    },
    logLevel: 'info',
})

app.use('*', (req, res, next) => {
    res.appendHeader('Cross-Origin-Opener-Policy', 'same-origin')
    res.appendHeader('Cross-Origin-Embedder-Policy', 'require-corp')
    res.appendHeader('X-Frame-Options', 'SAMEORIGIN')
    next()
})

// serve static sketch files
app.use(express.static('public'))

app.use(viteServer.middlewares)

app.listen(5173)
