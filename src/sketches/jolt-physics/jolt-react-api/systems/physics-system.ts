import { System } from 'arancini/systems'
import Jolt from 'jolt-physics'
import { Layer, NUM_OBJECT_LAYERS } from '../constants'
import { JoltEntity } from '../ecs'
import { Raw } from '../raw'

export class PhysicsSystem extends System<JoltEntity> {
    joltInterface!: Jolt.JoltInterface

    physicsSystem!: Jolt.PhysicsSystem

    bodyInterface!: Jolt.BodyInterface

    bodyQuery = this.query((e) => e.has('body'))

    bodyWithThreeQuery = this.query((e) => e.has('body', 'three'))

    physicsConfig = this.singleton('physicsConfig', { required: true })!

    onInit(): void {
        const jolt = Raw.module

        /* setup collisions and broadphase */
        const objectFilter = new jolt.ObjectLayerPairFilterTable(NUM_OBJECT_LAYERS)
        objectFilter.EnableCollision(Layer.NON_MOVING, Layer.MOVING)
        objectFilter.EnableCollision(Layer.MOVING, Layer.MOVING)

        const BP_LAYER_NON_MOVING = new jolt.BroadPhaseLayer(0)
        const BP_LAYER_MOVING = new jolt.BroadPhaseLayer(1)
        const NUM_BROAD_PHASE_LAYERS = 2
        const bpInterface = new jolt.BroadPhaseLayerInterfaceTable(NUM_OBJECT_LAYERS, NUM_BROAD_PHASE_LAYERS)
        bpInterface.MapObjectToBroadPhaseLayer(Layer.NON_MOVING, BP_LAYER_NON_MOVING)
        bpInterface.MapObjectToBroadPhaseLayer(Layer.MOVING, BP_LAYER_MOVING)

        const settings = new jolt.JoltSettings()
        settings.mObjectLayerPairFilter = objectFilter
        settings.mBroadPhaseLayerInterface = bpInterface
        settings.mObjectVsBroadPhaseLayerFilter = new jolt.ObjectVsBroadPhaseLayerFilterTable(
            settings.mBroadPhaseLayerInterface,
            NUM_BROAD_PHASE_LAYERS,
            settings.mObjectLayerPairFilter,
            NUM_OBJECT_LAYERS,
        )

        /* get interfaces */
        this.joltInterface = new jolt.JoltInterface(settings)
        this.physicsSystem = this.joltInterface.GetPhysicsSystem()
        this.bodyInterface = this.physicsSystem.GetBodyInterface()

        /* cleanup */
        jolt.destroy(settings)
    }

    onUpdate(delta: number): void {
        if (this.physicsConfig.paused) return

        if (this.physicsConfig.timeStep === 'vary') {
            this.variableStep(delta)
        }
    }

    private variableStep(delta: number): void {
        // Don't go below 30 Hz to prevent spiral of death
        const deltaTime = Math.min(delta, 1.0 / 30.0)

        // When running below 55 Hz, do 2 steps instead of 1
        const numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1

        // Step the physics world
        this.joltInterface.Step(deltaTime, numSteps)

        // Update body transforms
        for (const { body, three } of this.bodyWithThreeQuery) {
            const p = body.GetPosition()
            const q = body.GetRotation()
            three.position.set(p.GetX(), p.GetY(), p.GetZ())
            three.quaternion.set(q.GetX(), q.GetY(), q.GetZ(), q.GetW())
        }
    }

    getBodyEntity(body: Jolt.Body): JoltEntity | undefined {
        return (body as any)._arancini_entity
    }
}
