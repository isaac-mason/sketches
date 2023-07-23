import { useFrame } from '@react-three/fiber'
import { World } from 'arancini'
import { createECS } from 'arancini/react'
import { useEffect, useMemo } from 'react'
import { UnionToIntersection, VoxelEnginePlugin, VoxelEnginePluginApi } from './voxel-engine-types'

export const useVoxelEngine = <Plugins extends Array<VoxelEnginePlugin>>(plugins: [...Plugins] = [] as never) => {
    const { ecs, ...pluginApis } = useMemo(() => {
        const world = new World()
        const ecs = createECS(world)

        type WorldApi = UnionToIntersection<
            {
                [K in keyof Plugins]: VoxelEnginePluginApi<Plugins[K]>
            }[number]
        >

        let api: Partial<WorldApi> = {}

        for (const plugin of plugins) {
            for (const component of plugin.components) {
                world.registerComponent(component)
            }

            for (const system of plugin.systems) {
                world.registerSystem(system)
            }

            const pluginApi = plugin.setup?.(world, ecs)

            if (pluginApi) {
                api = { ...api, ...pluginApi }
            }
        }

        return { ecs, world, ...(api as WorldApi) }
    }, [])

    useEffect(() => {
        ecs.world.init()

        return () => ecs.world.destroy()
    }, [ecs])

    useFrame((_, delta) => {
        if (!ecs.world.initialised) return

        ecs.update(delta)
    })

    return { ecs, ...pluginApis }
}
