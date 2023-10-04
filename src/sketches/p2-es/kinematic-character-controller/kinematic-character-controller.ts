import * as p2 from 'p2-es'

const vec2 = p2.vec2
const Ray = p2.Ray
const RaycastResult = p2.RaycastResult
const AABB = p2.AABB
const EventEmitter = p2.EventEmitter

// constants
const ZERO = vec2.create()
const UNIT_Y = vec2.fromValues(0, 1)

// math helpers
function sign(x: number) {
    return x >= 0 ? 1 : -1
}

function lerp(factor: number, start: number, end: number) {
    return start + (end - start) * factor
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value))
}

function angle(a: p2.Vec2, b: p2.Vec2) {
    return Math.acos(vec2.dot(a, b))
}

function expandAABB(aabb: p2.AABB, amount: number) {
    const halfAmount = amount * 0.5
    aabb.lowerBound[0] -= halfAmount
    aabb.lowerBound[1] -= halfAmount
    aabb.upperBound[0] += halfAmount
    aabb.upperBound[1] += halfAmount
}

type RaycastControllerEvents = {
    raycast: {
        type: 'raycast'
        ray: p2.Ray
    }
}

/**
 * Original code from: https://github.com/SebLague/2DPlatformer-Tutorial
 */
export class RaycastController extends EventEmitter<RaycastControllerEvents> {
    updateRaycastOriginsBounds: p2.AABB
    calculateRaySpacingBounds: p2.AABB

    world: p2.World
    body: p2.Body

    collisionMask: number
    skinWidth: number

    horizontalRayCount: number
    verticalRayCount: number
    horizontalRaySpacing: number
    verticalRaySpacing: number

    raycastOrigins: {
        topLeft: p2.Vec2
        topRight: p2.Vec2
        bottomLeft: p2.Vec2
        bottomRight: p2.Vec2
    }

    constructor(options: {
        world: p2.World
        body: p2.Body
        collisionMask?: number
        skinWidth?: number
        horizontalRayCount?: number
        verticalRayCount?: number
        horizontalRaySpacing?: number | null
        verticalRaySpacing?: number | null
    }) {
        super()

        this.updateRaycastOriginsBounds = new AABB()
        this.calculateRaySpacingBounds = new AABB()

        this.world = options.world
        this.body = options.body

        this.collisionMask = options.collisionMask !== undefined ? options.collisionMask : -1
        this.skinWidth = options.skinWidth !== undefined ? options.skinWidth : 0.015
        this.horizontalRayCount = options.horizontalRayCount !== undefined ? options.horizontalRayCount : 4
        this.verticalRayCount = options.verticalRayCount !== undefined ? options.verticalRayCount : 4

        this.horizontalRaySpacing = 0
        this.verticalRaySpacing = 0

        this.raycastOrigins = {
            topLeft: vec2.create(),
            topRight: vec2.create(),
            bottomLeft: vec2.create(),
            bottomRight: vec2.create(),
        }

        this.calculateRaySpacing()
    }

    updateRaycastOrigins() {
        const bounds = this.updateRaycastOriginsBounds
        this.body.aabbNeedsUpdate = true
        this.calculateRaySpacing()
        bounds.copy(this.body.getAABB())

        expandAABB(bounds, this.skinWidth * -2)

        const raycastOrigins = this.raycastOrigins

        vec2.copy(raycastOrigins.bottomLeft, bounds.lowerBound)
        vec2.set(raycastOrigins.bottomRight, bounds.upperBound[0], bounds.lowerBound[1])
        vec2.set(raycastOrigins.topLeft, bounds.lowerBound[0], bounds.upperBound[1])
        vec2.copy(raycastOrigins.topRight, bounds.upperBound)
    }

    calculateRaySpacing() {
        const bounds = this.calculateRaySpacingBounds
        this.body.aabbNeedsUpdate = true
        bounds.copy(this.body.getAABB())
        expandAABB(bounds, this.skinWidth * -2)

        this.horizontalRayCount = clamp(this.horizontalRayCount, 2, Number.MAX_SAFE_INTEGER)
        this.verticalRayCount = clamp(this.verticalRayCount, 2, Number.MAX_SAFE_INTEGER)

        const sizeX = bounds.upperBound[0] - bounds.lowerBound[0]
        const sizeY = bounds.upperBound[1] - bounds.lowerBound[1]
        this.horizontalRaySpacing = sizeY / (this.horizontalRayCount - 1)
        this.verticalRaySpacing = sizeX / (this.verticalRayCount - 1)
    }
}

export class Controller extends RaycastController {
    maxClimbAngle: number
    maxDescendAngle: number

    collisions: {
        above: boolean
        below: boolean
        left: boolean
        right: boolean
        climbingSlope: boolean
        descendingSlope: boolean
        slopeAngle: number
        slopeAngleOld: number
        velocityOld: p2.Vec2
        faceDir: number
        fallingThroughPlatform: boolean
    }

    ray: p2.Ray
    raycastResult: p2.RaycastResult

    constructor(options: {
        maxClimbAngle?: number
        maxDescendAngle?: number
        world: p2.World
        body: p2.Body
        collisionMask?: number
        skinWidth?: number
        horizontalRayCount?: number
        verticalRayCount?: number
        horizontalRaySpacing?: number | null
        verticalRaySpacing?: number | null
    }) {
        super(options)

        const DEG_TO_RAD = Math.PI / 180

        this.maxClimbAngle = options.maxClimbAngle !== undefined ? options.maxClimbAngle : 80 * DEG_TO_RAD

        this.maxDescendAngle = options.maxDescendAngle !== undefined ? options.maxDescendAngle : 80 * DEG_TO_RAD

        this.collisions = {
            above: false,
            below: false,
            left: false,
            right: false,
            climbingSlope: false,
            descendingSlope: false,
            slopeAngle: 0,
            slopeAngleOld: 0,
            velocityOld: vec2.create(),
            faceDir: 1,
            fallingThroughPlatform: false,
        }

        this.ray = new Ray({
            mode: Ray.CLOSEST,
        })
        this.raycastResult = new RaycastResult()
    }

    resetCollisions(velocity: p2.Vec2) {
        const collisions = this.collisions

        collisions.above = collisions.below = false
        collisions.left = collisions.right = false
        collisions.climbingSlope = false
        collisions.descendingSlope = false
        collisions.slopeAngleOld = collisions.slopeAngle
        collisions.slopeAngle = 0
        vec2.copy(collisions.velocityOld, velocity)
    }

    moveWithZeroInput(velocity: p2.Vec2, standingOnPlatform: boolean) {
        return this.move(velocity, ZERO, standingOnPlatform)
    }

    move(velocity: p2.Vec2, input: p2.Vec2, standingOnPlatform: boolean) {
        const collisions = this.collisions

        this.updateRaycastOrigins()
        this.resetCollisions(velocity)

        if (velocity[0] !== 0) {
            collisions.faceDir = sign(velocity[0])
        }

        if (velocity[1] < 0) {
            this.descendSlope(velocity)
        }

        this.horizontalCollisions(velocity)
        if (velocity[1] !== 0) {
            this.verticalCollisions(velocity)
        }

        vec2.add(this.body.position, this.body.position, velocity)

        if (standingOnPlatform) {
            collisions.below = true
        }
    }

    emitRayCastEvent() {
        this.emit({
            type: 'raycast',
            ray: this.ray,
        })
    }

    horizontalCollisions(velocity: p2.Vec2) {
        const collisions = this.collisions
        const maxClimbAngle = this.maxClimbAngle
        const directionX = collisions.faceDir
        const skinWidth = this.skinWidth
        const raycastOrigins = this.raycastOrigins
        let rayLength = Math.abs(velocity[0]) + skinWidth

        for (let i = 0; i < this.horizontalRayCount; i++) {
            const ray = this.ray
            ray.collisionMask = this.collisionMask
            vec2.copy(ray.from, directionX === -1 ? raycastOrigins.bottomLeft : raycastOrigins.bottomRight)
            ray.from[1] += this.horizontalRaySpacing * i
            vec2.set(ray.to, ray.from[0] + directionX * rayLength, ray.from[1])
            ray.update()
            this.world.raycast(this.raycastResult, ray)
            this.emitRayCastEvent()

            if (this.raycastResult.body) {
                const distance = this.raycastResult.getHitDistance(ray)
                if (distance === 0) {
                    continue
                }

                const slopeAngle = angle(this.raycastResult.normal, UNIT_Y)

                if (i === 0 && slopeAngle <= maxClimbAngle) {
                    if (collisions.descendingSlope) {
                        collisions.descendingSlope = false
                        vec2.copy(velocity, collisions.velocityOld)
                    }
                    let distanceToSlopeStart = 0
                    if (slopeAngle !== collisions.slopeAngleOld) {
                        distanceToSlopeStart = distance - skinWidth
                        velocity[0] -= distanceToSlopeStart * directionX
                    }
                    this.climbSlope(velocity, slopeAngle)
                    velocity[0] += distanceToSlopeStart * directionX
                }

                if (!collisions.climbingSlope || slopeAngle > maxClimbAngle) {
                    velocity[0] = (distance - skinWidth) * directionX
                    rayLength = distance

                    if (collisions.climbingSlope) {
                        velocity[1] = Math.tan(collisions.slopeAngle) * Math.abs(velocity[0])
                    }

                    collisions.left = directionX === -1
                    collisions.right = directionX === 1
                }
            }

            this.raycastResult.reset()
        }
    }

    verticalCollisions(velocity: p2.Vec2) {
        const collisions = this.collisions
        const skinWidth = this.skinWidth
        const raycastOrigins = this.raycastOrigins
        const directionY = sign(velocity[1])
        const ray = this.ray
        let rayLength = Math.abs(velocity[1]) + skinWidth

        for (let i = 0; i < this.verticalRayCount; i++) {
            ray.collisionMask = this.collisionMask
            vec2.copy(ray.from, directionY === -1 ? raycastOrigins.bottomLeft : raycastOrigins.topLeft)
            ray.from[0] += this.verticalRaySpacing * i + velocity[0]
            vec2.set(ray.to, ray.from[0], ray.from[1] + directionY * rayLength)
            ray.update()
            this.world.raycast(this.raycastResult, ray)
            this.emitRayCastEvent()

            if (this.raycastResult.body) {
                const distance = this.raycastResult.getHitDistance(ray)
                velocity[1] = (distance - skinWidth) * directionY
                rayLength = distance

                if (collisions.climbingSlope) {
                    velocity[0] = (velocity[1] / Math.tan(collisions.slopeAngle)) * sign(velocity[0])
                }

                collisions.below = directionY === -1
                collisions.above = directionY === 1
            }

            this.raycastResult.reset()
        }

        if (collisions.climbingSlope) {
            let directionX = sign(velocity[0])
            rayLength = Math.abs(velocity[0]) + skinWidth

            ray.collisionMask = this.collisionMask
            vec2.copy(ray.from, directionX === -1 ? raycastOrigins.bottomLeft : raycastOrigins.bottomRight)
            ray.from[1] += velocity[1]
            vec2.set(ray.to, ray.from[0] + directionX * rayLength, ray.from[1])
            ray.update()
            this.world.raycast(this.raycastResult, ray)
            this.emitRayCastEvent()

            if (this.raycastResult.body) {
                const slopeAngle = angle(this.raycastResult.normal, UNIT_Y)
                if (slopeAngle !== collisions.slopeAngle) {
                    velocity[0] = (this.raycastResult.getHitDistance(ray) - skinWidth) * directionX
                    collisions.slopeAngle = slopeAngle
                }
            }
        }
    }

    climbSlope(velocity: p2.Vec2, slopeAngle: number) {
        const collisions = this.collisions
        const moveDistance = Math.abs(velocity[0])
        const climbVelocityY = Math.sin(slopeAngle) * moveDistance

        if (velocity[1] <= climbVelocityY) {
            velocity[1] = climbVelocityY
            velocity[0] = Math.cos(slopeAngle) * moveDistance * sign(velocity[0])
            collisions.below = true
            collisions.climbingSlope = true
            collisions.slopeAngle = slopeAngle
        }
    }

    descendSlope(velocity: p2.Vec2) {
        const raycastOrigins = this.raycastOrigins
        const directionX = sign(velocity[0])
        const collisions = this.collisions
        const ray = this.ray
        ray.collisionMask = this.collisionMask
        vec2.copy(ray.from, directionX === -1 ? raycastOrigins.bottomRight : raycastOrigins.bottomLeft)
        vec2.set(ray.to, ray.from[0], ray.from[1] - 1e6)
        ray.update()
        this.world.raycast(this.raycastResult, ray)
        this.emitRayCastEvent()

        if (this.raycastResult.body) {
            const slopeAngle = angle(this.raycastResult.normal, UNIT_Y)
            if (slopeAngle !== 0 && slopeAngle <= this.maxDescendAngle) {
                if (sign(this.raycastResult.normal[0]) === directionX) {
                    if (this.raycastResult.getHitDistance(ray) - this.skinWidth <= Math.tan(slopeAngle) * Math.abs(velocity[0])) {
                        const moveDistance = Math.abs(velocity[0])
                        const descendVelocityY = Math.sin(slopeAngle) * moveDistance
                        velocity[0] = Math.cos(slopeAngle) * moveDistance * sign(velocity[0])
                        velocity[1] -= descendVelocityY

                        collisions.slopeAngle = slopeAngle
                        collisions.descendingSlope = true
                        collisions.below = true
                    }
                }
            }
        }

        this.raycastResult.reset()
    }

    resetFallingThroughPlatform() {
        this.collisions.fallingThroughPlatform = false
    }
}

export class KinematicCharacterController extends Controller {
    input: p2.Vec2
    accelerationTimeAirborne: number
    accelerationTimeGrounded: number
    moveSpeed: number
    wallSlideSpeedMax: number
    wallStickTime: number
    wallJumpClimb: p2.Vec2
    wallJumpOff: p2.Vec2
    wallLeap: p2.Vec2
    wallSliding: boolean

    gravity: number
    maxJumpVelocity: number
    minJumpVelocity: number
    velocity: p2.Vec2
    velocityXSmoothing: number
    velocityXMin: number
    timeToWallUnstick: number
    _requestJump: boolean
    _requestUnJump: boolean
    scaledVelocity: p2.Vec2

    constructor(options: {
        accelerationTimeAirborne?: number
        accelerationTimeGrounded?: number
        moveSpeed?: number
        wallSlideSpeedMax?: number
        wallStickTime?: number
        wallJumpClimb?: p2.Vec2
        wallJumpOff?: p2.Vec2
        wallLeap?: p2.Vec2
        timeToJumpApex?: number
        maxJumpHeight?: number
        minJumpHeight?: number
        velocityXSmoothing?: number
        velocityXMin?: number
        maxClimbAngle?: number
        maxDescendAngle?: number
        collisionMask?: number
        skinWidth?: number
        horizontalRayCount?: number
        world: p2.World
        body: p2.Body
        verticalRayCount?: number
        horizontalRaySpacing?: number | null
        verticalRaySpacing?: number | null
    }) {
        super(options)

        this.input = vec2.create()

        this.accelerationTimeAirborne = options.accelerationTimeAirborne !== undefined ? options.accelerationTimeAirborne : 0.2
        this.accelerationTimeGrounded = options.accelerationTimeGrounded !== undefined ? options.accelerationTimeGrounded : 0.1
        this.moveSpeed = options.moveSpeed !== undefined ? options.moveSpeed : 6
        this.wallSlideSpeedMax = options.wallSlideSpeedMax !== undefined ? options.wallSlideSpeedMax : 3
        this.wallStickTime = options.wallStickTime !== undefined ? options.wallStickTime : 0.25

        this.wallJumpClimb = vec2.clone(options.wallJumpClimb || [10, 10])
        this.wallJumpOff = vec2.clone(options.wallJumpOff || [10, 10])
        this.wallLeap = vec2.clone(options.wallLeap || [10, 10])
        this.wallSliding = false

        const timeToJumpApex = options.timeToJumpApex !== undefined ? options.timeToJumpApex : 0.4
        const maxJumpHeight = options.maxJumpHeight !== undefined ? options.maxJumpHeight : 4
        const minJumpHeight = options.minJumpHeight !== undefined ? options.minJumpHeight : 1
        this.gravity = -(2 * maxJumpHeight) / Math.pow(timeToJumpApex, 2)
        this.maxJumpVelocity = Math.abs(this.gravity) * timeToJumpApex
        this.minJumpVelocity = Math.sqrt(2 * Math.abs(this.gravity) * minJumpHeight)

        this.velocity = vec2.create()
        this.velocityXSmoothing = options.velocityXSmoothing !== undefined ? options.velocityXSmoothing : 0.2
        this.velocityXMin = options.velocityXMin !== undefined ? options.velocityXMin : 0.0001

        this.timeToWallUnstick = 0
        this._requestJump = false
        this._requestUnJump = false

        this.scaledVelocity = vec2.create()
    }

    setJumpKeyState(isDown: boolean) {
        if (isDown) {
            this._requestJump = true
        } else {
            this._requestUnJump = true
        }
    }

    update(deltaTime: number) {
        const scaledVelocity = this.scaledVelocity
        const input = this.input
        const velocity = this.velocity

        const wallDirX = this.collisions.left ? -1 : 1
        const targetVelocityX = input[0] * this.moveSpeed

        let smoothing = this.velocityXSmoothing
        smoothing *= this.collisions.below ? this.accelerationTimeGrounded : this.accelerationTimeAirborne
        const factor = 1 - Math.pow(smoothing, deltaTime)
        velocity[0] = lerp(factor, velocity[0], targetVelocityX)
        if (Math.abs(velocity[0]) < this.velocityXMin) {
            velocity[0] = 0
        }

        this.wallSliding = false
        if ((this.collisions.left || this.collisions.right) && !this.collisions.below && velocity[1] < 0) {
            this.wallSliding = true

            if (velocity[1] < -this.wallSlideSpeedMax) {
                velocity[1] = -this.wallSlideSpeedMax
            }

            if (this.timeToWallUnstick > 0) {
                velocity[0] = 0

                if (input[0] !== wallDirX && input[0] !== 0) {
                    this.timeToWallUnstick -= deltaTime
                } else {
                    this.timeToWallUnstick = this.wallStickTime
                }
            } else {
                this.timeToWallUnstick = this.wallStickTime
            }
        }

        if (this._requestJump) {
            this._requestJump = false

            if (this.wallSliding) {
                if (wallDirX === input[0]) {
                    velocity[0] = -wallDirX * this.wallJumpClimb[0]
                    velocity[1] = this.wallJumpClimb[1]
                } else if (input[0] === 0) {
                    velocity[0] = -wallDirX * this.wallJumpOff[0]
                    velocity[1] = this.wallJumpOff[1]
                } else {
                    velocity[0] = -wallDirX * this.wallLeap[0]
                    velocity[1] = this.wallLeap[1]
                }
            }

            if (this.collisions.below) {
                velocity[1] = this.maxJumpVelocity
            }
        }

        if (this._requestUnJump) {
            this._requestUnJump = false
            if (velocity[1] > this.minJumpVelocity) {
                velocity[1] = this.minJumpVelocity
            }
        }

        velocity[1] += this.gravity * deltaTime
        vec2.scale(scaledVelocity, velocity, deltaTime)
        this.move(scaledVelocity, input, false)

        if (this.collisions.above || this.collisions.below) {
            velocity[1] = 0
        }
    }
}
