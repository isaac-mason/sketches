import { DynamicRayCastVehicleController } from '@dimforge/rapier3d-compat'
import { RapierRigidBody, useAfterPhysicsStep, useRapier } from '@react-three/rapier'
import { RefObject, useEffect, useRef } from 'react'
import * as THREE from 'three'

const up = new THREE.Vector3(0, 1, 0)

const _wheelSteeringQuat = new THREE.Quaternion()
const _wheelRotationQuat = new THREE.Quaternion()

export type WheelInfo = {
    axleCs: THREE.Vector3
    suspensionRestLength: number
    suspensionStiffness: number
    maxSuspensionTravel: number
    position: THREE.Vector3
    radius: number
}

export const useVehicleController = (
    chassisRef: RefObject<RapierRigidBody>,
    wheelsRef: RefObject<THREE.Object3D[]>,
    wheelsInfo: WheelInfo[],
) => {
    const { world } = useRapier()

    const vehicleController = useRef<DynamicRayCastVehicleController>()

    useEffect(() => {
        const { current: chassis } = chassisRef
        const { current: wheels } = wheelsRef

        if (!chassis || !wheels) return

        const vehicle = world.createVehicleController(chassis)

        const suspensionDirection = new THREE.Vector3(0, -1, 0)

        wheelsInfo.forEach((wheel) => {
            vehicle.addWheel(wheel.position, suspensionDirection, wheel.axleCs, wheel.suspensionRestLength, wheel.radius)
        })

        wheelsInfo.forEach((wheel, index) => {
            vehicle.setWheelSuspensionStiffness(index, wheel.suspensionStiffness)
            vehicle.setWheelMaxSuspensionTravel(index, wheel.maxSuspensionTravel)
        })

        vehicleController.current = vehicle

        return () => {
            vehicleController.current = undefined
            world.removeVehicleController(vehicle)
        }
    }, [])

    useAfterPhysicsStep((world) => {
        if (!vehicleController.current) return

        const controller = vehicleController.current

        controller.updateVehicle(world.timestep)

        const { current: wheels } = wheelsRef

        wheels?.forEach((wheel, index) => {
            const wheelAxleCs = controller.wheelAxleCs(index)!
            const connection = controller.wheelChassisConnectionPointCs(index)?.y || 0
            const suspension = controller.wheelSuspensionLength(index) || 0
            const steering = controller.wheelSteering(index) || 0
            const rotationRad = controller.wheelRotation(index) || 0

            wheel.position.y = connection - suspension

            _wheelSteeringQuat.setFromAxisAngle(up, steering)
            _wheelRotationQuat.setFromAxisAngle(wheelAxleCs, rotationRad)

            wheel.quaternion.multiplyQuaternions(_wheelSteeringQuat, _wheelRotationQuat)
        })
    })

    return {
        vehicleController,
    }
}
