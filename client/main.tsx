import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, isRouteErrorResponse, Link, Navigate, RouterProvider, useParams, useRouteError } from 'react-router-dom'
import './index.css'
import { Room } from './pages/Room'
import { Root } from './pages/Root'

function KeyedRoom() {
	const { roomId } = useParams()
	return <Room key={roomId} />
}

function AppRouteError() {
	const error = useRouteError()
	const message = isRouteErrorResponse(error) && error.status === 404
		? 'That page could not be found.'
		: 'This page could not load.'
	return <main style={{ minHeight: '100vh', display: 'grid', placeContent: 'center', gap: 12, padding: 24, background: '#19191e', color: '#f2f2f5', fontFamily: 'Excalifont, sans-serif', textAlign: 'center' }}>
		<h1 style={{ margin: 0 }}>FreeForm</h1>
		<p style={{ margin: 0, color: '#adadb7' }}>{message}</p>
		<div style={{ display: 'flex', justifyContent: 'center', gap: 12 }}>
			<Link to="/" style={{ color: '#c4beff' }}>Back to dashboard</Link>
			<button type="button" onClick={() => window.location.reload()}>Reload</button>
		</div>
	</main>
}

const router = createBrowserRouter([
	{
		path: '/',
		element: <Root />,
		errorElement: <AppRouteError />,
	},
	{
		path: '/:roomId',
		element: <KeyedRoom />,
		errorElement: <AppRouteError />,
	},
	{
		path: '*',
		element: <Navigate to="/" replace />,
		errorElement: <AppRouteError />,
	},
])

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
	<React.StrictMode>
		<RouterProvider router={router} />
	</React.StrictMode>
)
