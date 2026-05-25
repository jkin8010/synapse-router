import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Synapse Registry URL — set REGISTRY_URL env var for production deployment
// Dev default: http://localhost:3012, Prod: https://synrc.io
const registryUrl = process.env.REGISTRY_URL || 'http://localhost:3012';

const config: Config = {
  title: 'Synapse Router',
  tagline: 'Controlled Schema Negotiation & Multi-Provider Routing for AI Agents',
  favicon: 'img/favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future

  // Set the production url of your site here
  url: 'https://synapse-router.com',
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'useeclaw', // Usually your GitHub org/user name.
  projectName: 'synapse-router', // Usually your repo name.

  onBrokenLinks: 'warn',

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'zh-Hans'],
    localeConfigs: {
      en: {
        label: 'English',
      },
      'zh-Hans': {
        label: '简体中文',
      },
    },
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          routeBasePath: '/docs',
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/useeclaw/synapse-router/edit/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    // Replace with your project's social card
    image: 'img/og-image.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: true,
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Synapse Router',
      logo: {
        alt: 'Synapse Router',
        src: 'img/logo-dark.png',
      },
      items: [
        {
          type: 'doc',
          docId: 'intro',
          label: 'Overview',
          position: 'left',
        },
        {
          type: 'doc',
          docId: 'cli/index',
          label: 'CLI Reference',
          position: 'left',
        },
        {
          type: 'doc',
          docId: 'sdk/index',
          label: 'SDK Guide',
          position: 'left',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        },
        {
          href: registryUrl,
          label: 'Registry',
          position: 'right',
        },
        {
          href: 'https://github.com/useeclaw/synapse-router',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Overview',
              to: '/docs/intro',
            },
            {
              label: 'CLI Reference',
              to: '/docs/cli',
            },
            {
              label: 'SDK Guide',
              to: '/docs/sdk',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Registry',
              href: registryUrl,
            },
            {
              label: 'GitHub',
              href: 'https://github.com/useeclaw/synapse-router',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Synapse Router. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
