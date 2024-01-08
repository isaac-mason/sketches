import { Canvas } from '@react-three/fiber'
import * as React from 'react'
import styled from 'styled-components'
import WebGPUCapabilities from 'three/examples/jsm/capabilities/WebGPU.js'
import WebGPURenderer from 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js'

const UnsupportedNoticeWrapper = styled.div`
    position: absolute;
    top: 0;
    left: 0;
    z-index: 1000;
    width: 100%;
    height: 100%;
    color: #fff;
    display: flex;
    justify-content: center;
    align-items: center;
`

const UnsupportedNotice = styled.div`
    font-size: 1.5rem;
    text-align: center;
    box-sizing: border-box;
    padding: 3em;
`

export type WebGPUCanvasProps = React.PropsWithChildren<{
    /**
     * @default true
     */
    webglFallback?: boolean
}>
export const WebGPUCanvas = ({ children, webglFallback = true, ...props }: React.PropsWithChildren<any>) => {
    if (!webglFallback && !WebGPUCapabilities.isAvailable()) {
        return (
            <UnsupportedNoticeWrapper>
                <UnsupportedNotice>
                    Darn, your browser doesn't support WebGPU! Just pretend there's something very cool on your screen.
                </UnsupportedNotice>
            </UnsupportedNoticeWrapper>
        )
    }

    return (
        <Canvas
            id="gl"
            gl={(canvas: HTMLCanvasElement) => {
                return new WebGPURenderer({ canvas })
            }}
            {...props}
        >
            {children}
        </Canvas>
    )
}
