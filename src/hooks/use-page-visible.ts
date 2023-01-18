import { useEffect, useState } from 'react'

const VISIBILITY_CHANGE_EVENT = 'visibilitychange'
const VISIBLE_STATE = 'visible'

export const usePageVisible = () => {
    const [visible, setVisible] = useState(true)

    useEffect(() => {
        const onPageVisibilityChange = () => {
            if (document.visibilityState === VISIBLE_STATE) {
                requestAnimationFrame(() => setVisible(true))
            } else {
                setVisible(false)
            }
        }

        document.addEventListener(
            VISIBILITY_CHANGE_EVENT,
            onPageVisibilityChange
        )

        return () => {
            document.removeEventListener(
                VISIBILITY_CHANGE_EVENT,
                onPageVisibilityChange
            )
        }
    }, [])

    return visible
}
