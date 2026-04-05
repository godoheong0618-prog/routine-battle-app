import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './components/AuthProvider';
import { LanguageProvider } from './i18n/LanguageContext';
import './index.css';

// This is the entry point of the React application. It renders the App component
// inside the root div. BrowserRouter provides client‑side routing.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <LanguageProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </LanguageProvider>
    </AuthProvider>
  </React.StrictMode>
);
