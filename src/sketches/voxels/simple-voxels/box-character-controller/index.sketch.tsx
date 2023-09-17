import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { styled } from 'styled-components'
import { Color, PerspectiveCamera, Vector3 } from 'three'
import { Canvas } from '../../../../common'
import {
    BoxCharacterControllerCameraComponent,
    BoxCharacterControllerComponent,
    BoxCharacterControllerInputComponent,
    BoxCharacterControllerPlugin,
} from '../engine/box-character-controller'
import { CorePlugin, Object3DComponent, Vec3 } from '../engine/core'
import { CulledMesherPlugin, VoxelChunkCulledMeshes } from '../engine/culled-mesher'
import { VoxelEngine, useVoxelEngine } from '../engine/voxel-engine'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()
const orange = new Color('orange').getHex()

const Player = () => {
    const { ecs, voxelWorld, setBlock } = useVoxelEngine<[CorePlugin, CulledMesherPlugin]>()

    const gl = useThree((s) => s.gl)

    const camera = useThree((s) => s.camera)

    const [, getControls] = useKeyboardControls()

    const { width, height } = useControls('voxel-box-character-controller', {
        width: 0.8,
        height: 2,
        cameraMode: {
            value: 'first-person',
            options: ['first-person', 'third-person'],
            onChange: (v) => {
                ecs.world.find([BoxCharacterControllerComponent]).forEach((e) => {
                    e.get(BoxCharacterControllerComponent).cameraMode = v
                })
            },
        },
    })

    const options = useMemo(
        () => ({
            width,
            height,
            initialPosition: new Vector3(0, 1, 0),
        }),
        [width, height],
    )

    const input = useMemo(
        () => ({
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
        }),
        [],
    )

    useFrame(() => {
        const { forward, backward, left, right, jump } = getControls() as {
            forward: boolean
            backward: boolean
            left: boolean
            right: boolean
            jump: boolean
        }

        input.forward = forward
        input.backward = backward
        input.left = left
        input.right = right
        input.jump = jump
    })

    useEffect(() => {
        const vec3 = new Vector3()

        const onClick = (event: MouseEvent) => {
            const origin = camera.position.toArray()
            const direction = camera.getWorldDirection(vec3).toArray()

            const ray = voxelWorld.traceRay(origin, direction)

            if (!ray.hit) return

            if (event.button === 2) {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0]),
                    Math.floor(ray.hitPosition[1]),
                    Math.floor(ray.hitPosition[2]),
                ]

                setBlock(block, {
                    solid: false,
                })
            } else {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                    Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                    Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
                ]

                setBlock(block, {
                    solid: true,
                    color: orange,
                })
            }
        }

        gl.domElement.addEventListener('mousedown', onClick)

        return () => {
            gl.domElement.removeEventListener('mousedown', onClick)
        }
    }, [gl])

    return (
        <ecs.Entity>
            <ecs.Component type={Object3DComponent}>
                <mesh>
                    <boxGeometry args={[width, height, width]} />
                    <meshStandardMaterial color="red" />
                </mesh>
            </ecs.Component>
            <ecs.Component type={BoxCharacterControllerCameraComponent} args={[camera as PerspectiveCamera]} />
            <ecs.Component type={BoxCharacterControllerInputComponent} args={[input]} />
            <ecs.Component type={BoxCharacterControllerComponent} args={[options]} />
        </ecs.Entity>
    )
}

const App = () => {
    const { world, setBlock, step } = useVoxelEngine<[CorePlugin, CulledMesherPlugin, BoxCharacterControllerPlugin]>()

    const [paused, setPaused] = useState(true)

    useLayoutEffect(() => {
        // ground
        for (let x = -50; x < 50; x++) {
            for (let y = -10; y < -5; y++) {
                for (let z = -50; z < 50; z++) {
                    setBlock([x, y, z], {
                        solid: true,
                        color: Math.random() > 0.5 ? green1 : green2,
                    })
                }
            }
        }

        setPaused(false)
    }, [world])

    useFrame((_, delta) => {
        if (paused) return
        step(delta)
    })

    return (
        <>
            <Player />

            <VoxelChunkCulledMeshes />

            <ambientLight intensity={0.6} />
            <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
            <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />
        </>
    )
}

const Crosshair = styled.div`
    position: absolute;
    top: 50%;
    left: 50%;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    transform: translate3d(-50%, -50%, 0);
    border: 2px solid white;
    z-index: 100;
`

export default () => {
    return (
        <>
            <Crosshair />

            <KeyboardControls
                map={[
                    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
                    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
                    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
                    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
                    { name: 'jump', keys: ['Space'] },
                ]}
            >
                <Canvas>
                    <VoxelEngine paused plugins={[CorePlugin, CulledMesherPlugin, BoxCharacterControllerPlugin]}>
                        <App />
                    </VoxelEngine>
                    <PointerLockControls makeDefault />
                </Canvas>
            </KeyboardControls>
        </>
    )
}
