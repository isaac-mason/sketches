import { UserConfig } from 'vite'
import { createCommonConfig } from '../../../../vite-sketch-common'

export default (): UserConfig => {
    const common = createCommonConfig(import.meta.dirname)

    return {
        ...common,
        resolve: {
            ...common.resolve,
            alias: {
                ...common.resolve.alias,
                'three/examples/jsm': 'three/examples/jsm',
                'three/addons': 'three/addons',
                'three/tsl': 'three/tsl',
                'three/webgpu': 'three/webgpu',
                three: 'three/webgpu',
            },
        },
    }
}
