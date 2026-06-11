import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      'docs/package/**',
      'pnpm-lock.yaml',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs,js}'],
    rules: {
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  },
  {
    files: ['packages/domain/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'fs',
                'fs/*',
                'path',
                'http',
                'https',
                'pg',
                'pg-*',
                'axios',
                'undici',
                '@nestjs/*',
                'next',
                'next/*',
                'react',
                'react/*',
              ],
              message:
                'packages/domain is pure TypeScript: no IO, framework, or network imports.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'process', message: 'packages/domain must not read process.env.' },
        { name: 'fetch', message: 'packages/domain must not perform network IO.' },
      ],
    },
  },
  {
    files: ['apps/api/src/**/*.{ts,tsx}', 'apps/web/src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@amic-vault/ai',
              message: 'R6 AI Governance Gate before apps may import packages/ai.',
            },
          ],
        },
      ],
    },
  },
];
