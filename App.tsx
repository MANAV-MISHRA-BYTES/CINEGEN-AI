import React from 'react';
import { MovieCreator } from './components/MovieCreator';

function App() {
  return (
    <div className="min-h-screen w-full bg-[#09090b] text-white">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="relative z-10">
        <MovieCreator />
      </div>
    </div>
  );
}

export default App;