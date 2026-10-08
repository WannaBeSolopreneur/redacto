import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { Landing } from './Landing';

// The landing page loads none of the app: no model, no document code.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Landing />
  </StrictMode>,
);
