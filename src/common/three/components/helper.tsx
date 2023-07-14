import { useFrame, useThree } from '@react-three/fiber'
import * as React from 'react'
import { Children, ReactElement, ReactNode, cloneElement, useLayoutEffect, useState } from 'react'
import { Object3D } from 'three'

type HelperObject = Object3D & { update: () => void; dispose: () => void }
type Constructor = new (...args: any[]) => HelperObject
type Rest<T> = T extends [infer _, ...infer R] ? R : never

export type HelperProps<T extends Constructor> = {
  helper: T
  enabled?: boolean
  args?: Rest<ConstructorParameters<T>>
  children: ReactNode
}

export const Helper = <T extends Constructor>({
  helper: helperConstructor,
  args = [] as never,
  children,
  enabled = true,
}: HelperProps<T>) => {
  const helper = React.useRef<HelperObject>()
  const scene = useThree((state) => state.scene)

  const [childRef, setChildRef] = useState<never>(null!)

  useLayoutEffect(() => {
    if (!enabled || !childRef || !helperConstructor) {
      return
    }

    const currentHelper = new helperConstructor(childRef, ...args)

    helper.current = currentHelper

    currentHelper.traverse((child) => (child.raycast = () => null))

    scene.add(currentHelper)

    return () => {
      helper.current = undefined
      scene.remove(currentHelper)
      currentHelper.dispose?.()
    }
  }, [scene, helperConstructor, childRef, enabled, ...args])

  useFrame(() => void helper.current?.update?.())

  if (children) {
    const child = Children.only(children) as ReactElement

    return cloneElement(child, {
      ref: setChildRef,
    })
  }

  return null
}
