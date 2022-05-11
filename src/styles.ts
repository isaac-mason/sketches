import styled, { createGlobalStyle } from 'styled-components'

export const PageStyle = styled.div`
    position: relative;
    width: 100%;
    height: 100vh;

    & > h1 {
        font-weight: 900;
        font-size: 5em;
        margin: 0;
        color: white;
        line-height: 1.2;
        letter-spacing: -2px;
    }

    @media only screen and (max-width: 1000px) {
        & > h1 {
            font-size: 3em;
            letter-spacing: -1px;
        }
    }

    & > a {
        margin: 0;
        color: white;
        text-decoration: none;
    }
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
