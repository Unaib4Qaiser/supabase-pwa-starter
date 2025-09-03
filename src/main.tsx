import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App'

// Lazy load pages
const Home = lazy(() => import('./pages/Home'))
const Auth = lazy(() => import('./pages/Auth'))

// Loading component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[200px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
  </div>
)

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { 
        index: true, 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        )
      },
      { 
        path: 'auth', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Auth />
          </Suspense>
        )
      },
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
)
