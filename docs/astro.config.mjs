// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { defaultClientConditions, defaultServerConditions } from 'vite';

export default defineConfig({
	integrations: [
		starlight({
			title: 'Apprêt',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/GuillaumeMMM/appret' }],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Getting started',
					items: [
						{ label: 'Introduction', slug: 'index' },
						'getting-started/installation',
					],
				},
				{
					label: 'Guides',
					items: [
						'guides/shadow-dom',
						'guides/lit',
						'guides/html-first',
						'guides/server-side-rendering',
					],
				},
				{
					label: 'Controllers',
					items: [{ autogenerate: { directory: 'controllers' } }],
				},
				{
					label: 'Elements',
					items: [{ autogenerate: { directory: 'elements' } }],
				},
				'changelog',
			],
		}),
	],
	vite: {
		resolve: {
			conditions: ['appret:source', ...defaultClientConditions],
		},
		ssr: {
			resolve: {
				conditions: ['appret:source', ...defaultServerConditions],
			},
		},
	}
});
