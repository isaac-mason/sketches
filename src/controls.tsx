import { create } from 'zustand'
import { useScreenshot } from './screenshot'
import { Leva } from 'leva'
import { useEffect, useState } from 'react'

type ControlsState = {
    expanded: boolean
    toggleExpanded: () => void
}

export const useControlsState = create<ControlsState>((set, get) => ({
    expanded: false,
    toggleExpanded: () => set({ expanded: !get().expanded }),
}))

const useIsSmallScreen = () => {
    const [smallScreen, setSmallScreen] = useState(false)

    useEffect(() => {
        const media = window.matchMedia('(max-width: 500px)')

        if (media.matches !== smallScreen) {
            setSmallScreen(media.matches)
        }

        const listener = () => {
            setSmallScreen(media.matches)
        }

        window.addEventListener('resize', listener)

        return () => window.removeEventListener('resize', listener)
    }, [smallScreen])

    return smallScreen
}

export type ControlsProps = {
    expanded?: boolean
}

export const Controls = ({ expanded = false }: ControlsProps) => {
    const { screenshotMode } = useScreenshot()
    const isSmallScreen = useIsSmallScreen()

    return (
        <Leva
            collapsed={!expanded}
            hidden={screenshotMode}
            theme={
                isSmallScreen
                    ? {}
                    : {
                          sizes: {
                              rootWidth: '450px',
                              controlWidth: '160px',
                          },
                      }
            }
        />
    )
}
