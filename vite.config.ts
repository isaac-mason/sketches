import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import viteImagemin from 'vite-plugin-imagemin'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        viteImagemin({
            pngquant: {
                quality: [0.8, 0.9],
                speed: 4,
            },
        }),
    ],
})
