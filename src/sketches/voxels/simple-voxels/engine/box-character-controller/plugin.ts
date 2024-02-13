import { System } from 'arancini/systems'
import { Object3D, Vector3 } from 'three'
import { CorePluginEntity, VoxelWorldCoreSystem } from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'

export type VoxelBoxCharacterControllerInput = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
}

export type BoxCharacterControllerCameraMode = 'first-person' | 'third-person'

export type VoxelBoxCharacterControllerOptions = {
    height: number
    width: number
    initialPosition: Vector3
}

export class BoxCharacterController {
    transform: Object3D
    position: Vector3
    velocity: Vector3

    jumping: boolean
    jumpTime: number

    characterHalfHeight: number
    characterHalfWidth: number
    horizontalSensorOffset: number

    options: VoxelBoxCharacterControllerOptions

    constructor(options: VoxelBoxCharacterControllerOptions) {
        this.options = options

        this.transform = new Object3D()
        this.transform.position.copy(options.initialPosition)
        this.position = this.transform.position
        this.velocity = new Vector3()

        this.characterHalfHeight = this.options.height / 2
        this.characterHalfWidth = this.options.width / 2
        this.horizontalSensorOffset = this.characterHalfWidth - 0.05

        this.jumping = false
        this.jumpTime = 0
    }
}

const tmpThirdPersonCameraOffset = new Vector3()

export class BoxCharacterControllerSystem extends System<BoxChararacterControllerPluginEntity & CorePluginEntity> {
    controller = this.query((e) => e.has('boxCharacterController', 'boxCharacterControllerInput', 'object3D'), { required: true })

    camera = this.query((e) => e.has('boxCharacterControllerCamera'), { required: true })

    cameraConfiguration = this.singleton('boxCharacterControllerCameraConfiguration')!

    voxelWorld = this.singleton('voxelWorld')!

    voxelWorldActor = this.singleton('voxelWorldActor')!

    static PRIORITY = VoxelWorldCoreSystem.PRIORITY - 1

    onUpdate(delta: number, time: number): void {
        const { boxCharacterController: controller, boxCharacterControllerInput: input, object3D } = this.controller.first!
        const { boxCharacterControllerCamera: camera } = this.camera.first!

        const { forward, backward, left, right, jump } = input

        const grounded = this.checkGrounded(controller)

        /* desired vertical velocity */
        // jumping
        if (jump && time > controller.jumpTime + 0.1 && grounded) {
            controller.velocity.y = 0.6
            controller.jumping = true
            if (time > controller.jumpTime + 0.1) {
                controller.jumpTime = time
            }
        } else if (!jump) {
            controller.jumping = false
        }

        // gravity
        controller.velocity.y -= (delta + 1) * delta

        /* desired horizontal velocity */
        const frontVector = new Vector3()
        const sideVector = new Vector3()
        const direction = new Vector3()

        frontVector.set(0, 0, Number(backward) - Number(forward))
        sideVector.set(Number(left) - Number(right), 0, 0)

        direction.subVectors(frontVector, sideVector).normalize().applyQuaternion(camera.quaternion)

        controller.velocity.x = direction.x
        controller.velocity.z = direction.z

        // the desired x and z positions of the character
        const factor = 10 * delta
        const horizontalSpeed = 0.5
        const nx = controller.velocity.x * factor * horizontalSpeed + controller.position.x
        const nz = controller.velocity.z * factor * horizontalSpeed + controller.position.z

        // the lower y value to use for x and z collision detection
        const characterLowerY = controller.position.y - controller.characterHalfHeight

        // check for x collision along the height of the character, starting from the bottom and moving up
        // if no collision, set the new position to the desired new x position
        // otherwise, don't update the position and set the x velocity to 0
        const xDirection = controller.velocity.x < 0 ? -controller.characterHalfWidth : controller.characterHalfWidth
        let xCollision = false

        for (let characterY = 0; characterY <= controller.options.height; characterY += 1) {
            // if the character is standing on the ground, offset the lower y collision check by a
            // small amount so that the character doesn't get stuck
            const offset = characterY === 0 && grounded ? 0.1 : 0

            const y = characterY + offset

            xCollision =
                this.voxelWorld.intersectsVoxel([
                    nx + xDirection,
                    characterLowerY + y,
                    controller.position.z - controller.horizontalSensorOffset,
                ]) ||
                this.voxelWorld.intersectsVoxel([
                    nx + xDirection,
                    characterLowerY + y,
                    controller.position.z + controller.horizontalSensorOffset,
                ])

            if (xCollision) break
        }

        if (!xCollision) {
            controller.position.x = nx
        } else {
            controller.velocity.x = 0
        }

        // check for z collision along the height of the character, starting from the bottom and moving up
        // if no collision, set the new position to the desired new z position
        // otherwise, don't update the position and set the z velocity to 0
        const zDirection = controller.velocity.z < 0 ? -controller.characterHalfWidth : controller.characterHalfWidth
        let zCollision = false

        for (let characterY = 0; characterY <= controller.options.height; characterY += 1) {
            // if the character is standing on the ground, offset the lower y collision check by a
            // small amount so that the character doesn't get stuck
            const offset = characterY === 0 && grounded ? 0.1 : 0

            const y = characterY + offset

            zCollision =
                this.voxelWorld.intersectsVoxel([
                    nx - controller.horizontalSensorOffset,
                    characterLowerY + y,
                    controller.position.z + zDirection,
                ]) ||
                this.voxelWorld.intersectsVoxel([
                    nx + controller.horizontalSensorOffset,
                    characterLowerY + y,
                    controller.position.z + zDirection,
                ])

            if (zCollision) break
        }

        if (!zCollision) {
            controller.position.z = nz
        } else {
            controller.velocity.z = 0
        }

        // desired y position
        const ny = controller.velocity.y * factor + controller.position.y

        // if jumping, check for collision with the ceiling
        if (controller.velocity.y > 0) {
            const hitCeiling = this.checkHitCeiling(controller)

            if (hitCeiling) {
                controller.velocity.y = 0
            }
        }

        // if falling, check for collision with the ground
        // if there is a collision, set the y velocity to 0
        // if no collision, set the new position to the desired new y position
        if (controller.velocity.y < 0 && grounded) {
            controller.velocity.y = 0

            // snap to the ground
            controller.position.y = Math.ceil(controller.position.y - controller.characterHalfHeight) + controller.characterHalfHeight
        } else {
            controller.position.y = ny
        }

        /* update camera position */
        camera.position.copy(controller.position)

        if (this.cameraConfiguration.mode === 'first-person') {
            camera.position.y += controller.options.height / 4
        } else if (this.cameraConfiguration.mode === 'third-person') {
            const thirdPersonOffset = tmpThirdPersonCameraOffset.set(0, 0, 10)
            thirdPersonOffset.applyQuaternion(camera.quaternion)
            camera.position.add(thirdPersonOffset)
            camera.position.y += 2
        }

        /* update object3D */
        object3D.position.copy(controller.position)

        /* update voxel world actor */
        this.voxelWorldActor.position.copy(controller.position)
    }

    private checkGrounded(controller: BoxCharacterController) {
        const feetOffset = -controller.characterHalfHeight

        return this.checkVerticalCollision(controller, feetOffset)
    }

    private checkHitCeiling(controller: BoxCharacterController) {
        const headOffset = controller.characterHalfHeight

        return this.checkVerticalCollision(controller, headOffset)
    }

    private checkVerticalCollision(controller: BoxCharacterController, yOffset: number): boolean {
        const y = controller.position.y + yOffset
        return (
            this.voxelWorld.intersectsVoxel([
                controller.position.x - controller.horizontalSensorOffset,
                y,
                controller.position.z - controller.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                controller.position.x - controller.horizontalSensorOffset,
                y,
                controller.position.z + controller.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                controller.position.x + controller.horizontalSensorOffset,
                y,
                controller.position.z - controller.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                controller.position.x + controller.horizontalSensorOffset,
                y,
                controller.position.z + controller.horizontalSensorOffset,
            ])
        )
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
