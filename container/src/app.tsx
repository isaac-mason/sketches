import { Spinner, useDebounce } from '../../common'
import { Component, ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, RouteObject, RouterProvider, createBrowserRouter, redirect, useLoaderData } from 'react-router-dom'
import styled from 'styled-components'
import { create } from 'zustand'
import sketchesMetadata from '../generated/sketches.json'
import { ScreenshotKeyboardControls, useScreenshot } from './screenshot'
import { GitHubIcon } from './svgs/GitHubIcon'
import { WindowMaximizeIcon } from './svgs/WindowMaximizeIcon'
import { Theme } from './theme'
import type { SketchMeta } from '../../dev/utils'

const sketches = (sketchesMetadata satisfies SketchMeta[]).filter((s: SketchMeta) => !s.hidden)

const Error = styled.div`
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
`

const Links = styled.div`
    position: absolute;
    z-index: 2;

    display: flex;
    align-items: center;
    gap: 1em;

    font-size: 1.2em;
    margin: 0;
    text-decoration: none;

    color: #eee;
    text-shadow: 2px 2px #333;
    font-family: 'Poppins', sans-serif;

    bottom: 20px;
    right: 20px;

    ${({ theme }) => theme.breakpoints.up('md')} {
        bottom: 30px;
        right: 30px;
    }

    a {
        display: block;
        width: 40px;
        height: 40px;
        padding: 0.5em;
        border-radius: 0.2em;

        stroke: #fff;
        fill: #fff;
        background-color: #cccccc33;
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

const SketchNotices = styled.div`
    display: flex;
    flex-direction: row;
    gap: 0.5em;
    position: absolute;
    top: 0;
    right: 0;
    z-index: 2;
    padding: 1em;
`

const SketchNotice = styled.div`
    padding: 0.5em;
    background: #333;
    border: 1px solid #999;
    border-radius: 50%;
    width: 2em;
    height: 2em;
    font-size: 1em;
    display: flex;
    align-items: center;
    justify-content: center;
    fill: #fff;
`

const NavItemImage = styled.img`
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 0.2em 0.2em 0 0;
    user-select: none;
`

const NavItemTitle = styled.div`
    font-size: 1em;
    color: #fff;
    padding: 0.5em;
`

const NavItemWrapper = styled(Link)`
    position: relative;

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

    &:not(.fullscreen) {
        ${({ theme }) => theme.breakpoints.up('md')} {
            width: calc(100% - 350px);
        }
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

type SketchLoaderData = {
    sketchPath: string
    sketchUrl: string
    sketchMetadata: SketchMeta
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

const useIsFullscreen = () => {
    const [fullscreen] = useState(() => document.location.search.includes('fullscreen'))

    return fullscreen
}

const LazySketch = () => {
    const { sketchMetadata, sketchPath, sketchUrl } = useLoaderData() as SketchLoaderData

    const wrapperRef = useRef<HTMLDivElement>(null!)
    const [iframe, setIframe] = useState<HTMLIFrameElement | null>()
    const [loading, setLoading] = useState(true)

    const { screenshotMode } = useScreenshot()
    const isFullscreen = useIsFullscreen()

    useEffect(() => {
        if (!sketchMetadata) return

        document.title = sketchMetadata.path === 'intro' ? 'Sketches | Isaac Mason' : `${sketchMetadata.title} | Sketches`
    }, [sketchMetadata])

    useEffect(() => {
        if (!iframe) return

        setLoading(true)

        const onResize = () => {
            iframe.style.width = `${wrapperRef.current.clientWidth}px`
            iframe.style.height = `${wrapperRef.current.clientHeight}px`
        }

        const resizeObserver = new ResizeObserver(onResize)

        resizeObserver.observe(wrapperRef.current)

        return () => {
            resizeObserver.disconnect()
        }
    }, [iframe])

    return (
        <SketchWrapper ref={wrapperRef} className={isFullscreen ? 'fullscreen' : ''}>
            {(!screenshotMode && sketchMetadata.options?.displayTitle) ?? <h1>{sketchMetadata?.title}</h1>}

            {loading && <Spinner />}

            <iframe
                key={sketchPath}
                ref={setIframe}
                src={sketchUrl}
                loading="eager"
                allow="cross-origin-isolated"
                onLoad={() => setLoading(false)}
            />
        </SketchWrapper>
    )
}

type NavItemProps = {
    sketch: SketchMeta
    currentSketchPath: string
    closeNav: () => void
}

const NavItem = ({ sketch, currentSketchPath, closeNav }: NavItemProps) => {
    const showAudioNotice = sketch.options?.showAudioNotice ?? false
    const showDesktopOnlyNotice = sketch.options?.showDesktopOnlyNotice ?? false
    const anyNotices = showAudioNotice || showDesktopOnlyNotice

    return (
        <NavItemWrapper
            to={`/sketch/${sketch.path}`}
            onClick={() => closeNav()}
            title={sketch.title}
            className={sketch.path === currentSketchPath ? 'active' : ''}
        >
            {sketch.cover ? <NavItemImage src={sketch.cover} alt={sketch.title} loading="lazy" /> : undefined}

            {anyNotices && (
                <SketchNotices>
                    {showAudioNotice && (
                        <SketchNotice title="This sketch has audio">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256">
                                <path d="M155.51,24.81a8,8,0,0,0-8.42.88L77.25,80H32A16,16,0,0,0,16,96v64a16,16,0,0,0,16,16H77.25l69.84,54.31A8,8,0,0,0,160,224V32A8,8,0,0,0,155.51,24.81ZM32,96H72v64H32ZM144,207.64,88,164.09V91.91l56-43.55Zm54-106.08a40,40,0,0,1,0,52.88,8,8,0,0,1-12-10.58,24,24,0,0,0,0-31.72,8,8,0,0,1,12-10.58ZM248,128a79.9,79.9,0,0,1-20.37,53.34,8,8,0,0,1-11.92-10.67,64,64,0,0,0,0-85.33,8,8,0,1,1,11.92-10.67A79.83,79.83,0,0,1,248,128Z"></path>
                            </svg>
                        </SketchNotice>
                    )}

                    {showDesktopOnlyNotice && (
                        <SketchNotice title="This sketch is desktop only">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 256 256"><path d="M213.92,210.62l-160-176A8,8,0,1,0,42.08,45.38L56,60.69V216a24,24,0,0,0,24,24h96a24,24,0,0,0,23.82-21.11l2.26,2.49a8,8,0,1,0,11.84-10.76ZM184,216a8,8,0,0,1-8,8H80a8,8,0,0,1-8-8V78.29l112,123.2ZM68.7,24a8,8,0,0,1,8-8H176a24,24,0,0,1,24,24V150.83a8,8,0,1,1-16,0V40a8,8,0,0,0-8-8H76.7A8,8,0,0,1,68.7,24Z"></path></svg>
                        </SketchNotice>
                    )}
                </SketchNotices>
            )}

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

type NavState = {
    open: boolean
    toggleNav: () => void
    closeNav: () => void
}

const useNav = create<NavState>((set, get) => ({
    open: false,
    toggleNav: () => set({ open: !get().open }),
    closeNav: () => set({ open: false }),
}))

const SideNav = () => {
    const { sketchPath } = useLoaderData() as SketchLoaderData
    const { open: navOpen, closeNav } = useNav()

    const [searchTerm, setSearchTerm] = useState('')
    const debouncedSearchTerm = useDebounce(searchTerm)

    const filteredSketches = useMemo(() => {
        if (searchTerm.trim() === '') return sketches

        return sketches.filter((s) => {
            const match = `${s?.title.toLowerCase() ?? ''} ${s?.tags?.join(' ').toLowerCase() ?? ''}`

            return match.includes(searchTerm.toLowerCase())
        })
    }, [debouncedSearchTerm])

    return (
        <>
            <Nav open={navOpen}>
                <NavTop>
                    <NavSearchBar
                        placeholder="Search for a sketch..."
                        onInput={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
                    />
                </NavTop>

                <NavItems>
                    {filteredSketches.map((s) => (
                        <NavItem key={s.path} sketch={s} currentSketchPath={sketchPath} closeNav={closeNav} />
                    ))}
                </NavItems>
            </Nav>
        </>
    )
}

const App = () => {
    const { sketchPath, sketchUrl } = useLoaderData() as SketchLoaderData

    const { open: navOpen, toggleNav, closeNav } = useNav()
    const { screenshotMode } = useScreenshot()

    const isFullscreen = useIsFullscreen()

    return (
        <>
            <PageLayout>
                {!isFullscreen && <SideNav />}

                <ErrorBoundary>
                    <LazySketch />
                </ErrorBoundary>
            </PageLayout>

            <NavBackground open={navOpen} onClick={() => closeNav()} />

            {!screenshotMode && !isFullscreen ? (
                <NavToggle className="material-symbols-outlined" onClick={toggleNav}>
                    menu
                </NavToggle>
            ) : undefined}

            <ScreenshotKeyboardControls />

            {!screenshotMode && !isFullscreen ? (
                <Links>
                    <a target="_blank" href={`https://github.com/isaac-mason/sketches/tree/main/sketches/${sketchPath}`}>
                        <GitHubIcon />
                    </a>

                    <a target="_blank" href={sketchUrl}>
                        <WindowMaximizeIcon />
                    </a>
                </Links>
            ) : undefined}
        </>
    )
}

const routes: RouteObject[] = [
    ...sketchesMetadata.map((sketch) => {
        const route: RouteObject = {
            path: `/sketch/${sketch.path}`,
            Component: App,
            loader: async ({ request }) => {
                errorBoundaryState.setState({ error: false })

                const sketchPath = new URL(request.url).pathname.replace('/sketch/', '')

                const sketchMetadata = sketchesMetadata.find((s) => s.path === sketchPath)! as SketchMeta

                const sketchUrl = `/sketches-static/${sketchMetadata.path}/index.html`

                return {
                    sketchPath,
                    sketchMetadata,
                    sketchUrl,
                }
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

const router = createBrowserRouter(routes, {})

export default () => {
    return (
        <Theme>
            <RouterProvider router={router} />
        </Theme>
    )
}
