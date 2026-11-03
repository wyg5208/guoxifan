import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App'
import { PageLoading } from './components/ui/Display'
import { Toaster } from './components/ui/Toaster'
import { useAuth } from './store/auth'

import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

// 刷新页面后先用本地 refresh token 续一次会话，避免受保护页面闪一下登录页
void useAuth.getState().restore()

const container = document.getElementById('root')
if (!container) throw new Error('找不到 #root 挂载点')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoading />}>
          <App />
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
