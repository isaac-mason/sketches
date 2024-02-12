import { useEffect } from 'react'
import { useRigidBody } from './rigid-body'
import { Raw } from '../raw'

export type BoxShapeProps = {
    args: [halfWidth: number, halfHeight: number, halfDepth: number]
}

export const BoxShape = ({ args }: BoxShapeProps) => {
    const rigidBody = useRigidBody()

    useEffect(() => {
        const jolt = Raw.module

        const shape = new jolt.BoxShapeSettings(new jolt.Vec3(...args))

        const shapeSettings = { shape }

        rigidBody.addShapeSettings(shapeSettings)

        return () => {
            rigidBody.removeShapeSettings(shapeSettings)
        }
    }, [])

    return null
}

export type SphereShapeProps = {
    args: [radius: number]
}

export const SphereShape = ({ args }: SphereShapeProps) => {
    const rigidBody = useRigidBody()

    useEffect(() => {
        const jolt = Raw.module

        const shape = new jolt.SphereShapeSettings(args[0])
        const shapeSettings = { shape }

        rigidBody.addShapeSettings(shapeSettings)

        return () => {
            rigidBody.removeShapeSettings(shapeSettings)
        }
    }, [])

    return null
}
