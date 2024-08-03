import { KeyboardControls, useKeyboardControls } from '@react-three/drei'
import { ThreeElements, useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useMemo } from 'react'
import * as THREE from 'three'
import { ExcludeFromCameraCollision, ThirdPersonControls } from '../components/third-person-controls'

const _velocity = new THREE.Vector3()

type EntityType = {
    three?: THREE.Object3D
    isPlayer?: true
}

const world = new World<EntityType>()

const { Entity, Component } = createReactAPI(world)

type KeyControls = {
    left: boolean
    right: boolean
    forward: boolean
    backward: boolean
    sprint: boolean
}

const controls = [
    { name: 'left', keys: ['KeyA'] },
    { name: 'right', keys: ['KeyD'] },
    { name: 'forward', keys: ['KeyW'] },
    { name: 'backward', keys: ['KeyS'] },
    { name: 'sprint', keys: ['ShiftLeft'] },
]

const playerQuery = world.query((e) => e.is('isPlayer').and.has('three'))

const playerSystem = (delta: number, input: KeyControls, camera: THREE.PerspectiveCamera) => {
    const player = playerQuery.first

    if (!player) return

    const t = 1 - Math.pow(0.001, delta)

    const velocity = _velocity.set(Number(input.right) - Number(input.left), 0, Number(input.backward) - Number(input.forward))

    velocity.normalize()

    const facing = camera.getWorldDirection(new THREE.Vector3()).multiplyScalar(-1)
    const yaw = Math.atan2(facing.x, facing.z)
    velocity.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)

    player.three.rotation.y = camera.rotation.y

    const speed = 0.5 * (input.sprint ? 1.5 : 1)

    velocity.multiplyScalar(speed)
    velocity.multiplyScalar(t)

    player.three.position.add(velocity)
}

const cameraSystem = (delta: number, target: THREE.Vector3) => {
    const player = playerQuery.first
    if (!player) return

    const t = 1 - Math.pow(0.001, delta)
    target.lerp(player.three.position, t * 3)
}

const Player = (props: ThreeElements['group']) => {
    return (
        <Entity isPlayer>
            <Component name="three">
                <group {...props}>
                    <ExcludeFromCameraCollision>
                        <mesh>
                            <cylinderGeometry args={[0.5, 0.5, 1, 8]} />
                            <meshStandardMaterial color="orange" />
                        </mesh>
                    </ExcludeFromCameraCollision>
                </group>
            </Component>
        </Entity>
    )
}

const Controls = () => {
    const target = useMemo(() => {
        return new THREE.Vector3()
    }, [])

    const [, getKeyboardControls] = useKeyboardControls()

    useFrame((state, delta) => {
        const camera = state.camera as THREE.PerspectiveCamera
        const controls = getKeyboardControls() as KeyControls

        playerSystem(delta, controls, camera)
        cameraSystem(delta, target)
    })

    return <ThirdPersonControls target={target} />
}

export type ThirdPersonControllerProps = {
    position: THREE.Vector3Tuple
}

export const ThirdPersonController = ({ position }: ThirdPersonControllerProps) => {
    return (
        <KeyboardControls map={controls}>
            <Controls />
            <Player position={position} />
        </KeyboardControls>
    )
}

export const useThirdPersonController = () => {
    const getPlayerPosition = () => {
        const player = playerQuery.first
        return player?.three.position
    }
    
    return { getPlayerPosition }
}