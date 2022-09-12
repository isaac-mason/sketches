import { Leva } from 'leva'
import { Suspense } from 'react'
import {
    HashRouter as Router,
    Link,
    Route,
    Routes,
    useMatch,
} from 'react-router-dom'
import { up } from 'styled-breakpoints'
import styled, { keyframes } from 'styled-components'
import { GlobalStyle } from './global-styles'
import { isSketchRoute, sketches, sketchList } from './sketches'

const LoaderKeyframes = keyframes`
from {
    transform: rotate(0deg);
}
to {
    transform: rotate(360deg);
}
`

const Loader = styled.div`
    position: fixed;
    left: calc(50% - 25px);
    top: calc(50vh - 50px);
    width: 50px;
    height: 50px;
    border: 3px solid rgba(0, 0, 0, 0);
    border-top: 3px solid #fff;
    border-radius: 50%;
    animation: ${LoaderKeyframes} 1s ease infinite;   
`

const Page = styled.div`
    padding: 0px;

    position: relative;
    width: 100%;
    height: 100vh;

    & > h1 {
        position: absolute;
        top: 20px;
        left: 20px;

        font-weight: 900;
        font-size: 2em;
        margin: 0;
        padding-right: 0.2em;
        color: #eee;
        line-height: 1.2;
        letter-spacing: -2px;

        ${up('md')} {
            top: 70px;
            left: 60px;

            font-size: 4em;
        }

        ${up('lg')} {
            font-size: 5em;
        }
    }

    & > a {
        position: absolute;
        bottom: 20px;
        right: 20px;
        font-size: 1.2em;

        ${up('md')} {
            bottom: 60px;
            right: 60px;
        }
    }

    & > a {
        margin: 0;
        color: #eee;
        text-decoration: none;
    }
`

const TooltipTrigger = styled.div`
    cursor: pointer;
`

const TooltipContent = styled.div`
    position: absolute;
    top: calc(100% - 60px);
    left: 30px;

    z-index: 999;
    border-radius: 0.2em;
    transition: visibility 0.2s, color 0.2s, background-color 0.2s, width 0.2s,
        padding 0.2s ease-in-out;
    visibility: hidden;
    color: transparent;
    background-color: transparent;
    white-space: nowrap;
`

const TooltipContainer = styled.div`
    display: inline-block;
    position: relative;
    & ${TooltipTrigger}:hover + ${TooltipContent} {
        visibility: visible;
        color: #eee;
        background-color: #111;
        padding: 10px;
    }
`

const SketchPanel = styled.div`
    position: absolute;
    max-width: 250px;
    bottom: 10px;
    left: 10px;

    ${up('md')} {
        bottom: 50px;
        left: 50px;
    }
`

const Spot = styled.div`
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    margin: 8px;
`

const defaultName = 'Home'
const visibleComponents = sketches
const DefaultComponent = visibleComponents[defaultName].Component

const RoutedComponent = () => {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultName } }
    const sketchName = isSketchRoute(routeName) ? routeName : defaultName
    const { Component } = visibleComponents[sketchName]
    return (
        <>
            <Suspense fallback={<Loader />}>
                <Component />
            </Suspense>
        </>
    )
}

function App() {
    return (
        <Page>
            <Leva collapsed />
            <Routes>
                <Route path="/*" element={<DefaultComponent />} />
                <Route path="/sketch/:name" element={<RoutedComponent />} />
            </Routes>
            <Sketches />
            <a href="https://github.com/isaac-mason/sketches">Github</a>
        </Page>
    )
}

function Sketches() {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultName } }

    return (
        <SketchPanel>
            {sketchList.map((sketch) => (
                <Link
                    key={sketch.route}
                    to={`/sketch/${sketch.route}`}
                    title={sketch.title}
                >
                    <TooltipContainer>
                        <TooltipTrigger>
                            <Spot
                                style={{
                                    backgroundColor:
                                        sketch.route === routeName
                                            ? 'salmon'
                                            : '#eee',
                                }}
                            />
                        </TooltipTrigger>
                        <TooltipContent>{sketch.title}</TooltipContent>
                    </TooltipContainer>
                </Link>
            ))}
        </SketchPanel>
    )
}

export default function () {
    return (
        <Router>
            <GlobalStyle />
            <App />
        </Router>
    )
}
