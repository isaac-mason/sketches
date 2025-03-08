import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterOutlet } from './router'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <RouterOutlet />
    </React.StrictMode>,
)
