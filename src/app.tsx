import { Leva } from 'leva'
import { Perf } from 'r3f-perf'
import { Component, ReactNode, Suspense, memo, useEffect, useMemo, useState } from 'react'
import {
    Await,
    Link,
    RouteObject,
    RouterProvider,
    createBrowserRouter,
    defer,
    redirect,
    useAsyncValue,
    useLoaderData,
} from 'react-router-dom'
import { createStyledBreakpointsTheme } from 'styled-breakpoints'
import styled, { ThemeProvider } from 'styled-components'
import { create } from 'zustand'
import { DebugTunnel, Spinner } from './common'
import { useDebounce } from './common/hooks/use-debounce'
import { findSketchByRoute, renamedSketches, sketchModules, sketches, visibleSketches } from './sketches'
import { Sketch, SketchOptions } from './sketches/types'

const theme = createStyledBreakpointsTheme()

const Error = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
`

const GithubLink = styled.a`
    position: absolute;
    z-index: 2;

    font-size: 1.2em;
    margin: 0;
    text-decoration: none;

    color: #eee;
    text-shadow: 2px 2px #333;
    font-family: 'Poppins', sans-serif;

    bottom: 20px;
    right: 20px;

    ${({ theme }) => theme.breakpoints.up('md')} {
        bottom: 60px;
        right: 60px;
    }
`

const UnstyledButton = styled.button`
    border: none;
    margin: 0;
    padding: 0;
    width: auto;
    overflow: visible;

    background: transparent;

    /* inherit color from ancestor */
    color: inherit;

    /* Normalize 'line-height'. Cannot be changed from 'normal' in Firefox 4+. */
    line-height: normal;

    /* Corrects font smoothing for webkit */
    -webkit-font-smoothing: inherit;
    -moz-osx-font-smoothing: inherit;

    /* Corrects inability to style clickable 'input' types in iOS */
    -webkit-appearance: none;

    &::-moz-focus-inner {
        border: 0;
        padding: 0;
    }
`

const NavToggle = styled(UnstyledButton)`
    position: absolute;
    z-index: 2;
    bottom: 10px;
    left: 10px;

    color: #fff;
    font-size: 2em;
    cursor: pointer;
    border-radius: 50%;
    width: 1.6em;
    height: 1.6em;
    transition: background 0.2s ease;
    background-color: #000;

    &:hover {
        background-color: #444;
    }

    ${({ theme }) => theme.breakpoints.up('md')} {
        display: none;
    }
`

const Nav = styled.div<{ open: boolean }>`
    position: absolute;
    transition: transform 0.5s ease;
    transform: translateX(${(props) => (props.open ? '0' : '-100%')});

    ${({ theme }) => theme.breakpoints.up('md')} {
        position: relative;
        transform: unset;
    }

    top: 0;
    left: 0;

    z-index: 4;

    background-color: #111;

    overflow-y: scroll;
    overflow-x: hidden;

    width: 300px;
    min-width: 300px;
    height: 100%;

    ${({ theme }) => theme.breakpoints.up('md')} {
        width: 350px;
        min-width: 350px;
    }
`

const NavTop = styled.div`
    position: sticky;
    top: 0;
    z-index: 5;

    width: 100%;
    padding: 1em;

    background-color: #111;
    border-bottom: 1px solid #333;
`

const NavSearchBar = styled.input`
    width: 100%;

    padding: 0.5em;
    border-radius: 0.2em;
    border: none;

    color: #fff;
    background-color: #333;

    font-size: 1em;
    font-weight: 400;
    font-family: 'Poppins', sans-serif;
`

const NavItems = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    gap: 1.5em;
    padding: 1em;
`

const NavItemTags = styled.div`
    display: flex;
    flex-flow: row wrap;
    gap: 0.5em 1em;
    font-size: 0.8em;
    color: #fff;
    margin: 0.7em;
    margin-top: 0;
    font-style: italic;
`

const NavItemImage = styled.img`
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 0.2em 0.2em 0 0;
`

const NavItemTitle = styled.div`
    font-size: 1em;
    color: #fff;
    padding: 0.5em;
`

const NavItemWrapper = styled(Link)`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    width: 100%;
    border-radius: 0.2em;
    text-decoration: none;

    background-color: #333;
    border: 1px solid #444;
    transition:
        background 0.3s ease,
        border 0.3s ease,
        transform 0.5s ease;

    &.active,
    &:hover {
        background-color: #444;
        border: 1px solid #999;
    }

    &:hover {
        transform: scale(1.02);
    }

    ${NavItemTags} span {
        padding: 0.2em 0.3em;
        border-radius: 0.2em;

        background-color: #444;
        transition:
            background 0.3s ease,
            transform 0.5s ease;
    }

    &.active ${NavItemTags} span,
    &:hover ${NavItemTags} span {
        background-color: #555;
    }
`

const NavBackground = styled.div<{ open: boolean }>`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transition:
        background,
        0.25s ease;
    z-index: ${(props) => (props.open ? '3' : '-1')};
    background: ${(props) => (props.open ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)')};

    ${({ theme }) => theme.breakpoints.up('md')} {
        display: none;
    }
`

const PageLayout = styled.div`
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;

    width: 100%;
    height: 100%;

    position: relative;

    font-family: 'Poppins', sans-serif;
`

const SketchWrapper = styled.div`
    width: 100%;
    height: 100%;

    position: relative;

    ${({ theme }) => theme.breakpoints.up('md')} {
        width: calc(100% - 350px);
    }

    h1 {
        position: absolute;
        z-index: 1;
        top: 20px;
        left: 20px;

        margin: 0;
        padding-right: 20px;

        font-size: 2em;
        font-weight: 900;
        line-height: 1.2;
        letter-spacing: -2px;

        color: #eee;
        text-shadow: 2px 2px #333;

        pointer-events: none;

        ${({ theme }) => theme.breakpoints.up('md')} {
            top: 40px;
            left: 40px;
            padding-right: 40px;

            font-size: 2.5em;
        }

        ${({ theme }) => theme.breakpoints.up('lg')} {
            font-size: 3em;
        }
    }
`

const modes = ['default', 'debug', 'screenshot'] as const
type DisplayMode = (typeof modes)[number]

const useDisplayMode = (): DisplayMode => {
    const [displayMode, setDisplayMode] = useState<DisplayMode>('default')

    useEffect(() => {
        const handler = (e: WindowEventMap['keyup']): void => {
            if (e.key === '?') {
                const currentIndex = modes.findIndex((m) => m === displayMode)
                const nextModeIndex = (currentIndex + 1) % modes.length
                setDisplayMode(modes[nextModeIndex])
            }
        }

        window.addEventListener('keyup', handler)

        return () => {
            window.removeEventListener('keyup', handler)
        }
    }, [displayMode])

    return displayMode
}

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

type SketchData = {
    sketch: Sketch
    options?: SketchOptions
}

type SketchLoaderData = {
    sketchPath: string
    sketchData: SketchData
}

const errorBoundaryState = create<{ error: boolean }>(() => ({
    error: false,
}))

type ErrorBoundaryProps = {
    children: ReactNode
}

class ErrorBoundary extends Component<ErrorBoundaryProps> {
    static getDerivedStateFromError() {
        return {}
    }

    componentDidCatch(_error: Error, _errorInfo: never) {
        errorBoundaryState.setState({ error: true })
    }

    render() {
        if (errorBoundaryState.getState().error) {
            return <Error>Something went wrong rendering the sketch!</Error>
        }

        return this.props.children
    }
}

const SketchModule = memo(({ route }: { route: string }) => {
    const { component: SketchModuleComponent } = sketchModules[route]

    return <SketchModuleComponent key={route} />
})

type LazySketchProps = {
    displayMode: DisplayMode
}

const LazySketch = ({ displayMode }: LazySketchProps) => {
    const { sketch, options } = useAsyncValue() as SketchData

    useEffect(() => {
        if (!sketch) return

        document.title = sketch.route === 'intro' ? 'Sketches | Isaac Mason' : `${sketch.title} | Sketches`

        gtag('event', 'sketch_navigation', { route: sketch.route, title: sketch.title })
    }, [sketch])

    return (
        <SketchWrapper>
            {displayMode !== 'screenshot' && !options?.noTitle && <h1>{sketch?.title}</h1>}

            <SketchModule route={sketch.route} />
        </SketchWrapper>
    )
}

type NavItemProps = {
    sketch: Sketch
    currentSketchPath: string
    closeNav: () => void
}

const NavItem = ({ sketch, currentSketchPath, closeNav }: NavItemProps) => {
    return (
        <NavItemWrapper
            to={`/sketch/${sketch.route}`}
            onClick={() => closeNav()}
            title={sketch.title}
            className={sketch.route === currentSketchPath ? 'active' : ''}
        >
            {sketch.cover ? <NavItemImage src={sketch.cover} alt={sketch.title} loading="lazy" /> : undefined}

            <NavItemTitle>{sketch.title}</NavItemTitle>

            {sketch.tags && (
                <NavItemTags>
                    {sketch.tags.map((tag) => (
                        <span key={tag}>{tag}</span>
                    ))}
                </NavItemTags>
            )}
        </NavItemWrapper>
    )
}

const App = () => {
    const { sketchPath, sketchData } = useLoaderData() as SketchLoaderData

    const [navOpen, setNavOpen] = useState(false)

    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearchTerm = useDebounce(searchTerm)

    const displayMode = useDisplayMode()
    const isSmallScreen = useIsSmallScreen()

    const filteredSketches = useMemo(() => {
        if (searchTerm.trim() === '') return visibleSketches

        return visibleSketches.filter((s) => {
            const match = `${s?.title.toLowerCase() ?? ''} ${s?.tags?.join(' ').toLowerCase() ?? ''} ${
                s?.description?.toLowerCase() ?? ''
            }`

            return match.includes(searchTerm.toLowerCase())
        })
    }, [debouncedSearchTerm])

    return (
        <>
            <PageLayout>
                <Nav open={navOpen}>
                    <NavTop>
                        <NavSearchBar
                            placeholder="Search for a sketch..."
                            onInput={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                        />
                    </NavTop>

                    <NavItems>
                        {filteredSketches.map((s) => (
                            <NavItem key={s.route} sketch={s} currentSketchPath={sketchPath} closeNav={() => setNavOpen(false)} />
                        ))}
                    </NavItems>
                </Nav>

                <ErrorBoundary>
                    <Suspense fallback={<Spinner />}>
                        <Await resolve={sketchData}>
                            <LazySketch displayMode={displayMode} />
                        </Await>
                    </Suspense>
                </ErrorBoundary>
            </PageLayout>

            <NavBackground open={navOpen} onClick={() => setNavOpen(false)} />

            {displayMode !== 'screenshot' ? (
                <NavToggle className="material-symbols-outlined" onClick={() => setNavOpen((v) => !v)}>
                    menu
                </NavToggle>
            ) : undefined}

            {displayMode === 'default' ? (
                <GithubLink target="_blank" href={`https://github.com/isaac-mason/sketches/tree/main/src/sketches/${sketchPath}`}>
                    GitHub
                </GithubLink>
            ) : undefined}

            {displayMode === 'debug' ? (
                <DebugTunnel.In>
                    <Perf position="bottom-right" />
                </DebugTunnel.In>
            ) : undefined}

            <Leva
                collapsed
                hidden={displayMode === 'screenshot'}
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
        </>
    )
}

const routes: RouteObject[] = [
    ...renamedSketches.map((renamedSketch) => ({
        path: `/sketch/${renamedSketch.from}`,
        element: null,
        loader: async () => {
            return redirect(`/sketch/${renamedSketch.to}`)
        },
    })),
    ...sketches.map((sketch) => {
        const route: RouteObject = {
            path: `/sketch/${sketch.route}`,
            Component: App,
            loader: async ({ request }) => {
                errorBoundaryState.setState({ error: false })

                const sketchPath = new URL(request.url).pathname.replace('/sketch/', '')

                const getSketchData = async (): Promise<SketchData> => {
                    const sketch = findSketchByRoute(sketchPath)!
                    const options = await sketchModules[sketchPath].getOptions()

                    return { sketch, options }
                }

                return defer({
                    sketchPath,
                    sketchData: getSketchData(),
                })
            },
        }
        return route
    }),
    {
        path: '*',
        element: null,
        loader: async () => {
            return redirect('/sketch/intro')
        },
    },
]

const router = createBrowserRouter(routes)

export default () => {
    return (
        <ThemeProvider theme={theme}>
            <RouterProvider router={router} />
        </ThemeProvider>
    )
}
