import { useThree } from '@react-three/fiber'
import { RigidBody, RigidBodyProps } from '@react-three/rapier'
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Component, Entity } from './ecs'
import { getTraversableMeshes } from './navmesh/navmesh'

const Box = (props: RigidBodyProps) => {
    return (
        <Entity traversable>
            <Component name="rigidBody">
                <RigidBody {...props} colliders="cuboid" ccd>
                    <Component name="three">
                        <mesh>
                            <boxGeometry args={[1, 1, 1]} />
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

    const [boxes, setBoxes] = useState<{ position: THREE.Vector3; quaternion: THREE.Quaternion }[]>([])

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

            const quaternion = new THREE.Quaternion()
            const yaw = Math.atan2(camera.position.x - position.x, camera.position.z - position.z)
            quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw)

            setBoxes((prev) => [...prev, { position, quaternion }])
        }
    }

    useEffect(() => {
        window.addEventListener('pointerdown', onPointerDown)
        return () => window.removeEventListener('pointerdown', onPointerDown)
    }, [scene, camera])

    return (
        <>
            {boxes.map(({ position, quaternion }, index) => (
                <Box key={index} position={position} quaternion={quaternion} />
            ))}
        </>
    )
}
