import { KeyboardControls, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, ExcludeFromCameraCollision, Instructions, ThirdPersonControls } from '@/common'
import { Duck } from './duck'

const _vector3 = new THREE.Vector3()
const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

type KeyControls = {
    up: boolean
    down: boolean
    left: boolean
    right: boolean
    sprint: boolean
}

const controls = [
    { name: 'up', keys: ['ArrowUp', 'KeyW'] },
    { name: 'down', keys: ['ArrowDown', 'KeyS'] },
    { name: 'left', keys: ['ArrowLeft', 'KeyA'] },
    { name: 'right', keys: ['ArrowRight', 'KeyD'] },
    { name: 'sprint', keys: ['ShiftLeft'] },
]

type EntityType = {
    body?: p2.Body
    slerpRotation?: boolean
    three?: THREE.Object3D
    isPlayer?: true
}

const world = new World<EntityType>()

const { Entity, Component } = createReactAPI(world)

const physicsWorld = new p2.World({ gravity: [0, 0] })

const playerQuery = world.query((e) => e.is('isPlayer').and.has('body', 'three'))
const bodyQuery = world.query((e) => e.is('body'))

bodyQuery.onEntityAdded.add(({ body }) => {
    physicsWorld.addBody(body)
})

bodyQuery.onEntityRemoved.add(({ body }) => {
    if (body) physicsWorld.removeBody(body)
})

const playerSystem = (input: KeyControls, camera: THREE.PerspectiveCamera) => {
    const player = playerQuery.first

    if (!player) return

    const velocity = [Number(input.right) - Number(input.left), Number(input.down) - Number(input.up)]

    p2.vec2.normalize(velocity, velocity)

    const cameraWorldDirection = camera.getWorldDirection(_vector3)
    const yaw = Math.atan2(cameraWorldDirection.x, cameraWorldDirection.z)
    p2.vec2.rotate(velocity, velocity, -yaw + Math.PI)

    if (p2.vec2.length(velocity) > 0) {
        player.body.angle = Math.atan2(velocity[1], velocity[0]) - Math.PI / 2
    }

    const speed = 2.5 * (input.sprint ? 1.5 : 1)

    p2.vec2.multiply(velocity, velocity, [speed, speed])

    p2.vec2.copy(player.body.velocity, velocity)
}

const cameraSystem = (cameraTarget: THREE.Vector3) => {
    const player = playerQuery.first
    if (!player) return

    cameraTarget.copy(player.three.position)
    cameraTarget.y += 0.8
}

const physicsSystem = (delta: number) => {
    physicsWorld.step(delta)

    const t = 1 - Math.pow(0.01, delta)

    for (const { body, three, slerpRotation } of bodyQuery) {
        if (three) {
            const position = body.position
            const angle = -body.angle

            three.position.set(position[0], three.position.y, position[1])

            if (body.mass === 0 || !slerpRotation) {
                three.rotation.y = angle
            } else {
                const euler = _euler.set(0, angle, 0)
                const targetQuaternion = _quat.setFromEuler(euler)
                three.quaternion.slerp(targetQuaternion, t * 5)
            }
        }
    }
}

let playerWaddleTime = 0

const playerWaddleSystem = (delta: number) => {
    const player = playerQuery.first
    if (!player) return

    const waddleTarget = player.three.getObjectByName('waddleTarget') as THREE.Object3D
    if (!waddleTarget) return

    const t = 1 - Math.pow(0.01, delta)

    // waddle if moving
    const moving = p2.vec2.length(player.body.velocity) > 0.1

    if (moving) {
        const playerSpeed = p2.vec2.length(player.body.velocity)
        const waddleSpeed = 1.5

        if (moving) {
            playerWaddleTime += t * playerSpeed * waddleSpeed
        }

        const waddle = Math.sin(playerWaddleTime)

        waddleTarget.rotation.y = waddle * 0.1
    } else {
        waddleTarget.rotation.y = THREE.MathUtils.lerp(waddleTarget.rotation.y, 0, t * 2)
    }
}

const MAX_DELTA = (1 / 60) * 2

const Systems = () => {
    const [, getKeyboardControls] = useKeyboardControls<keyof KeyControls>()
    const target = useMemo(() => {
        return new THREE.Vector3()
    }, [])

    useFrame((state, delta) => {
        const clampedDelta = THREE.MathUtils.clamp(delta, 0, MAX_DELTA)

        const input = getKeyboardControls()

        playerSystem(input, state.camera as THREE.PerspectiveCamera)
        cameraSystem(target)
        physicsSystem(clampedDelta)
        playerWaddleSystem(clampedDelta)
    })

    return <ThirdPersonControls target={target} />
}

const useBody = (fn: () => p2.Body, deps: unknown[] = []) => {
    return useMemo(fn, deps)
}

type PlayerProps = {
    position: [number, number]
}

const Player = ({ position }: PlayerProps) => {
    const body = useBody(() => {
        const b = new p2.Body({ mass: 1 })
        b.position = position
        b.angularDamping = 1

        b.addShape(new p2.Circle({ radius: 0.6 }))

        return b
    }, [])

    return (
        <Entity isPlayer body={body} slerpRotation>
            <Component name="three">
                <group>
                    <group name="waddleTarget" position-y={0.85}>
                        <ExcludeFromCameraCollision>
                            <Duck />
                        </ExcludeFromCameraCollision>
                    </group>
                </group>
            </Component>
        </Entity>
    )
}

type CrateProps = {
    position: [number, number]
    color: THREE.ColorRepresentation
}

const Crate = (props: CrateProps) => {
    const body = useBody(() => {
        const b = new p2.Body({ mass: 1 })
        b.position = props.position
        b.damping = 0.9
        b.angularDamping = 0.9

        b.addShape(new p2.Box({ width: 1, height: 1 }))

        return b
    }, [])

    return (
        <Entity body={body}>
            <Component name="three">
                <mesh position-y={0.5}>
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial color={props.color} />
                </mesh>
            </Component>
        </Entity>
    )
}

type WallProps = {
    position: [number, number]
    angle: number
    length: number
}

const Wall = (props: WallProps) => {
    const body = useBody(() => {
        const b = new p2.Body({ mass: 0 })
        b.position = props.position
        b.angle = THREE.MathUtils.degToRad(props.angle) % (Math.PI * 2)

        b.addShape(new p2.Box({ width: props.length, height: 1 }))

        return b
    }, [])

    return (
        <Entity body={body}>
            <Component name="three">
                <mesh position-y={0.5}>
                    <boxGeometry args={[props.length, 1, 1]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
            </Component>
        </Entity>
    )
}

export function Sketch() {
    return (
        <>
            <Canvas>
                <KeyboardControls map={controls}>
                    <Systems />

                    <PerspectiveCamera makeDefault fov={90} position={[0, 3, 5]} />

                    <Player position={[0, 0]} />

                    <Crate position={[5, 5]} color="orange" />
                    <Crate position={[-5, 5]} color="hotpink" />
                    <Crate position={[5, -5]} color="lightblue" />
                    <Crate position={[-5, -5]} color="magenta" />

                    <Wall position={[-10, 0]} angle={-90} length={20} />
                    <Wall position={[0, -10]} angle={0} length={20} />

                    <gridHelper args={[100, 100]} />

                    <ambientLight intensity={1} />
                    <directionalLight intensity={1.5} position={[10, 10, 5]} />
                </KeyboardControls>
            </Canvas>

            <Instructions>* wasd to move, shift to sprint</Instructions>
        </>
    )
}
