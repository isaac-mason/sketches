import { Canvas as R3FCanvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { DebugTunnel } from '../utils/debug-tunnel'
import { Spinner } from './spinner'

export const Canvas = ({ children, ...rest }: Parameters<typeof R3FCanvas>[0]) => (
    <Suspense fallback={<Spinner />}>
        <R3FCanvas id="gl" {...rest}>
            {children}
            <DebugTunnel.Out />
        </R3FCanvas>
    </Suspense>
)
