import { useEffect, useRef } from 'react'

export const useMutableCallback = <T>(fn: T) => {
    const ref = useRef<T>(fn)

    useEffect(() => {
        ref.current = fn
    }, [fn])

    return ref
}
