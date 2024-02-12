import { World } from 'arancini'
import { Executor } from 'arancini/systems'
import { createContext, useContext } from 'react'
import { Raw } from './raw'
import { PhysicsSystem } from './systems/physics-system'
import { JoltEntity } from './ecs'

type ContextType = {
    executor: Executor<JoltEntity>
    world: World<JoltEntity>
    physicsSystem: PhysicsSystem
}

export const physicsContext = createContext<ContextType>(null!)

export const useECS = () => {
    return useContext(physicsContext)
}

export const useJolt = () => {
    const context = useContext(physicsContext)

    const publicApi = {
        jolt: Raw.module,
        joltInterface: context.physicsSystem.joltInterface,
        bodyInterface: context.physicsSystem.bodyInterface,
        physicsSystem: context.physicsSystem,
    }

    return publicApi
}

