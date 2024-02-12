import Jolt from 'jolt-physics'
import { BufferGeometry, Mesh, Object3D, Vector3 } from 'three'
import { Raw } from './raw'
import { vec3 } from './utils'

export type AutoRigidBodyShape = 'box' | 'sphere' | false

export const getShapeSettingsFromObject = (object: Object3D, colliders: AutoRigidBodyShape) => {
    const shapes: { shapeSettings: Jolt.ShapeSettings; offset: Vector3 }[] = []

    object.traverse((child) => {
        if (child instanceof Object3D) {
            const geometry = (child as Mesh)?.geometry

            if (geometry) {
                const shape = getShapeSettingsFromGeometry(geometry, colliders)

                if (shape) {
                    shapes.push(shape)
                }
            }
        }
    })

    if (shapes.length === 0) {
        return undefined
    }

    const compoundShapeSettings = new Raw.module.StaticCompoundShapeSettings()

    for (const { shapeSettings, offset } of shapes) {
        const position = vec3.threeToJolt(offset)
        const quat = new Raw.module.Quat()

        compoundShapeSettings.AddShape(position, quat, shapeSettings, 0)

        Raw.module.destroy(position)
        Raw.module.destroy(quat)
    }

    return compoundShapeSettings
}

export const getShapeSettingsFromGeometry = (
    geometry: BufferGeometry,
    shape: AutoRigidBodyShape,
): { shapeSettings: Jolt.ShapeSettings; offset: Vector3 } | undefined => {
    const jolt = Raw.module

    switch (shape) {
        case 'box': {
            geometry.computeBoundingBox()
            const { boundingBox } = geometry

            const size = boundingBox!.getSize(new Vector3())

            const shapeSize = new jolt.Vec3(size.x / 2, size.y / 2, size.z / 2)
            const shapeSettings = new jolt.BoxShapeSettings(shapeSize)
            jolt.destroy(shapeSize)

            return {
                shapeSettings,
                offset: boundingBox!.getCenter(new Vector3()),
            }
        }

        case 'sphere': {
            geometry.computeBoundingSphere()
            const { boundingSphere } = geometry

            const radius = boundingSphere!.radius

            const shapeSettings = new jolt.SphereShapeSettings(radius)

            return {
                shapeSettings,
                offset: boundingSphere!.center,
            }
        }

        // todo: other shapes
    }

    return undefined
}
