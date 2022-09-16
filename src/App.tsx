import { Leva } from 'leva'
import { Suspense, useEffect, useState } from 'react'
import {
    HashRouter as Router,
    Route,
    Routes,
    useMatch,
} from 'react-router-dom'
import { Loader } from './Loader'
import { isSketchRoute, Sketch, sketchComponents, sketchList } from './sketches'
import {
    GlobalStyle,
    HideH1GlobalStyle,
    Menu,
    MenuContainer,
    MenuItem,
    MenuItemImage,
    MenuItemTitle,
    MenuToggle,
    Page,
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

const modes = ['default', 'screenshot'] as const

function App() {
    const [displayMode, setDisplayMode] = useState<typeof modes[number]>('default')

    const [menuOpen, setMenuOpen] = useState(false)

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

    const {
        params: { name: currentRouteName },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }

    return (
        <Page>
            <Leva collapsed />

            <Suspense fallback={<Loader />}>
                <Routes>
                    <Route path="/*" element={<DefaultComponent />} />
                    <Route path="/sketch/:name" element={<RoutedComponent />} />
                </Routes>
            </Suspense>

            <MenuToggle
                className="material-symbols-outlined"
                onClick={() => setMenuOpen((v) => !v)}
            >
                menu
            </MenuToggle>
            
            <MenuContainer
                id="menu-container"
                open={menuOpen}
                onClick={() => setMenuOpen(false)}
            >
                <Menu id="menu" open={menuOpen}>
                    {sketchList.map((sketch) => (
                        <MenuItem
                            key={sketch.route}
                            to={`/sketch/${sketch.route}`}
                            title={sketch.title}
                            className={sketch.route === currentRouteName ? 'active' : ''}
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
            </MenuContainer>

            {displayMode !== 'screenshot' ? (
                <>
                    <a href={`https://github.com/isaac-mason/sketches/tree/main/src/sketches/sketch-${currentRouteName}`}>Github</a>
                </>
            ) : undefined}

            {displayMode === 'screenshot' ? (
                <HideH1GlobalStyle />
            ) : undefined}
        </Page>
    )
}

export default function () {
    return (
        <Router>
            <App />
            <GlobalStyle />
        </Router>
    )
}
