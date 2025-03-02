import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react-swc'
import * as path from 'path'
import { defineConfig } from 'vite'
import { imagetools } from 'vite-imagetools'
import { createHtmlPlugin } from 'vite-plugin-html'

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
            react(),
            createHtmlPlugin({
                minify: true,
                inject: {
                    data: {
                        analyticsScript,
                    },
                },
            }),
            imagetools(),
            tailwindcss(),
        ],
        optimizeDeps: {
            esbuildOptions: {
                target: 'esnext',
            },
        },
        build: {
            target: 'esnext',
        },
        resolve: {
            alias: {
                '@common': path.resolve(import.meta.dirname, './common'),
            },
        },
        publicDir: 'public',
    }
})
