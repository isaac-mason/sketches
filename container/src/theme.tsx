import { ReactNode } from 'react'
import { createStyledBreakpointsTheme } from 'styled-breakpoints'
import { ThemeProvider } from 'styled-components'

const theme = createStyledBreakpointsTheme()

type ThemeProps = {
    children: ReactNode
}

export const Theme = ({ children }: ThemeProps) => {
    return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
