import { Component, System } from 'arancini'
import { Object3D, PerspectiveCamera, Vector3 } from 'three'
import { Object3DComponent, VoxelWorldComponent } from '../core'
import { VoxelEnginePlugin } from '../voxel-engine-types'

export class BoxCharacterControllerCameraComponent extends Component {
    camera!: PerspectiveCamera

    construct(camera: PerspectiveCamera): void {
        this.camera = camera
    }
}

export type VoxelBoxCharacterControllerInput = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
}

export class BoxCharacterControllerInputComponent extends Component {
    input!: VoxelBoxCharacterControllerInput

    construct(input: VoxelBoxCharacterControllerInput): void {
        this.input = input
    }
}

export type BoxCharacterControllerCameraType = 'first-person' | 'third-person'

export type VoxelBoxCharacterControllerOptions = {
    height: number
    width: number
    initialPosition: Vector3
}

export class BoxCharacterControllerComponent extends Component {
    transform!: Object3D
    position!: Vector3
    velocity!: Vector3

    cameraMode!: BoxCharacterControllerCameraType

    jumping!: boolean
    jumpTime!: number

    characterHalfHeight!: number
    characterHalfWidth!: number
    horizontalSensorOffset!: number

    options!: VoxelBoxCharacterControllerOptions

    construct(options: VoxelBoxCharacterControllerOptions) {
        this.options = options

        this.transform = new Object3D()
        this.transform.position.copy(options.initialPosition)
        this.position = this.transform.position
        this.velocity = new Vector3()

        this.characterHalfHeight = this.options.height / 2
        this.characterHalfWidth = this.options.width / 2
        this.horizontalSensorOffset = this.characterHalfWidth - 0.05

        this.cameraMode = 'first-person'

        this.jumping = false
        this.jumpTime = 0
    }
}

export class VoxelBoxCharacterControllerSystem extends System {
    controllerQuery = this.query([BoxCharacterControllerComponent, BoxCharacterControllerInputComponent, Object3DComponent], {
        required: true,
    })

    controllerCameraQuery = this.query([BoxCharacterControllerCameraComponent], { required: true })

    voxelWorld = this.singleton(VoxelWorldComponent, { required: true })!

    tmpThirdPersonCameraOffset = new Vector3()

    onUpdate(delta: number, time: number): void {
        const controllerEntity = this.controllerQuery.first!
        const controller = controllerEntity.get(BoxCharacterControllerComponent)

        const controllerCameraEntity = this.controllerCameraQuery.first!
        const { camera } = controllerCameraEntity.get(BoxCharacterControllerCameraComponent)

        const grounded = this.checkGrounded(controller)

        const {
            input: { forward, backward, left, right, jump },
        } = controllerEntity.get(BoxCharacterControllerInputComponent)

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
        } else {
            controller.position.y = ny
        }

        /* update camera position */
        camera.position.copy(controller.position)

        if (controller.cameraMode === 'first-person') {
            camera.position.y += controller.options.height / 4
        }

        if (controller.cameraMode === 'third-person') {
            const thirdPersonOffset = this.tmpThirdPersonCameraOffset.set(0, 0, 10)
            thirdPersonOffset.applyQuaternion(camera.quaternion)
            camera.position.add(thirdPersonOffset)
            camera.position.y += 2
        }

        /* update object3D */
        const { object3D } = controllerEntity.get(Object3DComponent)
        object3D.position.copy(controller.position)
    }

    private checkGrounded(controller: BoxCharacterControllerComponent) {
        const feetOffset = -controller.characterHalfHeight

        return this.checkVerticalCollision(controller, feetOffset)
    }

    private checkHitCeiling(controller: BoxCharacterControllerComponent) {
        const headOffset = controller.characterHalfHeight

        return this.checkVerticalCollision(controller, headOffset)
    }

    private checkVerticalCollision(controller: BoxCharacterControllerComponent, yOffset: number): boolean {
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

export const BoxCharacterControllerPlugin = {
    components: [BoxCharacterControllerCameraComponent, BoxCharacterControllerInputComponent, BoxCharacterControllerComponent],
    systems: [VoxelBoxCharacterControllerSystem],
} satisfies VoxelEnginePlugin
