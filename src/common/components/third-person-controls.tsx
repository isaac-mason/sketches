import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import { useEffect, useState } from 'react'
import * as THREE from 'three'

export const ExcludeFromCameraCollision = ({ children }: { children: React.ReactNode }) => {
    return <object3D userData={{ excludeFromCameraCollision: true }}>{children}</object3D>
}

export type ThirdPersonControlsProps = {
    maxDistance?: number
    minDistance?: number
    target: THREE.Vector3

    children?: React.ReactNode
}

export const ThirdPersonControls = ({ minDistance = 3, maxDistance = 10, target, children }: ThirdPersonControlsProps) => {
    const { gl, scene } = useThree()
    const [controls, setControls] = useState<CameraControlsImpl | null>()

    /* target */
    useFrame(() => {
        if (!controls) return

        controls.moveTo(target.x, target.y, target.z, false)
        controls.draggingSmoothTime = 0.02
        controls.smoothTime = 0.02
    })

    useEffect(() => {
        if (!controls) return

        /* mouse config */
        controls.mouseButtons.wheel = CameraControlsImpl.ACTION.DOLLY

        /* camera collision */
        const colliderMeshes: THREE.Object3D[] = []

        const traverse = (object: THREE.Object3D) => {
            if (object.userData && object.userData.excludeFromCameraCollision === true) {
                return
            }

            if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry.type !== 'InstancedBufferGeometry') {
                colliderMeshes.push(object)
            }

            object.children.forEach((child) => {
                traverse(child)
            })
        }

        scene.children.forEach((child) => traverse(child))

        controls.colliderMeshes = colliderMeshes

        return () => {
            controls.colliderMeshes = []
        }
    }, [controls])

    /* camera distance */
    useEffect(() => {
        if (!controls) return

        controls.minDistance = minDistance
        controls.maxDistance = maxDistance
    }, [controls, minDistance, maxDistance])

    /* pointer lock */
    useEffect(() => {
        if (!controls) return

        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return

            controls.lockPointer()
        }

        gl.domElement.addEventListener('pointerdown', onPointerDown)

        return () => {
            gl.domElement.removeEventListener('pointerdown', onPointerDown)
        }
    }, [controls])

    return (
        <>
            <CameraControls makeDefault ref={setControls} />

            {children}
        </>
    )
}
