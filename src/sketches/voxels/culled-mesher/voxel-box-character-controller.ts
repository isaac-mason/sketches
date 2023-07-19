import { Camera, Object3D, Vector3 } from 'three'
import { VoxelWorld } from './voxel-world'

export type VoxelBoxCharacterControllerOptions = {
    height: number
    width: number
    initialPosition: Vector3
}

export type VoxelBoxCharacterControllerInput = {
    forward: boolean
    backward: boolean
    left: boolean
    right: boolean
    jump: boolean
}

/**
 * Box character controller for a voxel world.
 * 
 * This is based on the character controller from the game "Ace of Spades"
 * 
 * @see https://github.com/yvt/openspades/blob/master/Sources/Client/Player.cpp
 */
export class VoxelBoxCharacterController {
    transform: Object3D

    get position(): Vector3 {
        return this.transform.position
    }

    velocity: Vector3

    cameraMode: 'first-person' | 'third-person' = 'third-person'

    jumping = false

    private jumpTime = 0

    private characterHalfHeight: number
    private characterHalfWidth: number
    private horizontalSensorOffset: number

    private tmpThirdPersonCameraOffset = new Vector3()

    constructor(
        public voxelWorld: VoxelWorld,
        public camera: Camera,
        private options: VoxelBoxCharacterControllerOptions,
    ) {
        this.voxelWorld = voxelWorld
        this.transform = new Object3D()
        this.transform.position.copy(options.initialPosition)
        this.velocity = new Vector3()

        this.characterHalfHeight = this.options.height / 2
        this.characterHalfWidth = this.options.width / 2
        this.horizontalSensorOffset = this.characterHalfWidth - 0.05
    }

    update(input: VoxelBoxCharacterControllerInput, time: number, delta: number): void {
        const grounded = this.checkGrounded()

        const { forward, backward, left, right, jump } = input

        /* desired vertical velocity */
        // jumping
        if (jump && time > this.jumpTime + 0.1 && grounded) {
            this.velocity.y = 0.6
            this.jumping = true
            if (time > this.jumpTime + 0.1) {
                this.jumpTime = time
            }
        } else if (!jump) {
            this.jumping = false
        }

        // gravity
        this.velocity.y -= (delta + 1) * delta

        /* desired horizontal velocity */
        const frontVector = new Vector3()
        const sideVector = new Vector3()
        const direction = new Vector3()

        frontVector.set(0, 0, Number(backward) - Number(forward))
        sideVector.set(Number(left) - Number(right), 0, 0)

        direction.subVectors(frontVector, sideVector).normalize().applyQuaternion(this.camera.quaternion)

        this.velocity.x = direction.x
        this.velocity.z = direction.z

        // the desired x and z positions of the character
        const factor = 10 * delta
        const horizontalSpeed = 0.5
        const nx = this.velocity.x * factor * horizontalSpeed + this.position.x
        const nz = this.velocity.z * factor * horizontalSpeed + this.position.z

        // the lower y value to use for x and z collision detection
        const characterLowerY = this.position.y - this.characterHalfHeight

        // check for x collision along the height of the character, starting from the bottom and moving up
        // if no collision, set the new position to the desired new x position
        // otherwise, don't update the position and set the x velocity to 0
        const xDirection = this.velocity.x < 0 ? -this.characterHalfWidth : this.characterHalfWidth
        let xCollision = false

        for (let characterY = 0; characterY <= this.options.height; characterY += 1) {
            // if the character is standing on the ground, offset the lower y collision check by a
            // small amount so that the character doesn't get stuck
            const offset = characterY === 0 && grounded ? 0.1 : 0

            const y = characterY + offset

            xCollision =
                this.voxelWorld.intersectsVoxel([
                    nx + xDirection,
                    characterLowerY + y,
                    this.position.z - this.horizontalSensorOffset,
                ]) ||
                this.voxelWorld.intersectsVoxel([nx + xDirection, characterLowerY + y, this.position.z + this.horizontalSensorOffset])

            if (xCollision) break
        }

        if (!xCollision) {
            this.position.x = nx
        } else {
            this.velocity.x = 0
        }

        // check for z collision along the height of the character, starting from the bottom and moving up
        // if no collision, set the new position to the desired new z position
        // otherwise, don't update the position and set the z velocity to 0
        const zDirection = this.velocity.z < 0 ? -this.characterHalfWidth : this.characterHalfWidth
        let zCollision = false

        for (let characterY = 0; characterY <= this.options.height; characterY += 1) {
            // if the character is standing on the ground, offset the lower y collision check by a
            // small amount so that the character doesn't get stuck
            const offset = characterY === 0 && grounded ? 0.1 : 0

            const y = characterY + offset

            zCollision =
                this.voxelWorld.intersectsVoxel([
                    nx - this.horizontalSensorOffset,
                    characterLowerY + y,
                    this.position.z + zDirection,
                ]) ||
                this.voxelWorld.intersectsVoxel([nx + this.horizontalSensorOffset, characterLowerY + y, this.position.z + zDirection])

            if (zCollision) break
        }

        if (!zCollision) {
            this.position.z = nz
        } else {
            this.velocity.z = 0
        }

        // desired y position
        const ny = this.velocity.y * factor + this.position.y

        // if jumping, check for collision with the ceiling
        if (this.velocity.y > 0) {
            const hitCeiling = this.checkHitCeiling()

            if (hitCeiling) {
                this.velocity.y = 0
            }
        }

        // if falling, check for collision with the ground
        // if there is a collision, set the y velocity to 0
        // if no collision, set the new position to the desired new y position
        if (this.velocity.y < 0 && grounded) {
            this.velocity.y = 0
        } else {
            this.position.y = ny
        }

        /* update camera position */
        this.camera.position.copy(this.position)

        if (this.cameraMode === 'first-person') {
            this.camera.position.y += this.options.height / 4
        }

        if (this.cameraMode === 'third-person') {
            const thirdPersonOffset = this.tmpThirdPersonCameraOffset.set(0, 0, 10)
            thirdPersonOffset.applyQuaternion(this.camera.quaternion)
            this.camera.position.add(thirdPersonOffset)
            this.camera.position.y += 2
        }
    }

    private checkGrounded() {
        const feetOffset = -this.characterHalfHeight

        return this.checkVerticalCollision(feetOffset)
    }

    private checkHitCeiling() {
        const headOffset = this.characterHalfHeight

        return this.checkVerticalCollision(headOffset)
    }

    private checkVerticalCollision(yOffset: number): boolean {
        const y = this.position.y + yOffset
        return (
            this.voxelWorld.intersectsVoxel([
                this.position.x - this.horizontalSensorOffset,
                y,
                this.position.z - this.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                this.position.x - this.horizontalSensorOffset,
                y,
                this.position.z + this.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                this.position.x + this.horizontalSensorOffset,
                y,
                this.position.z - this.horizontalSensorOffset,
            ]) ||
            this.voxelWorld.intersectsVoxel([
                this.position.x + this.horizontalSensorOffset,
                y,
                this.position.z + this.horizontalSensorOffset,
            ])
        )
    }
}
