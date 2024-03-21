import { System } from 'arancini/systems'
import * as THREE from 'three'
import { CorePluginEntity, Vec3, VoxelWorldCoreSystem } from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'

export type VoxelBoxCharacterControllerInput = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
    sprint: boolean
}

export type BoxCharacterControllerCameraMode = 'first-person' | 'third-person'

export type VoxelBoxCharacterControllerOptions = {
    height: number
    width: number
    initialPosition: THREE.Vector3
}

export class BoxCharacterController {
    transform: THREE.Object3D
    position: THREE.Vector3
    velocity: THREE.Vector3

    jumping: boolean
    jumpTime: number

    characterHalfHeight: number
    characterHalfWidth: number
    horizontalSensorOffset: number

    options: VoxelBoxCharacterControllerOptions

    constructor(options: VoxelBoxCharacterControllerOptions) {
        this.options = options

        this.transform = new THREE.Object3D()
        this.transform.position.copy(options.initialPosition)
        this.position = this.transform.position
        this.velocity = new THREE.Vector3()

        this.characterHalfHeight = this.options.height / 2
        this.characterHalfWidth = this.options.width / 2
        this.horizontalSensorOffset = this.characterHalfWidth - 0.05

        this.jumping = false
        this.jumpTime = 0
    }
}

const tmpThirdPersonOffset = new THREE.Vector3()
const tmpVerticalRayOrigin = new THREE.Vector3()
const tmpVerticalRayOffset = new THREE.Vector3()

const tmpFrontVector = new THREE.Vector3()
const tmpSideVector = new THREE.Vector3()
const tmpDirection = new THREE.Vector3()
const tmpCameraWorldDirection = new THREE.Vector3()

export class BoxCharacterControllerSystem extends System<BoxChararacterControllerPluginEntity & CorePluginEntity> {
    controller = this.query((e) => e.has('boxCharacterController', 'boxCharacterControllerInput', 'object3D'), { required: true })

    camera = this.query((e) => e.has('boxCharacterControllerCamera'), { required: true })

    cameraConfiguration = this.singleton('boxCharacterControllerCameraConfiguration')!

    voxelWorld = this.singleton('voxelWorld')!

    static PRIORITY = VoxelWorldCoreSystem.PRIORITY - 1

    onUpdate(delta: number, time: number): void {
        const t = 1 - Math.pow(0.01, delta)

        const { boxCharacterController: controller, boxCharacterControllerInput: input, object3D } = this.controller.first!
        const { boxCharacterControllerCamera: camera } = this.camera.first!

        const { forward, backward, left, right, jump } = input

        const grounded = this.checkGrounded(controller)

        /* desired vertical velocity */
        // jumping
        if (jump && time > controller.jumpTime + 0.1 && grounded) {
            controller.velocity.y = 2
            controller.jumping = true
            if (time > controller.jumpTime + 0.1) {
                controller.jumpTime = time
            }
        } else if (!jump) {
            controller.jumping = false
        }

        // gravity
        controller.velocity.y -= t * 0.8 // todo: make this configurable

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

        controller.velocity.x = direction.x
        controller.velocity.z = direction.z

        const horizontalDims = ['x', 'z'] as const

        // the desired x and z positions of the character
        const horizontalSpeed = 1.2 + (input.sprint ? 0.6 : 0)
        const nx = controller.velocity.x * t * horizontalSpeed + controller.position.x
        const nz = controller.velocity.z * t * horizontalSpeed + controller.position.z

        // the lower y value to use for x and z collision detection
        const characterLowerY = controller.position.y - controller.characterHalfHeight

        for (const dim of horizontalDims) {
            // check for horizontal collision along the height of the character, starting from the bottom and moving up
            // if no collision, set the new position to the desired new x position
            // otherwise, don't update the position and set the x velocity to 0
            const direction = controller.velocity[dim] < 0 ? -controller.characterHalfWidth : controller.characterHalfWidth

            // the new desired position for the current dimension
            const desired = dim === 'x' ? nx : nz

            let collision = false

            for (let characterY = 0; characterY <= controller.options.height; characterY += 1) {
                // if the character is standing on the ground, offset the lower y collision check by a
                // small amount so that the character doesn't get stuck
                // const offset = characterY === 0 && grounded ? 0.1 : 0
                let offset = 0
                if (characterY === 0 && grounded) {
                    offset = 0.1
                } else if (characterY === controller.options.height) {
                    offset = -0.1
                }

                const y = characterY + offset

                if (dim === 'x') {
                    collision =
                        this.voxelWorld.intersectsVoxel([
                            nx + direction,
                            characterLowerY + y,
                            controller.position.z - controller.horizontalSensorOffset,
                        ]) ||
                        this.voxelWorld.intersectsVoxel([
                            nx + direction,
                            characterLowerY + y,
                            controller.position.z + controller.horizontalSensorOffset,
                        ])
                } else {
                    collision =
                        this.voxelWorld.intersectsVoxel([
                            controller.position.x - controller.horizontalSensorOffset,
                            characterLowerY + y,
                            nz + direction,
                        ]) ||
                        this.voxelWorld.intersectsVoxel([
                            controller.position.x + controller.horizontalSensorOffset,
                            characterLowerY + y,
                            nz + direction,
                        ])
                }

                if (collision) break
            }

            if (!collision) {
                controller.position[dim] = desired
            } else {
                controller.velocity[dim] = 0
            }
        }

        // desired y position
        const ny = controller.velocity.y * t + controller.position.y

        // if jumping, check for collision with the ceiling
        if (controller.velocity.y > 0) {
            const hitCeiling = this.checkHitCeiling(controller)

            if (hitCeiling) {
                // todo: set velocity, or reduce velocity + clamp position?
                controller.velocity.y = 0
            }
        }

        // if falling, check for collision with the ground
        // if there is a collision, set the y velocity to 0
        // if no collision, set the new position to the desired new y position
        if (controller.velocity.y < 0 && grounded) {
            controller.velocity.y = 0

            // snap to the ground
            controller.position.y =
                Math.ceil(controller.position.y - controller.characterHalfHeight) + controller.characterHalfHeight
        } else {
            controller.position.y = ny
        }

        /* update camera position */
        camera.position.copy(controller.position)

        if (this.cameraConfiguration.mode === 'first-person') {
            camera.position.y += controller.options.height / 4
        } else if (this.cameraConfiguration.mode === 'third-person') {
            const thirdPersonOffset = tmpThirdPersonOffset.set(0, 0, 10)
            thirdPersonOffset.applyQuaternion(camera.quaternion)
            camera.position.add(thirdPersonOffset)
            camera.position.y += 2
        }

        /* update object3D */
        object3D.position.copy(controller.position)

        /* update voxel world actor */
        this.voxelWorld.actor.copy(controller.position)
    }

    private checkGrounded(controller: BoxCharacterController): boolean {
        const offsets: Vec3[] = [
            [controller.horizontalSensorOffset, 0, controller.horizontalSensorOffset],
            [-controller.horizontalSensorOffset, 0, controller.horizontalSensorOffset],
            [controller.horizontalSensorOffset, 0, -controller.horizontalSensorOffset],
            [-controller.horizontalSensorOffset, 0, -controller.horizontalSensorOffset],
        ]

        for (const offset of offsets) {
            const origin = tmpVerticalRayOrigin.copy(controller.position).add(tmpVerticalRayOffset.set(...offset))
            const ray = this.voxelWorld.traceRay(origin.toArray(), [0, -1, 0])

            if (ray.hit) {
                const distance = controller.position.y - ray.hitPosition[1]

                if (distance < controller.characterHalfHeight + 0.001) {
                    return true
                }
            }
        }

        return false
    }

    private checkHitCeiling(controller: BoxCharacterController): boolean {
        const offsets: Vec3[] = [
            [controller.horizontalSensorOffset, 0, controller.horizontalSensorOffset],
            [-controller.horizontalSensorOffset, 0, controller.horizontalSensorOffset],
            [controller.horizontalSensorOffset, 0, -controller.horizontalSensorOffset],
            [-controller.horizontalSensorOffset, 0, -controller.horizontalSensorOffset],
        ]

        for (const offset of offsets) {
            const origin = tmpVerticalRayOrigin.copy(controller.position).add(tmpVerticalRayOffset.set(...offset))
            const ray = this.voxelWorld.traceRay(origin.toArray(), [0, 1, 0])

            if (ray.hit) {
                const distance = ray.hitPosition[1] - controller.position.y

                if (distance < controller.characterHalfHeight - 0.001) {
                    return true
                }
            }
        }

        return false
    }
}

export type BoxChararacterControllerPluginEntity = {
    boxCharacterControllerCamera?: THREE.PerspectiveCamera
    boxCharacterControllerCameraConfiguration?: { mode: BoxCharacterControllerCameraMode }
    boxCharacterControllerInput?: VoxelBoxCharacterControllerInput
    boxCharacterController?: BoxCharacterController
}

export const BoxCharacterControllerPlugin = {
    E: {} as BoxChararacterControllerPluginEntity,
    systems: [BoxCharacterControllerSystem],
} satisfies VoxelEnginePlugin<BoxChararacterControllerPluginEntity>

export type BoxCharacterControllerPlugin = typeof BoxCharacterControllerPlugin
