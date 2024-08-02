import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import * as fs from 'fs'
import * as path from 'path'
import { defineConfig, UserConfig } from 'vite'

function findRootPackageJson(currentDirectory: string) {
    while (currentDirectory !== path.parse(currentDirectory).root) {
        const packageJsonPath = path.join(currentDirectory, 'package.json')
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

            if (packageJson.name === 'sketches') {
                return currentDirectory
            }
        }
        currentDirectory = path.dirname(currentDirectory)
    }
    throw new Error('Root package.json with name "sketches" not found')
}

export const createCommonConfig = (currentDirectory: string): UserConfig => {
    const rootRepoDirectory = findRootPackageJson(currentDirectory)

    console.log(rootRepoDirectory)

    return defineConfig({
        plugins: [
            react(),
            {
                name: 'configure-server',
                configureServer: (server) => {
                    server.middlewares.use((_req, res, next) => {
                        // required for SharedArrayBuffer
                        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
                        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
                        next()
                    })
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
                '@/': path.resolve(`${rootRepoDirectory}/src`),
            },
        },
        worker: {
            format: 'es',
        },
        // relative paths
        base: './',
    })
}
