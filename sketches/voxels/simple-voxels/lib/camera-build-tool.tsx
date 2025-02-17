import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Color, Vector3 } from 'three'
import { useVoxels } from './react'

const _vector3 = new Vector3()

const orange = new Color('orange').getHex()

export const CameraBuildTool = () => {
    const { voxels } = useVoxels()

    const gl = useThree((s) => s.gl)
    const camera = useThree((s) => s.camera)

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const origin = camera.position
            const direction = camera.getWorldDirection(_vector3)

            const ray = voxels.world.raycast({ origin, direction })

            if (!ray.hit) return

            if (event.button === 0) {
                const block = ray.hitPosition.floor()

                voxels.setBlock(block.x, block.y, block.z, false)
            } else {
                const block = ray.hitPosition.add(ray.hitNormal).floor()

                voxels.setBlock(block.x, block.y, block.z, true, orange)
            }
        }

        window.addEventListener('pointerdown', onPointerDown)

        return () => {
            window.removeEventListener('pointerdown', onPointerDown)
        }
    }, [gl, camera])

    return null
}
