import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import Home from './pages/Home';
import Upload from './pages/Upload';
import SignIn from './pages/SignIn';
import Decks from './pages/Decks';
import Pricing from './pages/Pricing';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      { path: '/upload', element: <Upload /> },
      { path: '/sign-in', element: <SignIn /> },
      { path: '/decks', element: <Decks /> },
      { path: '/pricing', element: <Pricing /> }
    ]
  }
]);

const container = document.getElementById('root')!;
const root = createRoot(container);
root.render(<RouterProvider router={router} />);
