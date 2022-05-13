import { Suspense } from 'react'
import {
    HashRouter as Router,
    Link,
    Route,
    Routes,
    useMatch,
} from 'react-router-dom'
import styled from 'styled-components'

import { isSketchRoute, sketches, sketchList } from './sketches'
import {
    GlobalStyle,
    PageStyle,
    TooltipContent,
    TooltipContainer,
    TooltipTrigger,
} from './styles'

const Page = styled(PageStyle)`
    padding: 0px;

    & > h1 {
        position: absolute;
        top: 70px;
        left: 60px;
    }

    & > a {
        position: absolute;
        bottom: 60px;
        right: 60px;
        font-size: 1.2em;
    }
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
    return <Component />
}

function Intro() {
    return (
        <Page>
            <Suspense fallback={null}>
                <Routes>
                    <Route path="/*" element={<DefaultComponent />} />
                    <Route path="/sketch/:name" element={<RoutedComponent />} />
                </Routes>
            </Suspense>
            <Sketches />
            <a
                href="https://github.com/isaac-mason/sketches"
            >
                Github
            </a>
        </Page>
    )
}

function Sketches() {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultName } }
    return (
        <SketchPanel>
            {sketchList.map((sketch, key) => (
                <Link key={sketch.route} to={`/sketch/${sketch.route}`} title={sketch.title}>
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

export default function App() {
    return (
        <Router>
            <GlobalStyle />
            <Intro />
        </Router>
    )
}

const SketchPanel = styled.div`
    position: absolute;
    bottom: 50px;
    left: 50px;
    max-width: 250px;
`

const Spot = styled.div`
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    margin: 8px;
`
