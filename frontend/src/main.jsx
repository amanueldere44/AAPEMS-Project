import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import ConfirmDialogHost from './components/ConfirmDialogHost.jsx';
import { ThemeProvider } from './theme/ThemeProvider.jsx';

import './styles/index.css';
import './styles/theme.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <App />
        <ConfirmDialogHost />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
);