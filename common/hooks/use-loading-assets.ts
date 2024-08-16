import { useEffect, useState } from 'react'
import { DefaultLoadingManager } from 'three'

export const useLoadingAssets = () => {
    const [progress, setProgress] = useState(0)

    useEffect(() => {
        const originalOnProgress = DefaultLoadingManager.onProgress

        DefaultLoadingManager.onProgress = (item, loaded, total) => {
            if (typeof originalOnProgress === 'function') {
                originalOnProgress(item, loaded, total)
            }

            setProgress((loaded / total) * 100)
        }

        return () => {
            DefaultLoadingManager.onProgress = originalOnProgress
        }
    }, [])

    return progress !== 100
}
