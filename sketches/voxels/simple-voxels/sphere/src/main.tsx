import React from 'react'
import ReactDOM from 'react-dom/client'
import { Sketch } from './sketch'

console.log('crossOriginIsolated', crossOriginIsolated)

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Sketch />
    </React.StrictMode>,
)
