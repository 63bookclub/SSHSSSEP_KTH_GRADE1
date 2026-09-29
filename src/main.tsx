import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Guard against cross-origin script error noise
window.addEventListener('error', (event) => {
  if (event.message === 'Script error.' || !event.message) {
    event.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(<App />);
