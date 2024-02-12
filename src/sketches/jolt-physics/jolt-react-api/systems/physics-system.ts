import { invalidate } from '@react-three/fiber'
import { System } from 'arancini/systems'
import Jolt from 'jolt-physics'
import { MathUtils, Quaternion, Vector3 } from 'three'
import { Layer, NUM_OBJECT_LAYERS } from '../constants'
import { JoltEntity } from '../ecs'
import { Raw } from '../raw'
import { _matrix4, _position, _quaternion, _rotation, _scale, _vector3 } from '../tmp'
import { quat, vec3 } from '../utils'

type BodyState = {
    meshType: 'instancedMesh' | 'mesh'
    body: Jolt.Body
    object: THREE.Object3D
    invertedWorldMatrix: THREE.Matrix4
    setMatrix: (matrix: THREE.Matrix4) => void
    getMatrix: (matrix: THREE.Matrix4) => THREE.Matrix4

    /**
     * Required for instanced bodies.
     */
    scale: THREE.Vector3
    isSleeping: boolean
}

interface CreateBodyStateOptions {
    object: THREE.Object3D
    body: Jolt.Body
    setMatrix?: (matrix: THREE.Matrix4) => void
    getMatrix?: (matrix: THREE.Matrix4) => THREE.Matrix4
    worldScale?: THREE.Vector3
    meshType?: BodyState['meshType']
}

const createBodyState = ({
    body,
    object,
    setMatrix,
    getMatrix,
    worldScale,
    meshType = 'mesh',
}: CreateBodyStateOptions): BodyState => {
    object.updateWorldMatrix(true, false)
    const invertedWorldMatrix = object.parent!.matrixWorld.clone().invert()

    return {
        object,
        body,
        invertedWorldMatrix,
        setMatrix: setMatrix
            ? setMatrix
            : (matrix: THREE.Matrix4) => {
                  object.matrix.copy(matrix)
              },
        getMatrix: getMatrix ? getMatrix : (matrix: THREE.Matrix4) => matrix.copy(object.matrix),
        scale: worldScale || object.getWorldScale(_scale).clone(),
        isSleeping: false,
        meshType,
    }
}

export class PhysicsSystem extends System<JoltEntity> {
    joltInterface!: Jolt.JoltInterface

    physicsSystem!: Jolt.PhysicsSystem

    bodyInterface!: Jolt.BodyInterface

    bodyQuery = this.query((e) => e.has('body'))

    bodyWithThreeQuery = this.query((e) => e.has('body', 'three'))

    worldEvents = this.query((e) => e.has('worldEvents'))

    physicsConfig = this.singleton('physicsConfig', { required: true })!

    private steppingState: {
        accumulator: number
        previousState: Map<
            Jolt.Body,
            {
                position: THREE.Vector3
                quaternion: THREE.Quaternion
            }
        >
    } = {
        accumulator: 0,
        previousState: new Map(),
    }

    private bodyStates = new Map<Jolt.Body, BodyState>()

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
        jolt.destroy(BP_LAYER_NON_MOVING)
        jolt.destroy(BP_LAYER_MOVING)

        /* body entity events */
        this.bodyQuery.onEntityAdded.add((entity) => {
            const { body } = entity

            this.bodyInterface.AddBody(body.GetID(), Raw.module.EActivation_Activate)

            // store entity on body for easy lookup
            ;(body as any)._arancini_entity = entity
        })

        this.bodyQuery.onEntityRemoved.add(({ body }) => {
            if (!body) return

            this.bodyStates.delete(body)
            this.bodyInterface.RemoveBody(body.GetID())
            // todo: calling DestroyBody throws `Uncaught RuntimeError: memory access out of bounds`
            // this.bodyInterface.DestroyBody(body.GetID())
        })
    }

    onDestroy(): void {
        Raw.module.destroy(this.joltInterface)
    }

    onUpdate(delta: number): void {
        if (this.physicsConfig.paused) return

        const timeStep = this.physicsConfig.timeStep
        const timeStepVariable = timeStep === 'vary'
        const interpolate = this.physicsConfig.interpolate

        if (timeStepVariable) {
            this.variableStep(delta)
        } else {
            this.fixedTimeStep(delta, timeStep, interpolate)
        }

        const interpolationAlpha = timeStepVariable || !interpolate ? 1 : this.steppingState.accumulator / timeStep

        for (const entity of this.bodyQuery) {
            const body = entity.body

            let state = this.bodyStates.get(body)

            if (!state) {
                state = createBodyState({
                    body: body,
                    object: entity.three!,
                })
                this.bodyStates.set(body, state)
            }

            // todo: sleep / wake events

            // todo: early exit if sleeping

            // Get new position and rotation
            const pos = body.GetPosition()
            const rot = body.GetRotation()

            if (interpolate) {
                const previousState = this.steppingState.previousState.get(body)

                if (previousState) {
                    // Get previous simulated world position
                    _matrix4
                        .compose(previousState.position, previousState.quaternion, state.scale)
                        .premultiply(state.invertedWorldMatrix)
                        .decompose(_position, _rotation, _scale)

                    // Apply previous tick position
                    if (state.meshType == 'mesh') {
                        state.object.position.copy(_position)
                        state.object.quaternion.copy(_rotation)
                    }
                }
            }

            // Get new position
            _matrix4
                .compose(vec3.joltToThree(pos, _vector3), quat.joltToThree(rot, _quaternion), state.scale)
                .premultiply(state.invertedWorldMatrix)
                .decompose(_position, _rotation, _scale)

            if (state.meshType == 'instancedMesh') {
                state.setMatrix(_matrix4)
            } else {
                if (interpolate) {
                    state.object.position.lerp(_position, interpolationAlpha)
                    state.object.quaternion.slerp(_rotation, interpolationAlpha)
                } else {
                    state.object.position.copy(_position)
                    state.object.quaternion.copy(_rotation)
                }
            }
        }

        // todo: consider sleeping
        invalidate()
    }

    private variableStep(delta: number): void {
        // Max of 0.5 to prevent tunneling / instability
        const deltaTime = MathUtils.clamp(delta, 0, 0.5)

        // When running below 55 Hz, do 2 steps instead of 1
        const numSteps = deltaTime > 1.0 / 55.0 ? 2 : 1

        // Step the physics world
        this.stepWorld(deltaTime, numSteps)
    }

    private stepWorld(delta: number, steps: number) {
        for (const entity of this.worldEvents) {
            if (entity.worldEvents.beforeStep) {
                entity.worldEvents.beforeStep()
            }
        }

        this.joltInterface.Step(delta, steps)

        for (const entity of this.worldEvents) {
            if (entity.worldEvents.afterStep) {
                entity.worldEvents.afterStep()
            }
        }
    }

    private fixedTimeStep(delta: number, timeStep: number, interpolate: boolean): void {
        // don't step time forwards if paused
        // Increase accumulator
        this.steppingState.accumulator += delta

        while (this.steppingState.accumulator >= timeStep) {
            // Set up previous state
            // needed for accurate interpolations if the world steps more than once
            if (interpolate) {
                this.steppingState.previousState = new Map()

                for (const { body } of this.bodyQuery) {
                    let previousState = this.steppingState.previousState.get(body)

                    if (!previousState) {
                        previousState = {
                            position: new Vector3(),
                            quaternion: new Quaternion(),
                        }
                        this.steppingState.previousState.set(body, previousState)
                    }

                    vec3.joltToThree(body.GetPosition(), previousState.position)
                    quat.joltToThree(body.GetRotation(), previousState.quaternion)
                }
            }

            this.stepWorld(timeStep, 1)

            this.steppingState.accumulator -= timeStep
        }
    }

    getBodyEntity(body: Jolt.Body): JoltEntity | undefined {
        return (body as any)._arancini_entity
    }
}
