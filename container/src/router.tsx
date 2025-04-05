import { Component, type ReactNode } from 'react';
import {
	type RouteObject,
	RouterProvider,
	createBrowserRouter,
	redirect,
} from 'react-router-dom';
import { create } from 'zustand';
import type { SketchMeta } from '../../dev/utils';
import sketchesMetadata from '../generated/sketches.json';
import { App } from './app';

type ErrorBoundaryProps = {
	children: ReactNode;
};

const errorBoundaryState = create<{ error: boolean }>(() => ({
	error: false,
}));

class ErrorBoundary extends Component<ErrorBoundaryProps> {
	static getDerivedStateFromError() {
		return {};
	}

	componentDidCatch(_error: Error, _errorInfo: never) {
		errorBoundaryState.setState({ error: true });
	}

	render() {
		if (errorBoundaryState.getState().error) {
			return (
				<div className="flex h-full w-full items-center justify-center text-white">
					Something went wrong rendering the sketch!
				</div>
			);
		}

		return this.props.children;
	}
}

const routes: RouteObject[] = [
	...sketchesMetadata.map((sketch) => {
		const route: RouteObject = {
			path: `/sketch/${sketch.path}`,
			Component: App,
			loader: async ({ request }) => {
				errorBoundaryState.setState({ error: false });

				const sketchPath = new URL(request.url).pathname.replace(
					'/sketch/',
					'',
				);

				const sketchMetadata = sketchesMetadata.find(
					(s) => s.path === sketchPath,
				)! as SketchMeta;

				const sketchUrl = `/sketches-static/${sketchMetadata.path}/index.html`;

				return {
					sketchPath,
					sketchMetadata,
					sketchUrl,
				};
			},
		};
		return route;
	}),
	{
		path: '*',
		element: null,
		loader: async () => {
			return redirect('/sketch/intro');
		},
	},
];

const router = createBrowserRouter(routes, {});

export const RouterOutlet = () => {
	return (
		<ErrorBoundary>
			<RouterProvider router={router} />
		</ErrorBoundary>
	);
};
