import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { jsx } from 'react/jsx-runtime'
import plugin from '../../desktop/plugin.js'
import { fixtureTransport } from './fixtures.mjs'
import { applyDemoTheme } from 'demo-theme'

const contributions = []
window.demoCalls = []
plugin.register({
  registerMany: items => contributions.push(...items),
  onDispose() {},
  rest: async (path, options) => {
    window.demoCalls.push({ path, method: options?.method })
    return fixtureTransport(path)
  },
})
const params = new URLSearchParams(location.search)
applyDemoTheme(params.get('theme') || 'dark')
const contribution = contributions.find(item => item.id === (params.get('pane') ? 'memory' : 'page'))
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } })
createRoot(document.getElementById('root')).render(jsx(QueryClientProvider, { client, children: contribution.render() }))
