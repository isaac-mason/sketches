import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { imagetools } from 'vite-imagetools'
import { createHtmlPlugin } from 'vite-plugin-html'
import basicSsl from '@vitejs/plugin-basic-ssl'
import * as path from 'path'
import * as fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig(() => {
    const gtagId = process.env.VITE_GTAG_ID

    const analyticsScript = gtagId
        ? `
    <script async src="https://www.googletagmanager.com/gtag/js?id=${gtagId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());

      gtag('config', '${gtagId}');
    </script>
    `
        : `
    <script>
      window.dataLayer = [];
      function gtag() { dataLayer.push(arguments); }
    </script>
    `

    return {
        plugins: [
            react({
                babel: {
                    plugins: [
                        ['@babel/plugin-proposal-decorators', { legacy: true }],
                        ['@babel/plugin-proposal-class-properties', { loose: true }],
                    ],
                },
            }),
            createHtmlPlugin({
                minify: true,
                inject: {
                    data: {
                        analyticsScript,
                    },
                },
            }),
            imagetools(),
            {
                name: 'configure-server',
                configureServer: (server) => {
                    // add headers required for SharedArrayBuffer
                    server.middlewares.use((_req, res, next) => {
                        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
                        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
                        next()
                    })

                    // respond with static html files for 'sketches-static/*' requests
                    // server.middlewares.use((req, res, next) => {
                    //     if (req.url?.includes('/sketches-static')) {
                    //         console.log(req.url)
                    //         req.url += '.html'
                    //         const sketchPath = req.url.replace('/sketches-static', '')
                    //         res.setHeader('Content-Type', 'text/html')
                    //         res.writeHead(200)
                    //         res.write(fs.readFileSync(path.join(__dirname, `sketches-static/${sketchPath}`)))
                    //         res.end()
                    //     }
                    //     next()
                    // })
                },
            },
            // hack: work around issues with WebGPURenderer
            {
                name: 'no-treeshake-three-examples-jsm-renderers',
                transform(_code, id) {
                    if (id.includes('three/examples/jsm/renderers')) {
                        return { moduleSideEffects: 'no-treeshake' }
                    }
                },
            },
            // for easy local development using features that require a secure context
            basicSsl(),
        ],
        optimizeDeps: {
            esbuildOptions: {
                target: 'esnext',
            },
            exclude: [
                // these packages do not play nicely with vite pre-bundling
                'recast-navigation',
            ],
        },
        build: {
            target: 'esnext',
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, './src'),
            },
        },
        worker: {
            format: 'es',
        },
        publicDir: 'public',
    }
})
