import { Leva } from 'leva'
import { Suspense } from 'react'
import {
    HashRouter as Router,
    Link,
    Route,
    Routes,
    useMatch,
} from 'react-router-dom'
import { Loader } from './Loader'
import { isSketchRoute, sketches, sketchList } from './sketches'
import {
    Dot,
    GlobalStyle,
    Page,
    SketchPanel,
    TooltipContainer,
    TooltipContent,
    TooltipTrigger,
} from './styles'

const defaultSketch = 'Home'
const DefaultComponent = sketches[defaultSketch].Component

const RoutedComponent = () => {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }
    const sketchName = isSketchRoute(routeName) ? routeName : defaultSketch
    const { Component } = sketches[sketchName]
    return <Component />
}

function App() {
    return (
        <Page>
            <Leva collapsed />
            <Suspense fallback={<Loader />}>
                <Routes>
                    <Route path="/*" element={<DefaultComponent />} />
                    <Route path="/sketch/:name" element={<RoutedComponent />} />
                </Routes>
            </Suspense>
            <Sketches />
            <a href="https://github.com/isaac-mason/sketches">Github</a>
        </Page>
    )
}

function Sketches() {
    const {
        params: { name: routeName },
    } = useMatch('/sketch/:name') || { params: { name: defaultSketch } }

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
                            <Dot
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
            <App />
            <GlobalStyle />
        </Router>
    )
}
