import { Leva } from 'leva'
import { Perf } from 'r3f-perf'
import { SetStateAction, Suspense, useEffect, useState } from 'react'
import { RouterProvider, createBrowserRouter, redirect, useLocation } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { DebugTunnel, Spinner } from './common'
import { Sketch, isSketchRoute, sketchComponents, sketches, visibleSketches } from './sketches'
import {
    Menu,
    MenuBackground,
    MenuItem,
    MenuItemImage,
    MenuItemTags,
    MenuItemTitle,
    MenuToggle,
    Page,
    ScreenshotDisplayModeStyles,
    theme,
} from './styles'

const defaultSketch = 'home'
const DefaultComponent = sketchComponents[defaultSketch].Component

const useSketch = () => {
    const { pathname } = useLocation()

    const path = pathname.replace('/sketch/', '')
    const sketchPath = isSketchRoute(path) ? path : defaultSketch

    return sketchPath
}

const RoutedComponent = () => {
    const sketch = useSketch()

    if (!sketch) {
        return <DefaultComponent />
    }

    const { Component } = sketchComponents[sketch]

    return <Component />
}

const modes = ['default', 'debug', 'screenshot'] as const
type DisplayMode = (typeof modes)[number]

type NavigationProps = {
    currentSketch?: string
    displayMode: DisplayMode | null
    menuOpen: boolean
    setMenuOpen: (value: SetStateAction<boolean>) => void
}

const Navigation = ({ menuOpen, setMenuOpen, displayMode, currentSketch: currentRoute }: NavigationProps) => {
    return (
        <>
            {displayMode !== 'screenshot' ? (
                <MenuToggle className="material-symbols-outlined" onClick={() => setMenuOpen((v) => !v)}>
                    menu
                </MenuToggle>
            ) : undefined}

            <div id="menu-container">
                <MenuBackground open={menuOpen} onClick={() => setMenuOpen(false)} />

                <Menu id="menu" open={menuOpen}>
                    {visibleSketches.map((sketch) => (
                        <MenuItem
                            key={sketch.route}
                            to={`/sketch/${sketch.route}`}
                            onClick={() => setMenuOpen(false)}
                            title={sketch.title}
                            className={sketch.route === currentRoute ? 'active' : ''}
                        >
                            {sketch.cover ? <MenuItemImage src={sketch.cover} alt={sketch.title} loading="lazy" /> : undefined}

                            <MenuItemTitle>{sketch.title}</MenuItemTitle>

                            {sketch.tags && (
                                <MenuItemTags>
                                    {sketch.tags.map((tag) => (
                                        <span key={tag}>{tag}</span>
                                    ))}
                                </MenuItemTags>
                            )}
                        </MenuItem>
                    ))}
                </Menu>
            </div>
        </>
    )
}

const App = () => {
    const [menuOpen, setMenuOpen] = useState(false)
    const [displayMode, setDisplayMode] = useState<DisplayMode>('default')
    const [smallScreen, setSmallScreen] = useState(false)

    const sketch = useSketch()

    useEffect(() => {
        if (sketch) {
            gtag({ event: 'sketch_navigation', route: sketch })
        }
    }, [sketch])

    useEffect(() => {
        const handler = (e: WindowEventMap['keyup']): void => {
            if (e.key === '?') {
                const currentIndex = modes.findIndex((m) => m === displayMode)
                const nextModeIndex = (currentIndex + 1) % modes.length
                setDisplayMode(modes[nextModeIndex])
            } else if (e.key === 'Escape') {
                setMenuOpen(false)
            }
        }

        window.addEventListener('keyup', handler)

        return () => {
            window.removeEventListener('keyup', handler)
        }
    }, [displayMode])

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

    return (
        <Page>
            <Leva
                collapsed
                hidden={displayMode === 'screenshot'}
                theme={
                    smallScreen
                        ? {}
                        : {
                              sizes: {
                                  rootWidth: '450px',
                                  controlWidth: '160px',
                              },
                          }
                }
            />

            <Suspense fallback={<Spinner />}>
                <RoutedComponent />
            </Suspense>

            <Navigation menuOpen={menuOpen} setMenuOpen={setMenuOpen} currentSketch={sketch} displayMode={displayMode} />

            {displayMode === 'default' ? (
                <a href={`https://github.com/isaac-mason/sketches/tree/main/src/sketches/${sketch}`}>GitHub</a>
            ) : undefined}

            {displayMode === 'debug' ? (
                <DebugTunnel.In>
                    <Perf position="bottom-right" />
                </DebugTunnel.In>
            ) : undefined}

            {displayMode === 'screenshot' ? <ScreenshotDisplayModeStyles /> : undefined}
        </Page>
    )
}

const router = createBrowserRouter([
    ...sketches.map((sketch) => ({
        path: `/sketch/${sketch.route}`,
        Component: App,
    })),
    {
        path: '/',
        Component: App,
    },
    {
        path: '*',
        element: null,
        loader: async () => {
            return redirect('/')
        },
    },
])

export default () => {
    return (
        <ThemeProvider theme={theme}>
            <RouterProvider router={router} />
        </ThemeProvider>
    )
}
