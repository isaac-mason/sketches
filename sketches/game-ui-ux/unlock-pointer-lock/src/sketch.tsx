import { animated, useSpring } from '@react-spring/three'
import { PerspectiveCamera, PointerLockControls, Text } from '@react-three/drei'
import { Canvas, ThreeElements } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { PointerLockControls as PointerLockControlsImpl } from 'three-stdlib'
import { Crosshair, Instructions } from '@/common'

const Controls = () => {
    const controls = useRef<PointerLockControlsImpl | null>(null!)

    const [enabled, setEnabled] = useState(true)

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'c') {
                controls.current?.unlock()
                setEnabled(false)
            }
        }

        const onKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'c') {
                controls.current?.lock()
                setEnabled(true)
            }
        }

        window.addEventListener('keydown', onKeyDown)
        window.addEventListener('keyup', onKeyUp)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
            window.removeEventListener('keyup', onKeyUp)
        }
    }, [])

    return <PointerLockControls ref={controls as never} enabled={enabled} />
}

const Box = (props: ThreeElements['mesh']) => {
    const [hovering, setHovering] = useState(false)

    const { scale } = useSpring({ scale: hovering ? 1.1 : 1 })
    const { color } = useSpring({ color: hovering ? 'orange' : '#fff' })

    return (
        <animated.mesh
            {...props}
            scale={scale}
            onPointerOver={(e) => {
                e.stopPropagation()
                setHovering(true)
            }}
            onPointerOut={() => setHovering(false)}
        >
            <boxGeometry args={[1, 1, 1]} />
            <animated.meshStandardMaterial color={color} />
        </animated.mesh>
    )
}

const Button = (props: ThreeElements['group']) => {
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
            {...props}
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
                <meshStandardMaterial color={clicked ? 'orange' : '#fff'} />
            </mesh>
        </animated.group>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <Box position={[-1.5, -2, -5]} />
                <Box position={[0, -2, -5]} />
                <Box position={[1.5, -2, -5]} />

                <Button position={[0, 0, -5]} />

                <pointLight intensity={10} position={[3, 3, 0]} />
                <ambientLight intensity={3} />

                <Controls />
                <PerspectiveCamera makeDefault position={[0, 0, 5]} />
            </Canvas>

            <Instructions>* hold 'c' to unlock the pointer</Instructions>

            <Crosshair />
        </>
    )
}
