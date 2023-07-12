import { Html, OrbitControls } from '@react-three/drei'
import { ReactNode } from 'react'
import { Canvas } from '../../../common'

import { Link, Network, Node } from './network'

const Emoji = ({ children }: { children: ReactNode }) => {
    return (
        <Html
            transform
            center
            style={{
                background: '#333',
                border: '1px solid #fff',
                padding: '0.5em',
            }}
        >
            {children}
        </Html>
    )
}

const App = () => {
    return (
        <>
            <Network>
                <Node id="1" fixedPosition={[0, 0]}>
                    <Emoji>👋</Emoji>
                </Node>

                <Node id="3">
                    <Emoji>💣</Emoji>
                </Node>

                <Node id="4">
                    <Emoji>🍎</Emoji>
                </Node>

                <Node id="5">
                    <Emoji>🍔</Emoji>
                </Node>

                <Link source="1" target="3" />
                <Link source="1" target="4" />
                <Link source="1" target="5" />
                <Link source="2" target="3" />
                <Link source="4" target="5" />
            </Network>
        </>
    )
}

export default () => (
    <>
        <Canvas camera={{ position: [0, 0, 10] }}>
            <App />
            <OrbitControls />
        </Canvas>
    </>
)
