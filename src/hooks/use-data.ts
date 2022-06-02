import { useEffect, useRef } from 'react'

export const useData = <T>(fn: () => T, deps: unknown[] = []) => {
    const data = useRef<T>()
    const first = useRef(true)

    useEffect(() => {
        if (!first.current) {
            data.current = fn()
        }
    }, deps)

    data.current = fn()
    first.current = false

    return data.current
}
