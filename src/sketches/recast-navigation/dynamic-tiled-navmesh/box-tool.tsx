import { useThree } from '@react-three/fiber'
import { RigidBody, RigidBodyProps } from '@react-three/rapier'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Component, Entity } from './ecs'
import { getTraversableMeshes } from './navigation/navigation'

const Box = (props: RigidBodyProps) => {
    return (
        <Entity traversable>
            <Component name="rigidBody">
                <RigidBody {...props} colliders="cuboid">
                    <Component name="three">
                        <mesh>
                            <boxGeometry args={[2, 2, 2]} />
                            <meshStandardMaterial color="hotpink" />
                        </mesh>
                    </Component>
                </RigidBody>
            </Component>
        </Entity>
    )
}

export const BoxTool = () => {
    const camera = useThree((s) => s.camera)
    const scene = useThree((s) => s.scene)

    const [boxes, setBoxes] = useState<THREE.Vector3[]>([])

    const onPointerDown = () => {
        const pointerLocked = document.pointerLockElement !== null
        if (!pointerLocked) return

        const raycaster = new THREE.Raycaster(camera.position, camera.getWorldDirection(new THREE.Vector3()).normalize())

        const traversableMeshes = getTraversableMeshes()
        const intersects = raycaster.intersectObjects(traversableMeshes, true)

        if (intersects.length > 0) {
            const intersect = intersects[0]
            const position = intersect.point
            position.y += 1

            setBoxes((prev) => [...prev, position])
        }
    }

    useEffect(() => {
        window.addEventListener('pointerdown', onPointerDown)
        return () => window.removeEventListener('pointerdown', onPointerDown)
    }, [scene, camera])

    return (
        <>
            {boxes.map((position, index) => (
                <Box key={index} position={position} />
            ))}
        </>
    )
}
