import { Perf } from 'r3f-perf'
import { useEffect } from 'react'
import { create } from 'zustand'

type DebugState = {
    debugMode: boolean
    toggleDebug: () => void
}

export const useDebug = create<DebugState>((set, get) => ({
    debugMode: false,
    toggleDebug: () => set({ debugMode: !get().debugMode }),
}))

export const DebugKeyboardControls = () => {
    const { toggleDebug } = useDebug()

    useEffect(() => {
        const handler = (e: WindowEventMap['keyup']): void => {
            if (e.key === ';') {
                toggleDebug()
            }
        }

        window.addEventListener('keyup', handler)

        return () => {
            window.removeEventListener('keyup', handler)
        }
    }, [])

    return null
}

export const ThreeDebug = () => {
    const { debugMode } = useDebug()

    if (!debugMode) {
        return null
    }

    return <Perf position="bottom-right" />
}
