import { Canvas, Crosshair } from '@/common'
import { KeyboardControls, PerspectiveCamera, PointerLockControls, useKeyboardControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { useRef } from 'react'
import * as THREE from 'three'
import { CameraBuildTool } from '../camera-build-tool'
import { VoxelChunkMeshes, Voxels, useVoxels } from '../lib/react'
import { useSimpleLevel } from '../simple-level'

const SKETCH = 'simple-voxels/box-character-controller'

type Input = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
}

const controls = [
    { name: 'forward', keys: ['ArrowUp', 'w', 'W'] },
    { name: 'backward', keys: ['ArrowDown', 's', 'S'] },
    { name: 'left', keys: ['ArrowLeft', 'a', 'A'] },
    { name: 'right', keys: ['ArrowRight', 'd', 'D'] },
    { name: 'jump', keys: ['Space'] },
    { name: 'sprint', keys: ['ShiftLeft'] },
]

type PlayerProps = {
    position: THREE.Vector3Tuple
    width: number
    height: number
}

const tmpThirdPersonOffset = new THREE.Vector3()
const tmpVerticalRayOrigin = new THREE.Vector3()
const tmpVerticalRayOffset = new THREE.Vector3()

const tmpFrontVector = new THREE.Vector3()
const tmpSideVector = new THREE.Vector3()
const tmpDirection = new THREE.Vector3()
const tmpCameraWorldDirection = new THREE.Vector3()

const down = { x: 0, y: -1, z: 0 }
const up = { x: 0, y: 1, z: 0 }

const Player = ({ position: initialPosition, width, height }: PlayerProps) => {
    const { cameraMode } = useControls(`${SKETCH}-player`, {
        cameraMode: {
            value: 'first-person',
            options: ['first-person', 'third-person'],
        },
    })

    const { voxels } = useVoxels()

    const groupRef = useRef<THREE.Group>(null!)
    const [, getControls] = useKeyboardControls()

    const position = useRef(new THREE.Vector3(...initialPosition))
    const velocity = useRef(new THREE.Vector3())
    const jumping = useRef(false)
    const jumpTime = useRef(0)

    const characterHalfHeight = height / 2
    const characterHalfWidth = width / 2
    const horizontalSensorOffset = characterHalfWidth - 0.05

    const _intersectsVoxelPosition = new THREE.Vector3()

    const intersectsVoxel = (position: THREE.Vector3Like) => {
        return voxels.world.getSolid(_intersectsVoxelPosition.copy(position).floor())
    }

    const checkGrounded = (): boolean => {
        const offsets: THREE.Vector3Tuple[] = [
            [horizontalSensorOffset, 0, horizontalSensorOffset],
            [-horizontalSensorOffset, 0, horizontalSensorOffset],
            [horizontalSensorOffset, 0, -horizontalSensorOffset],
            [-horizontalSensorOffset, 0, -horizontalSensorOffset],
        ]

        for (const offset of offsets) {
            const origin = tmpVerticalRayOrigin.copy(position.current).add(tmpVerticalRayOffset.set(...offset))
            const ray = voxels.world.raycast({ origin, direction: down })

            if (ray.hit) {
                const distance = position.current.y - ray.hitPosition.y

                if (distance < characterHalfHeight + 0.001) {
                    return true
                }
            }
        }

        return false
    }

    const checkHitCeiling = (): boolean => {
        const offsets: THREE.Vector3Tuple[] = [
            [horizontalSensorOffset, 0, horizontalSensorOffset],
            [-horizontalSensorOffset, 0, horizontalSensorOffset],
            [horizontalSensorOffset, 0, -horizontalSensorOffset],
            [-horizontalSensorOffset, 0, -horizontalSensorOffset],
        ]

        for (const offset of offsets) {
            const origin = tmpVerticalRayOrigin.copy(position.current).add(tmpVerticalRayOffset.set(...offset))
            const ray = voxels.world.raycast({ origin, direction: up })

            if (ray.hit) {
                const distance = ray.hitPosition.y - position.current.y

                if (distance < characterHalfHeight - 0.001) {
                    return true
                }
            }
        }

        return false
    }

    useFrame(({ camera, clock: { elapsedTime } }, delta) => {
        const { forward, backward, left, right, jump, sprint } = getControls() as Input

        const t = 1 - Math.pow(0.01, delta)

        const grounded = checkGrounded()

        /* desired vertical velocity */
        // jumping
        if (jump && elapsedTime > jumpTime.current + 0.1 && grounded) {
            velocity.current.y = 2
            jumping.current = true
            if (elapsedTime > jumpTime.current + 0.1) {
                jumpTime.current = elapsedTime
            }
        } else if (!jump) {
            jumping.current = false
        }

        // gravity
        velocity.current.y -= t * 0.8 // todo: make this configurable

        /* desired horizontal velocity */
        const frontVector = tmpFrontVector.set(0, 0, 0)
        const sideVector = tmpSideVector.set(0, 0, 0)
        const direction = tmpDirection.set(0, 0, 0)

        frontVector.set(0, 0, Number(backward) - Number(forward))
        sideVector.set(Number(left) - Number(right), 0, 0)

        direction.subVectors(frontVector, sideVector)
        direction.normalize()

        const worldDirection = camera.getWorldDirection(tmpCameraWorldDirection)
        const yaw = Math.atan2(worldDirection.x, worldDirection.z)
        direction.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiplyScalar(-1)

        velocity.current.x = direction.x
        velocity.current.z = direction.z

        const horizontalDims = ['x', 'z'] as const

        // the desired x and z positions of the character
        const horizontalSpeed = 1.2 + (sprint ? 0.6 : 0)
        const nx = velocity.current.x * t * horizontalSpeed + position.current.x
        const nz = velocity.current.z * t * horizontalSpeed + position.current.z

        // the lower y value to use for x and z collision detection
        const characterLowerY = position.current.y - characterHalfHeight

        for (const dim of horizontalDims) {
            // check for horizontal collision along the height of the character, starting from the bottom and moving up
            // if no collision, set the new position to the desired new horizontal position
            // otherwise, don't update the position and set the horizontal velocity to 0
            const direction = velocity.current[dim] < 0 ? -characterHalfWidth : characterHalfWidth

            // the new desired position for the current dimension
            const desired = dim === 'x' ? nx : nz

            let collision = false

            for (let characterY = 0; characterY <= height; characterY += 1) {
                // if the character is standing on the ground, offset the lower y collision check by a
                // small amount so that the character doesn't get stuck
                // const offset = characterY === 0 && grounded ? 0.1 : 0
                let offset = 0
                if (characterY === 0 && grounded) {
                    offset = 0.1
                } else if (characterY === height) {
                    offset = -0.1
                }

                const y = characterY + offset

                if (dim === 'x') {
                    collision =
                        intersectsVoxel({
                            x: nx + direction,
                            y: characterLowerY + y,
                            z: position.current.z - horizontalSensorOffset,
                        }) ||
                        intersectsVoxel({
                            x: nx + direction,
                            y: characterLowerY + y,
                            z: position.current.z + horizontalSensorOffset,
                        })
                } else {
                    collision =
                        intersectsVoxel({
                            x: position.current.x - horizontalSensorOffset,
                            y: characterLowerY + y,
                            z: nz + direction,
                        }) ||
                        intersectsVoxel({
                            x: position.current.x + horizontalSensorOffset,
                            y: characterLowerY + y,
                            z: nz + direction,
                        })
                }

                if (collision) break
            }

            if (!collision) {
                position.current[dim] = desired
            } else {
                velocity.current[dim] = 0
            }
        }

        // desired y position
        const ny = velocity.current.y * t + position.current.y

        // if jumping, check for collision with the ceiling
        if (velocity.current.y > 0) {
            const hitCeiling = checkHitCeiling()

            if (hitCeiling) {
                // todo: set velocity, or reduce velocity + clamp position?
                velocity.current.y = 0
            }
        }

        // if falling, check for collision with the ground
        // if there is a collision, set the y velocity to 0
        // if no collision, set the new position to the desired new y position
        if (velocity.current.y < 0 && grounded) {
            velocity.current.y = 0

            // snap to the ground
            position.current.y = Math.ceil(position.current.y - characterHalfHeight) + characterHalfHeight
        } else {
            position.current.y = ny
        }

        /* update camera position */
        camera.position.copy(position.current)

        if (cameraMode === 'first-person') {
            camera.position.y += height / 4
        } else if (cameraMode === 'third-person') {
            const thirdPersonOffset = tmpThirdPersonOffset.set(0, 0, 10)
            thirdPersonOffset.applyQuaternion(camera.quaternion)
            camera.position.add(thirdPersonOffset)
            camera.position.y += 2
        }

        /* update object3D */
        groupRef.current.position.copy(position.current)

        /* update voxel world actor */
        voxels.actor.copy(position.current)
    })

    return (
        <>
            <group ref={groupRef}>
                <mesh>
                    <boxGeometry args={[width, height, width]} />
                    <meshStandardMaterial color="red" />
                </mesh>
            </group>
        </>
    )
}

const Scene = () => {
    const ready = useSimpleLevel()

    if (!ready) return null

    return (
        <>
            <CameraBuildTool />

            <PointerLockControls makeDefault />
            <KeyboardControls map={controls}>
                <Player position={[0, 30, 0]} width={0.8} height={3} />
            </KeyboardControls>

            <PerspectiveCamera makeDefault fov={90} />
        </>
    )
}

export default function Sketch() {
    return (
        <>
            <Crosshair />

            <Canvas>
                <Voxels>
                    <VoxelChunkMeshes />

                    <Scene />

                    <ambientLight intensity={0.6} />
                    <pointLight decay={0.5} intensity={10} position={[20, 20, 20]} />
                    <pointLight decay={0.5} intensity={10} position={[-20, 20, -20]} />
                </Voxels>
            </Canvas>
        </>
    )
}
