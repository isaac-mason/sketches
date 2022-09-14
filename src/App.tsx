import { Leva } from 'leva'
import { KeyboardEvent, Suspense, useEffect, useState } from 'react'
import {
    HashRouter as Router,
    Link,
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
    SketchPanel,
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
    const [mode, setMode] = useState<typeof modes[number]>('default')

    useEffect(() => {
        const handler = (e: WindowEventMap['keyup']): void => {
            if (e.key === '?') {
                const currentIndex = modes.findIndex((m) => m === mode)
                console.log(currentIndex)
                const nextModeIndex = (currentIndex + 1) % modes.length
                console.log(nextModeIndex)
                setMode(modes[nextModeIndex])
            }
        }

        window.addEventListener('keyup', handler)

        return () => {
            window.removeEventListener('keyup', handler)
        }
    }, [mode])

    return (
        <Page>
            <Leva collapsed />
            <Suspense fallback={<Loader />}>
                <Routes>
                    <Route path="/*" element={<DefaultComponent />} />
                    <Route path="/sketch/:name" element={<RoutedComponent />} />
                </Routes>
            </Suspense>
            {mode !== 'screenshot' ? (
                <>
                    <Sketches /> 
                    <a href="https://github.com/isaac-mason/sketches">Github</a>
                </>
            ) : undefined}
            {mode === 'screenshot' ? (
                <HideH1GlobalStyle />
            ) : undefined}
        </Page>
    )
}

function Sketches() {
    const {
        params: { name: currentRouteName },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }

    const [open, setOpen] = useState(false)

    return (
        <>
            <SketchPanel>
                <MenuToggle
                    className="material-symbols-outlined"
                    onClick={() => setOpen((v) => !v)}
                >
                    menu
                </MenuToggle>
            </SketchPanel>
            <MenuContainer
                id="menu-container"
                open={open}
                onClick={() => setOpen(false)}
            >
                <Menu id="menu" open={open}>
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
        </>
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
