import { Canvas } from '@/common'
import { Html, OrbitControls } from '@react-three/drei'
import React, { ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { Link, Network, Node } from './network'

const Emoji = ({ children }: { children: ReactNode }) => (
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

const ForceDirectedGraph = () => (
    <>
        <Network>
            <Node id="1">
                <Emoji>👋</Emoji>
            </Node>

            <Node id="2">
                <Emoji>💣</Emoji>
            </Node>

            <Node id="3">
                <Emoji>🍎</Emoji>
            </Node>

            <Node id="4">
                <Emoji>🍔</Emoji>
            </Node>

            <Link source="1" target="2" />
            <Link source="1" target="3" />
            <Link source="1" target="4" />
            <Link source="3" target="4" />
        </Network>
    </>
)

function Sketch() {
    return (
        <>
            <Canvas camera={{ position: [0, 0, 10] }}>
                <ForceDirectedGraph />
                <OrbitControls />
            </Canvas>
        </>
    )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Sketch />
    </React.StrictMode>,
)
