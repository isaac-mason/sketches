import { Canvas as R3FCanvas } from '@react-three/fiber'

export const Canvas = ({ children, ...rest }: Parameters<typeof R3FCanvas>[0]) => (
    <R3FCanvas id="gl" {...rest}>
        {children}
    </R3FCanvas>
)
