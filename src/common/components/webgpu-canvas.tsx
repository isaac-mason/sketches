import { Canvas, CanvasProps } from '@react-three/fiber'
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

export type WebGPUCanvasProps = React.PropsWithChildren<
    {
        /**
         * @default true
         */
        webglFallback?: boolean
    } & CanvasProps
>

export const WebGPUCanvas = ({
    children,
    webglFallback = true,
    frameloop = 'always',
    ...props
}: React.PropsWithChildren<WebGPUCanvasProps>) => {
    const [canvasFrameloop, setCanvasFrameloop] = React.useState<CanvasProps['frameloop']>('never')
    const [initialising, setInitialising] = React.useState(true)

    React.useEffect(() => {
        if (initialising) return

        setCanvasFrameloop(frameloop)
    }, [initialising, frameloop])

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
            frameloop={canvasFrameloop}
            gl={(canvas) => {
                const renderer = new WebGPURenderer({ canvas: canvas as HTMLCanvasElement })
                renderer.init().then(() => {
                    setInitialising(false)
                })
                return renderer
            }}
            {...props}
        >
            {children}
        </Canvas>
    )
}
