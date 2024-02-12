import Jolt from 'jolt-physics'
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import * as THREE from 'three'
import { Layer } from '../constants'
import { useECS, usePhysics } from '../context'
import { Raw } from '../raw'
import { AutoRigidBodyShape, getShapeSettingsFromObject } from '../three-to-jolt'
import { BodyEvents, Vector3Tuple, Vector4Tuple } from '../types'
import { vec3 } from '../utils'

const tmpEuler = new THREE.Euler()
const tmpQuat = new THREE.Quaternion()

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
    ({ children, shape: shapeType = 'box', onContactAdded, onContactPersisted, onContactRemoved, ...props }, ref) => {
        const groupRef = useRef<THREE.Group>(null!)

        const [body, setBody] = useState<Jolt.Body>()
        useImperativeHandle(ref, () => body!, [body])

        const { world } = useECS()
        const { bodyInterface } = usePhysics()

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
                const autoShapeSettings = getShapeSettingsFromObject(groupRef.current, shapeType)

                if (!autoShapeSettings) {
                    console.info('Could not find any shapes in the <RigidBody>')
                    return
                }

                shapeSettings = autoShapeSettings
            } else {
                const compoundShapeSettings = new Raw.module.StaticCompoundShapeSettings()

                for (const shapeSettings of childShapeSettings.current) {
                    compoundShapeSettings.AddShape(
                        vec3.threeToJolt(shapeSettings.offset ?? new THREE.Vector3()),
                        new Raw.module.Quat(),
                        shapeSettings.shape,
                        0,
                    )
                }

                shapeSettings = compoundShapeSettings
            }

            /* get body props */
            const position = vec3.tupleToJolt(props.position ?? [0, 0, 0])

            let quaternion: Jolt.Quat
            if (props.rotation) {
                const quat = tmpQuat.setFromEuler(tmpEuler.set(...props.rotation))

                quaternion = new jolt.Quat(quat.x, quat.y, quat.z, quat.w)
            } else if (props.quaternion) {
                quaternion = new jolt.Quat(...props.quaternion)
            } else {
                quaternion = new jolt.Quat(0, 0, 0, 1)
            }

            let motionType: number
            switch (props.type) {
                case 'dynamic':
                    motionType = jolt.EMotionType_Dynamic
                    break
                case 'kinematic':
                    motionType = jolt.EMotionType_Kinematic
                    break
                case 'static':
                    motionType = jolt.EMotionType_Static
                    break
                default:
                    motionType = jolt.EMotionType_Dynamic
            }

            /* create body */
            const bodyCreationSettings = new jolt.BodyCreationSettings(
                shapeSettings.Create().Get(),
                position,
                quaternion,
                motionType,
                Layer.MOVING,
            )

            const body = bodyInterface.CreateBody(bodyCreationSettings)

            const entity = world.create({ body, bodyEvents: bodyEvents.current, three: groupRef.current })

            setBody(body)

            return () => {
                setBody(undefined!)

                world.destroy(entity)
            }
        }, [])

        return (
            <rigidBodyContext.Provider value={{ addShapeSettings, removeShapeSettings }}>
                <group ref={groupRef}>{children}</group>
            </rigidBodyContext.Provider>
        )
    },
)
