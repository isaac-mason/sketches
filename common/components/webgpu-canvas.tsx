import { Canvas, CanvasProps } from '@react-three/fiber'
import * as React from 'react'
import WebGPU from 'three/addons/capabilities/WebGPU.js'
import { WebGPURenderer } from 'three/webgpu'

const UNSUPPORTED_WRAPPER_STYLES: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 1000,
    width: '100%',
    height: '100%',
    color: '#fff',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
}
const UNSUPPORTED_NOTICE_STYLES: React.CSSProperties = {
    fontSize: '1.5rem',
    textAlign: 'center',
    boxSizing: 'border-box',
    padding: '3em',
}

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
    gl,
    ...props
}: React.PropsWithChildren<WebGPUCanvasProps>) => {
    if (forceWebGPU && !WebGPU.isAvailable()) {
        return (
            <div style={UNSUPPORTED_WRAPPER_STYLES}>
                <div style={UNSUPPORTED_NOTICE_STYLES}>
                    Your browser doesn't support WebGPU, this content cannot be displayed.
                </div>
            </div>
        )
    }

    return (
        <Canvas
            {...props}
            id="gl"
            gl={async ({ canvas }) => {
                const renderer = new WebGPURenderer({ ...gl, canvas: canvas as HTMLCanvasElement, forceWebGL })
                renderer.init()
                return renderer
            }}
        >
            {children}
        </Canvas>
    )
}
