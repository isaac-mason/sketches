import { System } from 'arancini/systems'
import { JoltEntity } from '../ecs'
import { Raw } from '../raw'
import { PhysicsSystem } from './physics-system'

export class BodyContactSystem extends System<JoltEntity> {
    physics = this.attach(PhysicsSystem)!

    onInit(): void {
        const jolt = Raw.module

        /* contact events */
        const contactListener = new jolt.ContactListenerJS()

        contactListener.OnContactAdded = ((body1Ptr: number, body2Ptr: number, manifoldPtr: number, settingsPtr: number) => {
            const body1 = jolt.wrapPointer(body1Ptr, jolt.Body)
            const body2 = jolt.wrapPointer(body2Ptr, jolt.Body)
            const manifold = jolt.wrapPointer(manifoldPtr, jolt.ContactManifold)
            const settings = jolt.wrapPointer(settingsPtr, jolt.ContactSettings)

            const body1Entity = this.physics.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactAdded) {
                body1Entity.bodyEvents.onContactAdded(body1, body2, manifold, settings)
            }

            const body2Entity = this.physics.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactAdded) {
                body2Entity.bodyEvents.onContactAdded(body1, body2, manifold, settings)
            }
        }) as never

        contactListener.OnContactPersisted = ((body1Ptr: number, body2Ptr: number, manifoldPtr: number, settingsPtr: number) => {
            const body1 = jolt.wrapPointer(body1Ptr, jolt.Body)
            const body2 = jolt.wrapPointer(body2Ptr, jolt.Body)
            const manifold = jolt.wrapPointer(manifoldPtr, jolt.ContactManifold)
            const settings = jolt.wrapPointer(settingsPtr, jolt.ContactSettings)

            const body1Entity = this.physics.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactPersisted) {
                body1Entity.bodyEvents.onContactPersisted(body1, body2, manifold, settings)
            }

            const body2Entity = this.physics.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactPersisted) {
                body2Entity.bodyEvents.onContactPersisted(body1, body2, manifold, settings)
            }
        }) as never

        contactListener.OnContactRemoved = ((subShapePairPtr: number) => {
            const subShapePair = jolt.wrapPointer(subShapePairPtr, jolt.SubShapeIDPair)

            const body1 = this.physics.physicsSystem.GetBodyLockInterfaceNoLock().TryGetBody(subShapePair.GetBody1ID())
            const body2 = this.physics.physicsSystem.GetBodyLockInterfaceNoLock().TryGetBody(subShapePair.GetBody2ID())

            const body1Entity = this.physics.getBodyEntity(body1)
            if (body1Entity?.bodyEvents?.onContactRemoved) {
                body1Entity.bodyEvents.onContactRemoved(subShapePair)
            }

            const body2Entity = this.physics.getBodyEntity(body2)
            if (body2Entity?.bodyEvents?.onContactRemoved) {
                body2Entity.bodyEvents.onContactRemoved(subShapePair)
            }
        }) as never

        contactListener.OnContactValidate = ((
            _body1Ptr: number,
            _body2Ptr: number,
            _baseOffsetPtr: number,
            _collideShapeResultPtr: number,
        ) => {
            // Required for JSInterface to have this function exist
            return jolt.ValidateResult_AcceptAllContactsForThisBodyPair
        }) as never

        this.physics.physicsSystem.SetContactListener(contactListener)
    }
}
