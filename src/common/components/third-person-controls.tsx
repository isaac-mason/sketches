import { useFrame, useThree } from '@react-three/fiber'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useConst } from '..'

// adapted from ecctrl useFollowCam hook: https://github.com/pmndrs/ecctrl/blob/main/src/hooks/useFollowCam.tsx

type ThirdPersonControlsContext = {
    target: THREE.Vector3
}

const context = createContext<ThirdPersonControlsContext>(null!)

export const useThirdPersonControls = () => {
    const controls = useContext(context)

    if (!controls) {
        throw new Error('useThirdPersonControls must be used within a ThirdPersonControls component')
    }

    return controls
}

type ThirdPersonControlsProps = {
    enabled?: boolean

    initialDistance?: number
    maxDistance?: number
    minDistance?: number

    cameraMovementSpeed?: number
    cameraZoomSpeed?: number
    cameraCollisionOffset?: number

    initialRotation?: THREE.Vector3Tuple
    targetOffset?: THREE.Vector3Tuple

    children?: React.ReactNode
}

const _vector3 = new THREE.Vector3()

const usePointerLock = () => {
    const { gl } = useThree()

    useEffect(() => {
        const onPointerDown = (e: PointerEvent) => {
            if (e.pointerType !== 'mouse') return

            gl.domElement.requestPointerLock()
        }

        gl.domElement.addEventListener('pointerdown', onPointerDown)

        return () => {
            gl.domElement.removeEventListener('pointerdown', onPointerDown)
        }
    }, [])

    return null
}

export const ExcludeFromCameraCollision = ({ children }: { children: React.ReactNode }) => {
    return <object3D userData={{ excludeFromCameraCollision: true }}>{children}</object3D>
}

export const ThirdPersonControls = ({
    enabled = true,
    initialDistance = -10,
    maxDistance = -15,
    minDistance = -8,
    cameraMovementSpeed = 1,
    cameraZoomSpeed = 1,
    cameraCollisionOffset = -0.7,
    initialRotation = [0, 0, 0],
    targetOffset = [0, 0, 0],
    children,
}: ThirdPersonControlsProps) => {
    usePointerLock()

    const target = useRef(new THREE.Vector3())

    const { gl, scene, camera } = useThree()

    useEffect(() => {
        cameraLookAtTarget.rotation.set(...initialRotation)
    }, [])

    useFrame((_, delta) => {
        if (!enabled) return

        cameraCollision(delta)

        const cameraTarget = _vector3.set(
            target.current.x + targetOffset[0],
            target.current.y + targetOffset[1],
            target.current.z + targetOffset[2],
        )

        cameraLookAtTarget.position.lerp(cameraTarget, 1 - Math.pow(0.01, delta))
        camera.lookAt(cameraLookAtTarget.position)
    })

    const isMouseDown = useRef(false)
    const previousTouch1 = useRef<Touch | null>(null)
    const previousTouch2 = useRef<Touch | null>(null)

    const cameraZoom = useRef(initialDistance)
    const cameraLookAtTarget = useMemo(() => new THREE.Object3D(), [])

    const pivot = useMemo(() => {
        const origin = new THREE.Object3D()
        origin.position.set(0, 0, cameraZoom.current)
        return origin
    }, [])

    const intersectObjects: THREE.Object3D[] = []

    const cameraDistance = useRef<number | null>(null)
    const cameraRayDirection = useConst(() => new THREE.Vector3())
    const cameraRayOrigin = useConst(() => new THREE.Vector3())
    const cameraPosition = useConst(() => new THREE.Vector3())
    const cameraLerpingPoint = useConst(() => new THREE.Vector3())
    const cameraRaycaster = useConst(() => new THREE.Raycaster())

    const mouseDown = () => {
        isMouseDown.current = true
    }

    const mouseUp = () => {
        isMouseDown.current = false
    }

    const onMouseMove = (e: MouseEvent) => {
        if (!document.pointerLockElement && !isMouseDown.current) return false

        cameraLookAtTarget.rotation.y -= e.movementX * 0.002 * cameraMovementSpeed
        const vy = pivot.rotation.x + e.movementY * 0.002 * cameraMovementSpeed

        cameraDistance.current = pivot.position.length()

        if (vy >= -0.5 && vy <= 1.5) {
            pivot.rotation.x = vy
            pivot.position.y = -cameraDistance.current * Math.sin(-vy)
            pivot.position.z = -cameraDistance.current * Math.cos(-vy)
        }
    }

    const onMouseWheel = (e: Event) => {
        const vz = cameraZoom.current - (e as WheelEvent).deltaY * 0.002 * cameraZoomSpeed
        const vy = pivot.rotation.x

        if (vz >= maxDistance && vz <= minDistance) {
            cameraZoom.current = vz
            pivot.position.z = cameraZoom.current * Math.cos(-vy)
            pivot.position.y = cameraZoom.current * Math.sin(-vy)
        }

        return false
    }

    const onTouchEnd = (_e: TouchEvent) => {
        previousTouch1.current = null
        previousTouch2.current = null
    }

    const onTouchMove = (e: TouchEvent) => {
        e.preventDefault()
        e.stopImmediatePropagation()

        const touch1 = e.targetTouches[0]
        const touch2 = e.targetTouches[1]

        if (previousTouch1.current && !previousTouch2.current) {
            const touch1MovementX = touch1.pageX - previousTouch1.current.pageX
            const touch1MovementY = touch1.pageY - previousTouch1.current.pageY

            cameraLookAtTarget.rotation.y -= touch1MovementX * 0.005 * cameraMovementSpeed
            const vy = pivot.rotation.x + touch1MovementY * 0.005 * cameraMovementSpeed

            cameraDistance.current = pivot.position.length()

            if (vy >= -0.5 && vy <= 1.5) {
                pivot.rotation.x = vy
                pivot.position.y = -cameraDistance.current * Math.sin(-vy)
                pivot.position.z = -cameraDistance.current * Math.cos(-vy)
            }
        }

        if (previousTouch1.current && previousTouch2.current) {
            const prePinchDis = Math.hypot(
                previousTouch1.current.pageX - previousTouch2.current.pageX,
                previousTouch1.current.pageY - previousTouch2.current.pageY,
            )
            const pinchDis = Math.hypot(e.touches[0].pageX - e.touches[1].pageX, e.touches[0].pageY - e.touches[1].pageY)

            const vz = cameraZoom.current - (prePinchDis - pinchDis) * 0.01 * cameraZoomSpeed
            const vy = pivot.rotation.x

            if (vz >= maxDistance && vz <= minDistance) {
                cameraZoom.current = vz
                pivot.position.z = cameraZoom.current * Math.cos(-vy)
                pivot.position.y = cameraZoom.current * Math.sin(-vy)
            }
        }

        previousTouch1.current = touch1
        previousTouch2.current = touch2
    }

    const traverse = (object: THREE.Object3D) => {
        if (object.userData && object.userData.excludeFromCameraCollision === true) {
            return
        }

        if ((object as THREE.Mesh).isMesh && (object as THREE.Mesh).geometry.type !== 'InstancedBufferGeometry') {
            intersectObjects.push(object)
        }

        object.children.forEach((child) => {
            traverse(child)
        })
    }

    const cameraCollision = (delta: number) => {
        cameraRayOrigin.copy(cameraLookAtTarget.position)
        camera.getWorldPosition(cameraPosition)
        cameraRayDirection.subVectors(cameraPosition, cameraLookAtTarget.position)

        let smallestDistance: number

        cameraRaycaster.set(cameraRayOrigin, cameraRayDirection)
        cameraRaycaster.far = -maxDistance

        const intersects = cameraRaycaster.intersectObjects(intersectObjects)
        if (intersects.length && intersects[0].distance <= -cameraZoom.current) {
            smallestDistance = THREE.MathUtils.clamp(intersects[0].distance * cameraCollisionOffset, minDistance, maxDistance)
        } else {
            smallestDistance = cameraZoom.current
        }

        cameraLerpingPoint.set(
            pivot.position.x,
            smallestDistance * Math.sin(-pivot.rotation.x),
            smallestDistance * Math.cos(-pivot.rotation.x),
        )

        pivot.position.lerp(cameraLerpingPoint, delta * 4)
    }

    useEffect(() => {
        scene.children.forEach((child) => traverse(child))

        pivot.add(camera)

        cameraLookAtTarget.add(pivot)

        gl.domElement.addEventListener('mousedown', mouseDown)
        gl.domElement.addEventListener('mouseup', mouseUp)
        gl.domElement.addEventListener('mousemove', onMouseMove)
        gl.domElement.addEventListener('mousewheel', onMouseWheel)
        gl.domElement.addEventListener('touchend', onTouchEnd)
        gl.domElement.addEventListener('touchmove', onTouchMove, { passive: false })

        return () => {
            gl.domElement.removeEventListener('mousedown', mouseDown)
            gl.domElement.removeEventListener('mouseup', mouseUp)
            gl.domElement.removeEventListener('mousemove', onMouseMove)
            gl.domElement.removeEventListener('mousewheel', onMouseWheel)
            gl.domElement.removeEventListener('touchend', onTouchEnd)
            gl.domElement.removeEventListener('touchmove', onTouchMove)

            pivot.remove(camera)
        }
    })

    const contextValue: ThirdPersonControlsContext = useMemo(
        () => ({
            target: target.current,
        }),
        [],
    )

    return <context.Provider value={contextValue}>{children}</context.Provider>
}
