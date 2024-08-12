import { useEffect } from "react"
import { create } from "zustand"

export type ScreenshotState = {
    screenshotMode: boolean
    toggleScreenshotMode: () => void
}

export const useScreenshot = create<ScreenshotState>((set, get) => ({
    screenshotMode: false,
    toggleScreenshotMode: () => set({ screenshotMode: !get().screenshotMode }),
}))

export const ScreenshotKeyboardControls = () => {
    const { toggleScreenshotMode } = useScreenshot()

    useEffect(() => {
        const handler = (e: WindowEventMap['keyup']): void => {
            if (e.key === "'") {
                toggleScreenshotMode()
            }
        }

        window.addEventListener('keyup', handler)

        return () => {
            window.removeEventListener('keyup', handler)
        }
    }, [])

    return null
}