// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { defaultClientConditions, defaultServerConditions } from 'vite';

export default defineConfig({
	integrations: [
		starlight({
			title: 'Apprêt',
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/withastro/starlight' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
					],
				},
				{
					label: 'Components',
					items: [{ autogenerate: { directory: 'components' } }],
				},
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
