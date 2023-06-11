import { Leva } from 'leva'
import { Perf } from 'r3f-perf'
import { SetStateAction, Suspense, useEffect, useState } from 'react'
import { Route, HashRouter as Router, Routes, useMatch } from 'react-router-dom'
import { ThemeProvider } from 'styled-components'
import { Spinner } from './components/spinner'
import { DebugTunnel } from './debug-tunnel'
import {
    Sketch,
    isSketchRoute,
    sketchComponents,
    visibleSketches,
} from './sketches'
import {
    Menu,
    MenuBackground,
    MenuItem,
    MenuItemImage,
    MenuItemTitle,
    MenuToggle,
    Page,
    ScreenshotDisplayModeStyles,
    theme,
} from './styles'

const defaultSketch = 'Home'
const DefaultComponent = sketchComponents[defaultSketch].Component

const RoutedComponent = () => {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }
    const sketchName = isSketchRoute(routeName) ? routeName : defaultSketch
    const { Component } = sketchComponents[sketchName]
    return <Component />
}

const modes = ['default', 'debug', 'screenshot'] as const
type DisplayMode = (typeof modes)[number]

type NavigationProps = {
    currentRoute?: string
    displayMode: DisplayMode | null
    menuOpen: boolean
    setMenuOpen: (value: SetStateAction<boolean>) => void
}

const Navigation = ({
    menuOpen,
    setMenuOpen,
    displayMode,
    currentRoute,
}: NavigationProps) => {
    return (
        <>
            {displayMode !== 'screenshot' ? (
                <MenuToggle
                    className="material-symbols-outlined"
                    onClick={() => setMenuOpen((v) => !v)}
                >
                    menu
                </MenuToggle>
            ) : undefined}

            <div id="menu-container">
                <MenuBackground
                    open={menuOpen}
                    onClick={() => setMenuOpen(false)}
                />
                <Menu id="menu" open={menuOpen}>
                    {visibleSketches.map((sketch) => (
                        <MenuItem
                            key={sketch.route}
                            to={`/sketch/${sketch.route}`}
                            title={sketch.title}
                            className={
                                sketch.route === currentRoute ? 'active' : ''
                            }
                        >
                            {(sketch as Sketch).cover ? (
                                <MenuItemImage
                                    src={sketch.cover}
                                    alt={sketch.title}
                                />
                            ) : undefined}
                            <MenuItemTitle>{sketch.title}</MenuItemTitle>
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

    const {
        params: { name: currentRoute },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }

    useEffect(() => {
        gtag({ event: 'sketch_navigation', route: currentRoute })
    }, [currentRoute])

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
                <Routes>
                    <Route path="/*" element={<DefaultComponent />} />
                    <Route path="/sketch/:name" element={<RoutedComponent />} />
                </Routes>
            </Suspense>

            <Navigation
                menuOpen={menuOpen}
                setMenuOpen={setMenuOpen}
                currentRoute={currentRoute}
                displayMode={displayMode}
            />

            {displayMode === 'default' ? (
                <a
                    href={`https://github.com/isaac-mason/sketches/tree/main/src/sketches/sketch-${currentRoute}`}
                >
                    GitHub
                </a>
            ) : undefined}

            {displayMode === 'debug' ? (
                <DebugTunnel.In>
                    <Perf position="bottom-right" />
                </DebugTunnel.In>
            ) : undefined}

            {displayMode === 'screenshot' ? (
                <ScreenshotDisplayModeStyles />
            ) : undefined}
        </Page>
    )
}

export default () => {
    return (
        <Router>
            <ThemeProvider theme={theme}>
                <App />
            </ThemeProvider>
        </Router>
    )
}
