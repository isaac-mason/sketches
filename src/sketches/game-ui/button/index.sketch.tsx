import { animated, useSpring } from '@react-spring/three'
import { PointerLockControls, Text } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Crosshair } from '@/common'

const Button = () => {
    const [clicked, setClicked] = useState(false)
    const [hovering, setHovering] = useState(false)

    const { scale } = useSpring({ scale: hovering ? 1.1 : 1 })

    const timeout = useRef<NodeJS.Timeout>(null!)

    const onPointerDown = () => {
        setClicked(true)

        clearTimeout(timeout.current)

        timeout.current = setTimeout(() => {
            setClicked(false)
        }, 1000)
    }

    return (
        <animated.group
            scale={scale}
            onPointerDown={onPointerDown}
            onPointerOver={(e) => (e.stopPropagation(), setHovering(true))}
            onPointerOut={() => setHovering(false)}
        >
            <Text position-z={0.01} color="#333">
                {clicked ? 'Clicked!' : 'Click me'}
            </Text>
            <mesh position-y={0.1}>
                <planeGeometry args={[5, 2]} />
                <meshBasicMaterial color={clicked ? 'orange' : '#fff'} />
            </mesh>
        </animated.group>
    )
}

export default function Sketch() {
    return (
        <>
            <Canvas>
                <Button />

                <PointerLockControls />
            </Canvas>

            <Crosshair />
        </>
    )
}
