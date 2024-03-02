import { PointerLockControls, Text } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useRef, useState } from 'react'
import { Crosshair } from '../../../common'

const Button = () => {
    const [clicked, setClicked] = useState(false)

    const timeout = useRef<NodeJS.Timeout>(null!)

    const onPointerDown = () => {
        setClicked(true)

        clearTimeout(timeout.current)

        timeout.current = setTimeout(() => {
            setClicked(false)
        }, 1000)
    }

    return (
        <group onPointerDown={onPointerDown}>
            <Text position-z={0.01}>{clicked ? 'Clicked!' : 'Click me'}</Text>
            <mesh position-y={0.1}>
                <planeGeometry args={[5, 2]} />
                <meshBasicMaterial color={clicked ? 'red' : 'blue'} />
            </mesh>
        </group>
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
