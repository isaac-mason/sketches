import { RigidBody } from '@dimforge/rapier3d-compat'
import { Object3D, Quaternion, Vector3 } from 'three'

const pointToWorldFrame_quaternion = new Quaternion()

const pointToWorldFrame = (object: RigidBody | Object3D, localPoint: Vector3, target = new Vector3()): Vector3 => {
    target.copy(localPoint)

    const quaternion = pointToWorldFrame_quaternion.copy(
        object instanceof Object3D ? object.quaternion : (object.rotation() as Quaternion),
    )

    const position = object instanceof Object3D ? object.position : (object.translation() as Vector3)

    return target.copy(localPoint).applyQuaternion(quaternion).add(position)
}


const vectorToLocalFrame_quaternion = new Quaternion()

const vectorToLocalFrame = (object: RigidBody, worldVector: Vector3, target = new Vector3()): Vector3 => {
    const quaternion = vectorToLocalFrame_quaternion.copy(object.rotation() as Quaternion)

    quaternion.conjugate()

    return target.copy(worldVector).applyQuaternion(quaternion)
}

/**
 * A spring, connecting two bodies.
 * @example
 *     const spring = new Spring(boxBody, sphereBody, {
 *       restLength: 0,
 *       stiffness: 50,
 *       damping: 1,
 *     })
 *
 *     // Compute the force after each step
 *     world.addEventListener('postStep', (event) => {
 *       spring.applyForce()
 *     })
 */
export class Spring {
    /**
     * Rest length of the spring. A number > 0.
     * @default 1
     */
    restLength: number

    /**
     * Stiffness of the spring. A number >= 0.
     * @default 100
     */
    stiffness: number

    /**
     * Damping of the spring. A number >= 0.
     * @default 1
     */
    damping: number

    /**
     * First connected body.
     */
    bodyA: RigidBody

    /**
     * Second connected body.
     */
    bodyB: RigidBody

    /**
     * Anchor for bodyA in local bodyA coordinates.
     * Where to hook the spring to body A, in local body coordinates.
     * @default new Vector3()
     */
    localAnchorA: Vector3

    /**
     * Anchor for bodyB in local bodyB coordinates.
     * Where to hook the spring to body B, in local body coordinates.
     * @default new Vector3()
     */
    localAnchorB: Vector3

    constructor(
        bodyA: RigidBody,
        bodyB: RigidBody,
        options: {
            /**
             * Rest length of the spring. A number > 0.
             * @default 1
             */
            restLength?: number
            /**
             * Stiffness of the spring. A number >= 0.
             * @default 100
             */
            stiffness?: number
            /**
             * Damping of the spring. A number >= 0.
             * @default 1
             */
            damping?: number
            /**
             * Anchor for bodyA in local bodyA coordinates.
             * Where to hook the spring to body A, in local body coordinates.
             * @default new Vector3()
             */
            localAnchorA?: Vector3
            /**
             * Anchor for bodyB in local bodyB coordinates.
             * Where to hook the spring to body B, in local body coordinates.
             * @default new Vector3()
             */
            localAnchorB?: Vector3
            /**
             * Where to hook the spring to body A, in world coordinates.
             */
            worldAnchorA?: Vector3
            /**
             * Where to hook the spring to body B, in world coordinates.
             */
            worldAnchorB?: Vector3
        } = {},
    ) {
        this.restLength = typeof options.restLength === 'number' ? options.restLength : 1
        this.stiffness = options.stiffness || 100
        this.damping = options.damping || 1
        this.bodyA = bodyA
        this.bodyB = bodyB
        this.localAnchorA = new Vector3()
        this.localAnchorB = new Vector3()

        if (options.localAnchorA) {
            this.localAnchorA.copy(options.localAnchorA)
        }
        if (options.localAnchorB) {
            this.localAnchorB.copy(options.localAnchorB)
        }
        if (options.worldAnchorA) {
            this.setWorldAnchorA(options.worldAnchorA)
        }
        if (options.worldAnchorB) {
            this.setWorldAnchorB(options.worldAnchorB)
        }
    }

    /**
     * Set the anchor point on body A, using world coordinates.
     */
    setWorldAnchorA(worldAnchorA: Vector3): void {
        vectorToLocalFrame(this.bodyA, worldAnchorA, this.localAnchorA)
    }

    /**
     * Set the anchor point on body B, using world coordinates.
     */
    setWorldAnchorB(worldAnchorB: Vector3): void {
        vectorToLocalFrame(this.bodyB, worldAnchorB, this.localAnchorB)
    }

    /**
     * Get the anchor point on body A, in world coordinates.
     * @param result The vector to store the result in.
     */
    getWorldAnchorA(result: Vector3): void {
        pointToWorldFrame(this.bodyA, this.localAnchorA, result)
    }

    /**
     * Get the anchor point on body B, in world coordinates.
     * @param result The vector to store the result in.
     */
    getWorldAnchorB(result: Vector3): void {
        pointToWorldFrame(this.bodyB, this.localAnchorB, result)
    }

    /**
     * Apply the spring force to the connected bodies.
     */
    applyForce(): void {
        const k = this.stiffness
        const d = this.damping
        const l = this.restLength
        const bodyA = this.bodyA
        const bodyB = this.bodyB
        const r = applyForce_r
        const r_unit = applyForce_r_unit
        const u = applyForce_u
        const f = applyForce_f
        const tmp = applyForce_tmp
        const worldAnchorA = applyForce_worldAnchorA
        const worldAnchorB = applyForce_worldAnchorB
        const ri = applyForce_ri
        const rj = applyForce_rj
        const ri_x_f = applyForce_ri_x_f
        const rj_x_f = applyForce_rj_x_f

        const bodyAPosition = new Vector3().copy(bodyA.translation() as Vector3)
        const bodyBPosition = new Vector3().copy(bodyB.translation() as Vector3)

        const bodyAVelocity = new Vector3().copy(bodyA.linvel() as Vector3)
        const bodyBVelocity = new Vector3().copy(bodyB.linvel() as Vector3)

        const bodyAAngularVelocity = new Vector3().copy(bodyA.angvel() as Vector3)
        const bodyBAngularVelocity = new Vector3().copy(bodyB.angvel() as Vector3)

        const bodyAForce = new Vector3()
        const bodyBForce = new Vector3()

        const bodyATorque = new Vector3()
        const bodyBTorque = new Vector3()

        // Get world anchors
        this.getWorldAnchorA(worldAnchorA)
        this.getWorldAnchorB(worldAnchorB)

        // Get offset points
        ri.subVectors(worldAnchorA, bodyAPosition)
        rj.subVectors(worldAnchorB, bodyBPosition)

        // Compute distance vector between world anchor points
        r.subVectors(worldAnchorB, worldAnchorA)
        const rlen = r.length()
        r_unit.copy(r)
        r_unit.normalize()

        // Compute relative velocity of the anchor points, u
        u.subVectors(bodyBVelocity, bodyAVelocity)

        // Add rotational velocity
        tmp.crossVectors(bodyBAngularVelocity, rj)
        u.add(tmp)
        tmp.crossVectors(bodyAAngularVelocity, ri)
        u.sub(tmp)

        // F = - k * ( x - L ) - D * ( u )
        f.copy(r_unit).multiplyScalar(-k * (rlen - l) - d * u.dot(r_unit))

        // Add forces to bodies
        bodyAForce.sub(f)
        bodyBForce.add(f)

        // Angular force
        ri_x_f.crossVectors(ri, f)
        rj_x_f.crossVectors(rj, f)
        bodyATorque.sub(ri_x_f)
        bodyBTorque.add(rj_x_f)

        // Apply force and torque to bodies
        bodyA.addForce(bodyAForce, true)
        bodyA.addTorque(bodyATorque, true)
        bodyB.addForce(bodyBForce, true)
        bodyB.addTorque(bodyBTorque, true)
    }

    preStep(): void {
        this.applyForce()
    }

    postStep(): void {
        this.bodyA.resetForces(true)
        this.bodyA.resetTorques(true)

        this.bodyB.resetForces(true)
        this.bodyB.resetTorques(true)
    }
}

const applyForce_r = new Vector3()
const applyForce_r_unit = new Vector3()
const applyForce_u = new Vector3()
const applyForce_f = new Vector3()
const applyForce_worldAnchorA = new Vector3()
const applyForce_worldAnchorB = new Vector3()
const applyForce_ri = new Vector3()
const applyForce_rj = new Vector3()
const applyForce_ri_x_f = new Vector3()
const applyForce_rj_x_f = new Vector3()
const applyForce_tmp = new Vector3()
