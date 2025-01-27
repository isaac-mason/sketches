import { Canvas, CanvasProps } from '@react-three/fiber'
import * as React from 'react'
import styled from 'styled-components'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer } from 'three/webgpu'

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

export type WebGPUCanvasProps = {
    /**
     * @default false
     */
    forceWebGL?: boolean
    /**
     * @default false
     */
    forceWebGPU?: boolean

    gl?: ConstructorParameters<typeof WebGPURenderer>[0]
} & Omit<CanvasProps, 'gl'>

export const WebGPUCanvas = ({
    children,
    forceWebGL = false,
    forceWebGPU = false,
    frameloop = 'always',
    gl,
    ...props
}: React.PropsWithChildren<WebGPUCanvasProps>) => {
    const [canvasFrameloop, setCanvasFrameloop] = React.useState<CanvasProps['frameloop']>('never')
    const [initialising, setInitialising] = React.useState(true)

    React.useEffect(() => {
        if (initialising) return

        setCanvasFrameloop(frameloop)
    }, [initialising, frameloop])

    if (forceWebGPU && !WebGPU.isAvailable()) {
        return (
            <UnsupportedNoticeWrapper>
                <UnsupportedNotice>Your browser doesn't support WebGPU, this content cannot be displayed.</UnsupportedNotice>
            </UnsupportedNoticeWrapper>
        )
    }

    return (
        <Canvas
            {...props}
            id="gl"
            frameloop={canvasFrameloop}
            gl={(canvas) => {
                const renderer = new WebGPURenderer({ ...gl, canvas: canvas as HTMLCanvasElement, forceWebGL })
                renderer.init().then(() => {
                    setInitialising(false)
                })
                return renderer
            }}
        >
            {children}
        </Canvas>
    )
}
