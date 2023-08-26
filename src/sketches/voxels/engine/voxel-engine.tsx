import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createECS } from 'arancini/react'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { VoxelEnginePlugin, VoxelEnginePluginsApi } from './voxel-engine-types'

const voxelEngineContext = createContext<unknown>(null!)

type VoxelEngineContext<Plugins extends Array<VoxelEnginePlugin>> = VoxelEnginePluginsApi<Plugins> & {
    world: World
    ecs: ReturnType<typeof createECS>
    step: (delta: number) => void
}

export const useVoxelEngine = <Plugins extends Array<VoxelEnginePlugin>>() => {
    return useContext(voxelEngineContext) as VoxelEngineContext<Plugins>
}

export const VoxelEngine = <Plugins extends Array<VoxelEnginePlugin>, Api = VoxelEnginePluginsApi<Plugins>>({
    plugins,
    children,
    paused,
}: {
    plugins: [...Plugins]
    children: React.ReactNode
    paused?: boolean
}) => {
    const [engine, setEngine] = useState<VoxelEngineContext<Plugins>>(null!)

    const initialised = useRef(false)

    const init = () => {
        initialised.current = true

        const world = new World()
        const ecs = createECS(world)

        for (const plugin of plugins) {
            if (!plugin.components) continue
            for (const component of plugin.components) {
                world.registerComponent(component)
            }
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

        engine.world.update(delta)
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
