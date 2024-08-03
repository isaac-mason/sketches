import { Crosshair } from '@/common'
import {
    KeyboardControls,
    PointerLockControls,
    TransformControls,
    useKeyboardControls
} from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { ReactNode } from 'react'
import * as THREE from 'three'

const controls = [
    { name: 'left', keys: ['KeyA'] },
    { name: 'right', keys: ['KeyD'] },
    { name: 'forward', keys: ['KeyW'] },
    { name: 'backward', keys: ['KeyS'] },
    { name: 'acsend', keys: ['Space'] },
    { name: 'descend', keys: ['ShiftLeft'] },
]

const Controls = ({ children }: { children: ReactNode }) => {
    return <KeyboardControls map={controls}>{children}</KeyboardControls>
}

const Rig = () => {
    const [, getControls] = useKeyboardControls()

    useFrame(({ camera }, delta) => {
        const controls = getControls()

        if (!controls) return

        const t = 1 - Math.pow(0.001, delta)

        const velocity = new THREE.Vector3()

        velocity.set(
            Number(controls.right) - Number(controls.left),
            Number(controls.acsend) - Number(controls.descend),
            Number(controls.backward) - Number(controls.forward),
        )

        velocity.normalize()

        const facing = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1)
        const yaw = Math.atan2(facing.x, facing.z)
        velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)

        const speed = 0.5
        velocity.multiplyScalar(speed)
        velocity.multiplyScalar(t)

        camera.position.add(velocity)
    })

    return <PointerLockControls />
}

export function Sketch() {
    const { snap, mode, translationSnap, rotationSnap, scaleSnap } = useControls({
        snap: true,
        mode: {
            options: ['translate', 'rotate', 'scale'],
            value: 'translate',
        },
        translationSnap: { value: 1, min: 0, max: 10 },
        rotationSnap: { value: Math.PI / 8 },
        scaleSnap: { value: 0.5, min: 0, max: 10 },
    })

    return (
        <>
            <Canvas>
                <Controls>
                    <Rig />

                    <TransformControls
                        mode={mode as never}
                        translationSnap={snap ? translationSnap : undefined}
                        rotationSnap={snap ? rotationSnap : undefined}
                        scaleSnap={snap ? scaleSnap : undefined}
                    >
                        <mesh>
                            <boxGeometry />
                            <meshStandardMaterial color="orange" />
                        </mesh>
                    </TransformControls>

                    <gridHelper args={[10, 10]} position={[0.5, -0.5, 0.5]} />
                </Controls>

                <ambientLight intensity={0.5} />
                <pointLight position={[5, 5, 5]} intensity={100} />
            </Canvas>

            <Crosshair />
        </>
    )
}
