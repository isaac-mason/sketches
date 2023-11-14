import { useFrame } from '@react-three/fiber'
import { AnyEntity, World } from 'arancini'
import { ReactAPI, createReactAPI } from 'arancini/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { VoxelEngineEntity, VoxelEnginePlugin, VoxelEnginePluginsApi } from './voxel-engine-types'

const voxelEngineContext = createContext<unknown>(null!)

type VoxelEngineContext<Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>> = VoxelEnginePluginsApi<Plugins> & {
    world: World<VoxelEngineEntity<Plugins>>
    ecs: ReactAPI<VoxelEngineEntity<Plugins>>
    step: (delta: number) => void
}

export const useVoxelEngine = <Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>>() => {
    return useContext(voxelEngineContext) as VoxelEngineContext<Plugins>
}

export const createVoxelEngine = <Plugins extends ReadonlyArray<VoxelEnginePlugin<any>>>(plugins: Plugins) => {
    type Entity = VoxelEngineEntity<Plugins>
    type Api = VoxelEnginePluginsApi<Plugins>

    const VoxelEngine = ({ children, paused }: { children: React.ReactNode; paused?: boolean }) => {
        const [engine, setEngine] = useState<VoxelEngineContext<Plugins>>(null!)

        const initialised = useRef(false)

        const init = () => {
            initialised.current = true

            const world = new World<Entity>()
            const ecs = createReactAPI(world)

            for (const plugin of plugins) {
                if (!plugin.components) continue
                world.registerComponents(plugin.components as (keyof Entity)[])
            }

            for (const plugin of plugins) {
                if (!plugin.systems) continue
                for (const system of plugin.systems) {
                    world.registerSystem(system, { priority: system?.PRIORITY })
                }
            }

            let voxelEngine: Partial<Api> = {}

            for (const plugin of plugins) {
                const pluginApi = plugin.setup?.(world, ecs)

                if (pluginApi) {
                    voxelEngine = { ...voxelEngine, ...pluginApi }
                }
            }

            voxelEngine = { ...voxelEngine, world, ecs }

            setEngine(voxelEngine as VoxelEngineContext<Plugins>)

            world.init()
        }

        if (!initialised.current) {
            init()
        }

        useEffect(() => {
            if (!initialised.current) {
                init()
            }

            return () => {
                engine?.world.reset()
                initialised.current = false
            }
        }, [])

        const step = (delta: number) => {
            if (!engine?.world.initialised) return

            engine.world.step(delta)
        }

        useFrame((_, delta) => {
            if (paused) return

            step(delta)
        })

        return (
            <voxelEngineContext.Provider
                value={{
                    ...engine,
                    step,
                }}
            >
                {children}
            </voxelEngineContext.Provider>
        )
    }

    return {
        VoxelEngine,
        useVoxelEngine: () => {
            return useVoxelEngine<Plugins>()
        },
    }
}
