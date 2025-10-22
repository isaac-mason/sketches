import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        {
            name: 'configure-server',
            configureServer: (server) => {
                server.middlewares.use((_req, res, next) => {
                    // required for iframe embed
                    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
                    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
                    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

                    next();
                });
            },
        },
    ],
    build: {
        target: 'esnext',
    },
    base: './',
});
