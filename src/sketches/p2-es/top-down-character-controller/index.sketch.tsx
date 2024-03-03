import { KeyboardControls, OrbitControls, PerspectiveCamera, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createReactAPI } from 'arancini/react'
import { useControls } from 'leva'
import * as p2 from 'p2-es'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Canvas, Instructions, useConst } from '../../../common'
import { Duck } from './duck'

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

const playerSystem = (input: KeyControls) => {
    const player = playerQuery.first

    if (!player) return

    const velocity = [0, 0]

    if (input.left) {
        velocity[0] -= 1
    }

    if (input.right) {
        velocity[0] += 1
    }

    if (input.up) {
        velocity[1] -= 1
    }

    if (input.down) {
        velocity[1] += 1
    }

    p2.vec2.normalize(velocity, velocity)

    if (p2.vec2.length(velocity) > 0) {
        player.body.angle = Math.atan2(velocity[1], velocity[0]) - Math.PI / 2
    }

    const speed = 2.5 * (input.sprint ? 1.5 : 1)

    p2.vec2.multiply(velocity, velocity, [speed, speed])

    p2.vec2.copy(player.body.velocity, velocity)
}

const _box3 = new THREE.Box3()
const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

const physicsSystem = (delta: number) => {
    physicsWorld.step(delta)

    const t = 1 - Math.pow(0.01, delta)

    for (const { body, three, slerpRotation } of bodyQuery) {
        if (three) {
            _box3.setFromObject(three)

            const height = _box3.max.y - _box3.min.y
            const y = height / 2

            const position = body.position
            const angle = -body.angle

            three.position.set(position[0], y, position[1])

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

const Loop = () => {
    const [, getKeyboardControls] = useKeyboardControls<keyof KeyControls>()

    useFrame((_, delta) => {
        const clampedDelta = THREE.MathUtils.clamp(delta, 0, MAX_DELTA)

        const input = getKeyboardControls()

        playerSystem(input)
        physicsSystem(clampedDelta)
        playerWaddleSystem(clampedDelta)
    })

    return null
}

const useBody = (fn: () => p2.Body, deps: any[] = []) => {
    const body = useMemo(fn, deps)
    return body
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
                    <group name="waddleTarget">
                        <Duck />
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
                <group>
                    <mesh>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial color={props.color} />
                    </mesh>
                </group>
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
                <mesh>
                    <boxGeometry args={[props.length, 1, 1]} />
                    <meshStandardMaterial color="#555" />
                </mesh>
            </Component>
        </Entity>
    )
}

const CameraRig = () => {
    const targetPosition = useConst(() => new THREE.Vector3(0, 0, 0))
    const targetLookAt = useConst(() => new THREE.Vector3(0, 0, 0))

    useFrame((state, delta) => {
        const player = playerQuery.first
        if (!player) return

        const t = 1 - Math.pow(0.01, delta)

        const { three } = player

        const { x, z } = three.position

        const yOffset = 15
        const zOffset = 10

        targetPosition.set(x, yOffset, z + zOffset)

        state.camera.position.lerp(targetPosition, t)

        targetLookAt.copy(state.camera.position)
        targetLookAt.y -= yOffset
        targetLookAt.z -= zOffset

        state.camera.lookAt(targetLookAt)
    })

    return null
}

export default () => {
    const { orbitControls } = useControls('p2-es-top-down-camera-controller', {
        orbitControls: false,
    })

    return (
        <>
            <Canvas>
                <KeyboardControls map={controls}>
                    <Loop />

                    <Player position={[0, 0]} />

                    {/* scattered crates */}
                    <Crate position={[5, 5]} color="orange" />
                    <Crate position={[-5, 5]} color="hotpink" />
                    <Crate position={[5, -5]} color="lightblue" />
                    <Crate position={[-5, -5]} color="magenta" />

                    {/* walls */}
                    <Wall position={[-10, 0]} angle={-90} length={20} />
                    <Wall position={[0, -10]} angle={0} length={20} />

                    <gridHelper args={[100, 100]} />

                    <ambientLight intensity={1} />
                    <directionalLight intensity={1.5} position={[10, 10, 5]} />

                    {!orbitControls && <CameraRig />}
                    {orbitControls && <OrbitControls />}

                    <PerspectiveCamera makeDefault position={[0, 50, 0]} />
                </KeyboardControls>
            </Canvas>

            <Instructions>* wasd to move, shift to sprint</Instructions>
        </>
    )
}
