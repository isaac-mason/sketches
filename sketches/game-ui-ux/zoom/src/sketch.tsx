import { Crosshair, Instructions } from '@/common'
import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { ReactNode, useEffect } from 'react'
import * as THREE from 'three'
import { create } from 'zustand'

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

const zoomValues = [
    {
        zoom: 1,
        pointerSpeed: 1,
    },
    {
        zoom: 2,
        pointerSpeed: 0.5,
    },
    {
        zoom: 4,
        pointerSpeed: 0.25,
    },
    {
        zoom: 8,
        pointerSpeed: 0.125,
    },
]

const useZoom = create<{
    zoomIndex: number
    setZoomIndex: (zoom: number) => void
}>((set) => ({
    zoomIndex: 0,
    setZoomIndex: (index) => set({ zoomIndex: index }),
}))

const Rig = () => {
    const [, getControls] = useKeyboardControls()

    const { zoomIndex, setZoomIndex } = useZoom()

    const { zoom, pointerSpeed } = zoomValues[zoomIndex]

    useEffect(() => {
        // keys [ and ] to zoom

        const onKeyDown = (e: KeyboardEvent) => {
            const currentZoomIndex = useZoom.getState().zoomIndex

            if (e.key === '[') {
                setZoomIndex(Math.max(currentZoomIndex - 1, 0))
            }

            if (e.key === ']') {
                setZoomIndex(Math.min(currentZoomIndex + 1, zoomValues.length - 1))
            }
        }

        window.addEventListener('keydown', onKeyDown)

        return () => {
            window.removeEventListener('keydown', onKeyDown)
        }
    }, [])

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

        const prevZoom = camera.zoom
        camera.zoom = THREE.MathUtils.lerp(camera.zoom, zoom, t)

        if (prevZoom !== camera.zoom) {
            camera.updateProjectionMatrix()
        }
    })

    return <PointerLockControls pointerSpeed={pointerSpeed} />
}

const ZoomHUD = () => {
    const { zoomIndex } = useZoom()

    return (
        <div
            style={{
                position: 'absolute',
                top: '2em',
                right: '2em',
                color: 'white',
                fontSize: '1.5em',
            }}
        >
            Zoom: {zoomValues[zoomIndex].zoom}x
        </div>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <Controls>
                    <Rig />

                    <mesh>
                        <boxGeometry />
                        <meshStandardMaterial color="orange" />
                    </mesh>

                    <gridHelper args={[10, 10]} position={[0.5, -0.5, 0.5]} />
                </Controls>

                <ambientLight intensity={0.5} />
                <pointLight position={[5, 5, 5]} intensity={100} />
            </Canvas>

            <ZoomHUD />

            <Crosshair />

            <Instructions>
                <div>WASD to move</div>
                <div>Space / Shift to ascend / descend</div>
                <div>[ and ] to zoom</div>
            </Instructions>
        </>
    )
}
