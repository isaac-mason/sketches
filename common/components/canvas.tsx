import { Canvas as R3FCanvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { DebugKeyboardControls, ThreeDebug } from '../debug'
import { Controls } from './controls'
import { Spinner } from './spinner'

export const Canvas = ({ children, ...rest }: Parameters<typeof R3FCanvas>[0]) => (
    <Suspense fallback={<Spinner />}>
        <R3FCanvas id="gl" {...rest}>
            {children}

            <ThreeDebug />
        </R3FCanvas>

        <DebugKeyboardControls />

        <Controls />
    </Suspense>
)
