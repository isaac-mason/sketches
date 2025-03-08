import React from 'react'

export const Spinner = () => (
    <div
        style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
            width: '100%',
        }}
    >
        <div
            style={{
                width: '50px',
                height: '50px',
                border: '3px solid rgba(0, 0, 0, 0)',
                borderTop: '3px solid #fff',
                borderRadius: '50%',
                animation: 'spin 1s ease infinite',
            }}
        />
        <style>
            {`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}
        </style>
    </div>
)
