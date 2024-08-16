import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react-swc';
import * as fs from 'fs'
import * as path from 'path'
import { defineConfig, UserConfig } from 'vite'

// todo - fixing @/common/* alias for non barrel imports

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

                        // required for iframe embed
                        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
                        
                        next()
                    })
                },
            },
            // for easy local development using features that require a secure context
            basicSsl({
                certDir: path.resolve(rootRepoDirectory, 'dev', 'certs'),
            }),
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
        worker: {
            format: 'es',
        },
        resolve: {
            alias: {
                '@/common': path.resolve(`${rootRepoDirectory}/common`),
            },
        },
        // relative
        base: './',
        server: {
            // don't try to use next available port, exit if port is
            strictPort: true,
        }
    })
}
