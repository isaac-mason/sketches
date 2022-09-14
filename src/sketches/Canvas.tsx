import { Canvas as R3FCanvas } from '@react-three/fiber'
import { Suspense } from 'react'
import { Loader } from '../Loader'

export const Canvas = ({ children, ...rest }: Parameters<typeof R3FCanvas>[0]) => (
    <Suspense fallback={<Loader />}>
        <R3FCanvas id="gl" {...rest}>
            {children}
        </R3FCanvas>
    </Suspense>
)
