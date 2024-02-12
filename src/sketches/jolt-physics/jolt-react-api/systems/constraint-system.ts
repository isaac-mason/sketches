import { System } from 'arancini/systems'
import Jolt from 'jolt-physics'
import { JoltEntity } from '../ecs'
import { PhysicsSystem } from './physics-system'

export class ConstraintSystem extends System<JoltEntity> {
    physics = this.attach(PhysicsSystem)!

    constraintQuery = this.query((e) => e.has('constraint'))

    onInit(): void {
        this.constraintQuery.onEntityAdded.add((entity) => {
            const { constraint } = entity

            this.physics.physicsSystem.AddConstraint(constraint)
        })

        this.constraintQuery.onEntityRemoved.add(({ constraint }) => {
            if (!constraint) return

            this.physics.physicsSystem.RemoveConstraint(constraint)
            Jolt.destroy(constraint)
        })
    }
}
