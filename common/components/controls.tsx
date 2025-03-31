import { Leva } from 'leva'
import { useEffect, useState } from 'react'

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
    const isSmallScreen = useIsSmallScreen()

    return (
        <Leva
            collapsed={!expanded}
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
