import { Canvas as R3FCanvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Spinner } from './spinner'
import { DebugKeyboardControls, ThreeDebug } from '../../debug'

export const Canvas = ({ children, ...rest }: Parameters<typeof R3FCanvas>[0]) => (
    <Suspense fallback={<Spinner />}>
        <R3FCanvas id="gl" {...rest}>
            {children}

            <ThreeDebug />
        </R3FCanvas>

        <DebugKeyboardControls />
    </Suspense>
)
