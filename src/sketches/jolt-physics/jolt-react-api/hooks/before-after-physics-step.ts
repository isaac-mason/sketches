import { useEffect } from 'react'
import { useMutableCallback } from '@/common'
import { useECS } from '../context'
import { JoltEntity } from '../ecs'

/**
 * Registers a callback to be called before the physics step
 * @category Hooks
 */
export const useBeforePhysicsStep = (callback: () => void) => {
    const { world } = useECS()

    const ref = useMutableCallback(callback)

    useEffect(() => {
        const entity: JoltEntity = {
            worldEvents: {
                beforeStep: () => ref.current(),
            },
        }

        world.create(entity)

        return () => {
            world.destroy(entity)
        }
    }, [])
}

/**
 * Registers a callback to be called after the physics step
 * @category Hooks
 */
export const useAfterPhysicsStep = (callback: () => void) => {
    const { world } = useECS()

    const ref = useMutableCallback(callback)

    useEffect(() => {
        const entity: JoltEntity = {
            worldEvents: {
                afterStep: () => ref.current(),
            },
        }

        world.create(entity)

        return () => {
            world.destroy(entity)
        }
    }, [])
}
