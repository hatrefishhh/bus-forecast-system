import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/chivo-mono/400.css';
import '@fontsource/chivo-mono/500.css';
import '@fontsource/chivo-mono/800.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/infotip.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
