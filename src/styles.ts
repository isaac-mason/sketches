import { Link } from 'react-router-dom'
import styled, { createGlobalStyle } from 'styled-components'
import { createStyledBreakpointsTheme } from 'styled-breakpoints'

export const theme = createStyledBreakpointsTheme()

export const Page = styled.div`
    position: relative;
    z-index: 0;
    width: 100%;
    height: 100%;
    padding: 0px;

    & > h1 {
        position: absolute;
        z-index: 1;
        top: 20px;
        left: 20px;

        margin: 0;
        padding-right: 0.2em;

        font-size: 2em;
        font-weight: 900;
        line-height: 1.2;
        letter-spacing: -2px;

        color: #eee;

        ${({ theme }) => theme.breakpoints.up('md')} {
            top: 70px;
            left: 60px;

            font-size: 4em;
        }

        ${({ theme }) => theme.breakpoints.up('lg')} {
            font-size: 5em;
        }
    }

    & > a {
        position: absolute;
        bottom: 20px;
        right: 20px;
        font-size: 1.2em;
        margin: 0;
        color: #eee;
        text-decoration: none;

        ${({ theme }) => theme.breakpoints.up('md')} {
            bottom: 60px;
            right: 60px;
        }
    }
`

export const ScreenshotDisplayModeStyles = createGlobalStyle`
  h1 {
    display: none;
  }
`

const ResetButton = styled.button`
    border: none;
    margin: 0;
    padding: 0;
    width: auto;
    overflow: visible;

    background: transparent;

    /* inherit color from ancestor */
    color: inherit;

    /* Normalize 'line-height'. Cannot be changed from 'normal' in Firefox 4+. */
    line-height: normal;

    /* Corrects font smoothing for webkit */
    -webkit-font-smoothing: inherit;
    -moz-osx-font-smoothing: inherit;

    /* Corrects inability to style clickable 'input' types in iOS */
    -webkit-appearance: none;

    &::-moz-focus-inner {
        border: 0;
        padding: 0;
    }
`

export const MenuToggle = styled(ResetButton)`
    position: absolute;
    bottom: 10px;
    left: 10px;

    ${({ theme }) => theme.breakpoints.up('md')} {
        bottom: 50px;
        left: 50px;
    }

    color: #fff;
    font-size: 2em;
    cursor: pointer;
    border-radius: 50%;
    width: 1.6em;
    height: 1.6em;
    transition: background 0.2s ease;
    background-color: #000;

    &:hover {
        background-color: #444;
    }
`

export const MenuBackground = styled.div<{ open: boolean }>`
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    transition: background, 0.25s ease;
    z-index: ${(props) => (props.open ? '1' : '-1')};
    background: ${(props) =>
        props.open ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0)'};
`

export const Menu = styled.div<{ open: boolean }>`
    position: absolute;
    top: 0;
    left: 0;
    transition: background, 0.25s ease;
    z-index: 1;

    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: center;
    overflow-y: scroll;
    overflow-x: hidden;
    background-color: #111;

    width: 300px;
    height: 100%;
    gap: 0.5em;
    padding: 1em;

    transition: transform 0.5s ease;
    transform: translateX(${(props) => (props.open ? '0' : '-100%')});

    ${({ theme }) => theme.breakpoints.up('md')} {
        width: 350px;
    }
`

export const MenuItem = styled(Link)`
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
    width: calc(100% - 0.5em);
    margin: 0.5em;
    border-radius: 0.2em;
    text-decoration: none;
    transition: background 0.3s ease, transform 0.5s ease;
    background-color: #333;

    &.active {
        background-color: #444;
    }

    &:hover {
        transform: scale(1.02);
        background-color: #444;
    }
`

export const MenuItemImage = styled.img`
    width: 100%;
    height: 150px;
    object-fit: cover;
    border-radius: 0.2em 0.2em 0 0;
`

export const MenuItemTitle = styled.div`
    font-size: 1em;
    color: #fff;
    padding: 0.5em;
`
