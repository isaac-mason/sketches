import { Bounds, Environment, OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useMemo, useRef } from 'react'
import { Group, OrthographicCamera, Quaternion, Vector2, Vector3 } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer'
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass'
import { Canvas } from '../Canvas'

// https://threejs.org/examples/#webgl_postprocessing_pixel
function pixelAlignFrustum(
    camera: OrthographicCamera,
    aspectRatio: number,
    pixelsPerScreenWidth: number,
    pixelsPerScreenHeight: number
) {
    // 0. Get Pixel Grid Units
    const worldScreenWidth = (camera.right - camera.left) / camera.zoom
    const worldScreenHeight = (camera.top - camera.bottom) / camera.zoom
    const pixelWidth = worldScreenWidth / pixelsPerScreenWidth
    const pixelHeight = worldScreenHeight / pixelsPerScreenHeight

    // 1. Project the current camera position along its local rotation bases
    const camPos = new Vector3()
    camera.getWorldPosition(camPos)
    const camRot = new Quaternion()
    camera.getWorldQuaternion(camRot)
    const camRight = new Vector3(1.0, 0.0, 0.0).applyQuaternion(camRot)
    const camUp = new Vector3(0.0, 1.0, 0.0).applyQuaternion(camRot)
    const camPosRight = camPos.dot(camRight)
    const camPosUp = camPos.dot(camUp)

    // 2. Find how far along its position is along these bases in pixel units
    const camPosRightPx = camPosRight / pixelWidth
    const camPosUpPx = camPosUp / pixelHeight

    // 3. Find the fractional pixel units and convert to world units
    const fractX = camPosRightPx - Math.round(camPosRightPx)
    const fractY = camPosUpPx - Math.round(camPosUpPx)

    // 4. Add fractional world units to the left/right top/bottom to align with the pixel grid
    camera.left = -aspectRatio - fractX * pixelWidth
    camera.right = aspectRatio - fractX * pixelWidth
    camera.top = 1.0 - fractY * pixelHeight
    camera.bottom = -1.0 - fractY * pixelHeight
    camera.updateProjectionMatrix()
}

const App = () => {
    const { pixelSize } = useControls('postprocessing-pixelation', {
        pixelSize: 6,
    })

    const renderer = useThree((state) => state.gl)
    const scene = useThree((state) => state.scene)
    const camera = useThree((state) => state.camera)
    const size = useThree((state) => state.size)
    const viewport = useThree((state) => state.viewport)

    const effectComposer = useMemo(() => {
        const composer = new EffectComposer(renderer)
        composer.addPass(new RenderPixelatedPass(pixelSize, scene, camera))
        return composer
    }, [pixelSize])

    useEffect(() => {
        effectComposer.setSize(size.width, size.height)
        effectComposer.setPixelRatio(viewport.dpr)
    }, [renderer, size, viewport.dpr])

    const torusKnotRef = useRef<Group>(null!)

    useFrame(({ clock: { elapsedTime } }) => {
        torusKnotRef.current.rotation.y = elapsedTime
        torusKnotRef.current.position.y = Math.sin(elapsedTime) / 5

        const rendererSize = renderer.getSize(new Vector2())
        const aspectRatio = rendererSize.x / rendererSize.y

        pixelAlignFrustum(
            camera as OrthographicCamera,
            aspectRatio,
            Math.floor(rendererSize.x / pixelSize),
            Math.floor(rendererSize.y / pixelSize)
        )

        effectComposer.render()
    }, 1)

    return (
        <>
            <group ref={torusKnotRef}>
                <mesh position={[0, 1.5, 0]} castShadow>
                    <torusKnotGeometry args={[0.5, 0.1, 100, 16]} />
                    <meshStandardMaterial color="orange" />
                </mesh>
            </group>

            <mesh receiveShadow rotation-x={-Math.PI / 2} position-y={-0.2}>
                <meshStandardMaterial color="#555" />
                <planeGeometry args={[15, 15]} />
            </mesh>

            <ambientLight intensity={1} />
            <pointLight castShadow position={[5, 10, 2]} intensity={1} />

            <OrbitControls target={[0, 1.5, 0]} />
        </>
    )
}

export default () => (
    <>
        <h1>Postprocessing - Pixelation</h1>
        <Canvas
            shadows
            orthographic
            camera={{ position: [30, 30, 30], zoom: 0.6 }}
        >
            <App />
        </Canvas>
    </>
)
