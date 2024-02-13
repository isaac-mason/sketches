import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { Executor } from 'arancini/systems'
import { useEffect, useMemo } from 'react'
import { suspend } from 'suspend-react'
import { useConst } from '../../../../common'
import { physicsContext } from '../context'
import { JoltEntity } from '../ecs'
import { Raw, initJolt } from '../raw'
import { BodyContactSystem, ConstraintSystem, PhysicsSystem } from '../systems'
import { PhysicsConfig, Vector3Tuple } from '../types'

export type PhysicsProps = {
    gravity?: Vector3Tuple

    /**
     * The update priority at which the physics simulation should run.
     * Only used when `updateLoop` is set to "follow".
     *
     * @see https://docs.pmnd.rs/react-three-fiber/api/hooks#taking-over-the-render-loop
     * @defaultValue undefined
     */
    updatePriority?: number

    /**
     * Set the timestep for the simulation.
     * Setting this to a number (eg. 1/60) will run the
     * simulation at that framerate. Alternatively, you can set this to
     * "vary", which will cause the simulation to always synchronize with
     * the current frame delta times.
     *
     * @defaultValue 'vary'
     */
    timeStep?: number | 'vary'

    /**
     * Interpolate the world transform using the frame delta times.
     * Has no effect if timeStep is set to "vary".
     *
     * @defaultValue true
     **/
    interpolate?: boolean

    /**
     * Pause the physics simulation
     *
     * @defaultValue false
     */
    paused?: boolean
}

export const Physics = ({
    children,
    updatePriority,
    timeStep = 'vary',
    gravity = [0, -9.81, 0],
    paused = false,
    interpolate = true,
}: React.PropsWithChildren<PhysicsProps>) => {
    suspend(() => initJolt(), [])

    const physicsConfig: PhysicsConfig = useConst(() => {
        return {
            timeStep,
            interpolate,
            paused,
        }
    })

    const world = useConst(() => {
        return new World<JoltEntity>()
    })

    const { executor, physicsSystem } = useConst(() => {
        const executor = new Executor(world)

        executor.add(PhysicsSystem)
        executor.add(BodyContactSystem)
        executor.add(ConstraintSystem)

        executor.init()

        const physicsSystem = executor.get(PhysicsSystem)!

        return { executor, physicsSystem }
    })

    useEffect(() => {
        world.create({ physicsConfig })

        if (!executor.initialised) executor.init()

        return () => {
            world.reset();
            executor.destroy();
        }
    }, [])

    useEffect(() => {
        physicsSystem.physicsSystem.SetGravity(new Raw.module.Vec3(...gravity))
    }, [gravity.join(',')])

    useEffect(() => {
        physicsConfig.timeStep = timeStep
        physicsConfig.interpolate = interpolate
        physicsConfig.paused = paused
    }, [timeStep, interpolate, paused])

    useFrame((_, delta) => {
        executor.update(delta)
    }, updatePriority)

    const context = useMemo(() => ({ executor, world, physicsSystem }), [executor, world, physicsSystem])

    return <physicsContext.Provider value={context}>{children}</physicsContext.Provider>
}
