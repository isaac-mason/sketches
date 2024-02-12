import Jolt from 'jolt-physics'
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { Layer } from '../constants'
import { useECS, useJolt } from '../context'
import { Raw } from '../raw'
import { AutoRigidBodyShape, getShapeSettingsFromObject } from '../three-to-jolt'
import { BodyEvents, Vector3Tuple, Vector4Tuple } from '../types'
import { vec3 } from '../utils'
import { _euler, _quaternion } from '../tmp'

export type RigidBodyProps = {
    position?: Vector3Tuple
    rotation?: Vector3Tuple
    quaternion?: Vector4Tuple
    children: React.ReactNode
    type?: 'dynamic' | 'kinematic' | 'static'
    shape?: AutoRigidBodyShape
} & BodyEvents

type ShapeSettings = {
    shape: Jolt.ShapeSettings
    offset?: THREE.Vector3
}

const rigidBodyContext = createContext<{
    addShapeSettings: (shape: ShapeSettings) => void
    removeShapeSettings: (shape: ShapeSettings) => void
}>(null!)

export const useRigidBody = () => {
    return useContext(rigidBodyContext)
}

export const RigidBody = forwardRef<Jolt.Body, RigidBodyProps>(
    (
        {
            children,
            position,
            rotation,
            quaternion,
            type: motionType,
            shape: shapeType = 'box',
            onContactAdded,
            onContactPersisted,
            onContactRemoved,
        },
        ref,
    ) => {
        const objectRef = useRef<THREE.Object3D>(null!)

        const [body, setBody] = useState<Jolt.Body>()
        useImperativeHandle(ref, () => body!, [body])

        const { world } = useECS()
        const { bodyInterface } = useJolt()

        const childShapeSettings = useRef<ShapeSettings[]>([])

        const addShapeSettings = (shapeSettings: ShapeSettings) => {
            childShapeSettings.current.push(shapeSettings)
        }

        const removeShapeSettings = (shapeSettings: ShapeSettings) => {
            const index = childShapeSettings.current.indexOf(shapeSettings)

            if (index !== -1) {
                childShapeSettings.current.splice(index, 1)
            }
        }

        const bodyEvents = useRef<BodyEvents>({})

        useEffect(() => {
            bodyEvents.current.onContactAdded = onContactAdded
            bodyEvents.current.onContactPersisted = onContactPersisted
            bodyEvents.current.onContactRemoved = onContactRemoved
        }, [onContactAdded, onContactPersisted, onContactRemoved])

        useEffect(() => {
            const jolt = Raw.module

            /* get shape settings */
            let shapeSettings: Jolt.ShapeSettings

            if (shapeType && childShapeSettings.current.length === 0) {
                // auto shape
                const autoShapeSettings = getShapeSettingsFromObject(objectRef.current, shapeType)

                if (!autoShapeSettings) {
                    console.info('Could not find any shapes in the <RigidBody>')
                    return
                }

                shapeSettings = autoShapeSettings
            } else {
                // create compound shape of child shapes
                // todo: performance implications for always creating a compound shape even for single shapes?
                const compoundShapeSettings = new Raw.module.StaticCompoundShapeSettings()

                for (const shapeSettings of childShapeSettings.current) {
                    const offset = vec3.threeToJolt(shapeSettings.offset ?? new THREE.Vector3())
                    const quat = new Raw.module.Quat()

                    compoundShapeSettings.AddShape(offset, quat, shapeSettings.shape, 0)

                    jolt.destroy(offset)
                    jolt.destroy(quat)
                }

                shapeSettings = compoundShapeSettings
            }

            /* get body props */
            const bodyPosition = vec3.tupleToJolt(position ?? [0, 0, 0])

            let bodyQuaternion: Jolt.Quat
            if (rotation) {
                const quat = _quaternion.setFromEuler(_euler.set(...rotation))

                bodyQuaternion = new jolt.Quat(quat.x, quat.y, quat.z, quat.w)
            } else if (quaternion) {
                bodyQuaternion = new jolt.Quat(...quaternion)
            } else {
                bodyQuaternion = new jolt.Quat(0, 0, 0, 1)
            }

            let bodyMotionType: number
            switch (motionType) {
                case 'dynamic':
                    bodyMotionType = jolt.EMotionType_Dynamic
                    break
                case 'kinematic':
                    bodyMotionType = jolt.EMotionType_Kinematic
                    break
                case 'static':
                    bodyMotionType = jolt.EMotionType_Static
                    break
                default:
                    bodyMotionType = jolt.EMotionType_Dynamic
            }

            const bodyLayer = motionType === 'static' ? Layer.NON_MOVING : Layer.MOVING

            /* create body */
            const bodyCreationSettings = new jolt.BodyCreationSettings(
                shapeSettings.Create().Get(),
                bodyPosition,
                bodyQuaternion,
                bodyMotionType,
                bodyLayer,
            )

            const body = bodyInterface.CreateBody(bodyCreationSettings)

            /* clean up */
            jolt.destroy(shapeSettings)
            jolt.destroy(bodyPosition)
            jolt.destroy(bodyQuaternion)
            jolt.destroy(bodyCreationSettings)

            const entity = world.create({ body, bodyEvents: bodyEvents.current, three: objectRef.current })

            setBody(body)

            return () => {
                setBody(undefined!)

                world.destroy(entity)
            }
        }, [])

        return (
            <rigidBodyContext.Provider value={{ addShapeSettings, removeShapeSettings }}>
                <object3D ref={objectRef} position={position} rotation={rotation} quaternion={quaternion}>
                    {children}
                </object3D>
            </rigidBodyContext.Provider>
        )
    },
)
