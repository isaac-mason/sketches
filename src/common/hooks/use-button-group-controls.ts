import { button, useControls } from 'leva'
import { ButtonInput } from 'leva/dist/declarations/src/types'

export type ButtonGroupControlsParams = {
    options: { name: string; value: string }[]
    current: string
    onChange: (value: string) => void
    hidden?: boolean
}

export const useButtonGroupControls = (name: string, { options, current, onChange, hidden }: ButtonGroupControlsParams) => {
    return useControls(
        name,
        () =>
            hidden
                ? {}
                : options.reduce<Record<string, ButtonInput>>((tools, t) => {
                      tools[t.name] = button(
                          () => {
                              onChange(t.value)
                          },
                          {
                              disabled: t.value === current,
                          },
                      )
                      return tools
                  }, {}),
        [current, options, hidden],
    )
}
