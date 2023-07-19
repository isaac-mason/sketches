import { KeyboardControls, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import { useEffect, useState } from 'react'
import { styled } from 'styled-components'
import { Color, Vector3 } from 'three'
import { Canvas } from '../../../../common'
import { VoxelBoxCharacterController } from '../voxel-box-character-controller'
import { Vec3 } from '../voxel-types'
import { VoxelUtils } from '../voxel-utils'
import { VoxelWorld, useVoxelWorld } from '../voxel-world'

const green1 = new Color('green').addScalar(-0.02).getHex()
const green2 = new Color('green').addScalar(0.02).getHex()
const orange = new Color('orange').getHex()

type PlayerProps = {
    world: VoxelWorld
}

const Player = ({ world }: PlayerProps) => {
    const gl = useThree((s) => s.gl)
    const camera = useThree((s) => s.camera)

    const [, getControls] = useKeyboardControls()

    const [controller, setController] = useState<VoxelBoxCharacterController>()

    useControls(
        'voxels-fps-controls-camera',
        () => ({
            cameraMode: {
                value: 'first-person',
                options: ['first-person', 'third-person'],
                onChange: (v) => {
                    if (!controller) return
                    controller.cameraMode = v
                },
            },
        }),
        [controller],
    )

    const { width, height } = useControls('voxel-fps-controls-controller', {
        width: 0.8,
        height: 2,
    })

    useEffect(() => {
        const voxelCharacterController = new VoxelBoxCharacterController(world, camera, {
            initialPosition: new Vector3(0, 1, 0),
            height,
            width,
        })

        setController(voxelCharacterController)

        return () => setController(undefined)
    }, [camera, width, height])

    useFrame(({ clock: { elapsedTime } }, delta) => {
        if (!controller) return

        const input = getControls() as {
            forward: boolean
            backward: boolean
            left: boolean
            right: boolean
            jump: boolean
        }

        controller.update(input, elapsedTime, delta)
    })

    useEffect(() => {
        const vec3 = new Vector3()

        const onClick = (event: MouseEvent) => {
            const origin = camera.position.toArray()
            const direction = camera.getWorldDirection(vec3).toArray()

            const ray = VoxelUtils.traceRay(world, origin, direction)

            if (!ray.hit) return

            if (event.button === 2) {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0]),
                    Math.floor(ray.hitPosition[1]),
                    Math.floor(ray.hitPosition[2]),
                ]

                world.setBlock(block, {
                    solid: false,
                })
            } else {
                const block: Vec3 = [
                    Math.floor(ray.hitPosition[0] + ray.hitNormal[0]),
                    Math.floor(ray.hitPosition[1] + ray.hitNormal[1]),
                    Math.floor(ray.hitPosition[2] + ray.hitNormal[2]),
                ]

                world.setBlock(block, {
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
        <>
            {controller && (
                <primitive object={controller.transform}>
                    <mesh>
                        <boxGeometry args={[width, height, width]} />
                        <meshStandardMaterial color="red" />
                    </mesh>
                </primitive>
            )}
        </>
    )
}

const App = () => {
    const world = useVoxelWorld()

    useEffect(() => {
        // ground
        for (let x = -15; x < 15; x++) {
            for (let y = -10; y < -5; y++) {
                for (let z = -15; z < 15; z++) {
                    world.setBlock([x, y, z], {
                        solid: true,
                        color: Math.random() > 0.5 ? green1 : green2,
                    })
                }
            }
        }
    }, [world])

    return (
        <>
            <primitive object={world.group} />

            <Player world={world} />

            <ambientLight intensity={0.2} />
            <pointLight intensity={0.5} position={[20, 20, 20]} />
            <pointLight intensity={0.5} position={[-20, 20, -20]} />
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
                    <App />
                    <PointerLockControls makeDefault />
                </Canvas>
            </KeyboardControls>
        </>
    )
}
