import { System } from 'arancini/systems'
import { Raw } from '../raw'
import { JoltEntity } from '../ecs'
import { PhysicsSystem } from './physics-system'

export class BodySystem extends System<JoltEntity> {
    physics = this.attach(PhysicsSystem)!

    bodyQuery = this.query((e) => e.has('body'))

    onInit(): void {
        /* body entity events */
        this.bodyQuery.onEntityAdded.add((entity) => {
            const { body } = entity

            this.physics.bodyInterface.AddBody(body.GetID(), Raw.module.EActivation_Activate)

            // store entity on body for easy lookup
            ;(body as any)._arancini_entity = entity
        })

        this.bodyQuery.onEntityRemoved.add(({ body }) => {
            if (!body) return

            this.physics.bodyInterface.RemoveBody(body.GetID())
            this.physics.bodyInterface.DestroyBody(body.GetID())
        })
    }
}
