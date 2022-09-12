import { up } from "styled-breakpoints"
import styled, { createGlobalStyle } from "styled-components"

export const Page = styled.div`
    position: relative;
    width: 100%;
    height: 100vh;
    padding: 0px;

    & > h1 {
        position: absolute;
        top: 20px;
        left: 20px;

        font-weight: 900;
        font-size: 2em;
        margin: 0;
        padding-right: 0.2em;
        color: #eee;
        line-height: 1.2;
        letter-spacing: -2px;

        ${up('md')} {
            top: 70px;
            left: 60px;

            font-size: 4em;
        }

        ${up('lg')} {
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

        ${up('md')} {
            bottom: 60px;
            right: 60px;
        }
    }
`

export const TooltipTrigger = styled.div`
    cursor: pointer;
`

export const TooltipContent = styled.div`
    position: absolute;
    top: calc(100% - 60px);
    left: 30px;

    z-index: 999;
    border-radius: 0.2em;
    transition: visibility 0.2s, color 0.2s, background-color 0.2s, width 0.2s,
        padding 0.2s ease-in-out;
    visibility: hidden;
    color: transparent;
    background-color: transparent;
    white-space: nowrap;
`

export const TooltipContainer = styled.div`
    display: inline-block;
    position: relative;
    & ${TooltipTrigger}:hover + ${TooltipContent} {
        visibility: visible;
        color: #eee;
        background-color: #111;
        padding: 10px;
    }
`

export const SketchPanel = styled.div`
    position: absolute;
    max-width: 250px;
    bottom: 10px;
    left: 10px;

    ${up('md')} {
        bottom: 50px;
        left: 50px;
    }
`

export const Dot = styled.div`
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    margin: 8px;
`

export const GlobalStyle = createGlobalStyle`
  * {
    box-sizing: border-box;
  }

  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    -khtml-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
    user-select: none;
    overflow: hidden;
  }

  #root {
    overflow: auto;
  }

  body {
    position: fixed;
    overflow: hidden;
    overscroll-behavior-y: none;
    font-family: 'Poppins', sans-serif;
    color: black;
    background: #222;
  }
`