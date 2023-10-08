import { useMutableCallback } from './use-mutable-callback'
import { useEffect, useRef } from 'react'

export const useInterval = (fn: () => void, interval: number) => {
    const ref = useMutableCallback(fn)

    useEffect(() => {
        const id = setInterval(() => ref.current(), interval)

        return () => clearInterval(id)
    }, [fn])
}
