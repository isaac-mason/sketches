import Rapier from '@dimforge/rapier3d-compat'
import { useFrame } from '@react-three/fiber'
import { memo, useRef } from 'react'
import { BufferAttribute, LineSegments } from 'three'

export type PhysicsDebugProps = {
    world: Rapier.World
}

export const PhysicsDebug = memo(({ world }: PhysicsDebugProps) => {
    const ref = useRef<LineSegments>(null)

    useFrame(() => {
        const mesh = ref.current
        if (!mesh) return

        const buffers = world.debugRender()

        mesh.geometry.setAttribute('position', new BufferAttribute(buffers.vertices, 3))
        mesh.geometry.setAttribute('color', new BufferAttribute(buffers.colors, 4))
    })

    return (
        <group>
            <lineSegments ref={ref} frustumCulled={false}>
                <lineBasicMaterial color={0xffffff} vertexColors />
                <bufferGeometry />
            </lineSegments>
        </group>
    )
})
