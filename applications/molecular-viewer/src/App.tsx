import React, { useEffect, useRef } from 'react';
import { VectorDiffAnimation } from '@vectordiff/core';
import { ThreeRenderer } from '@vectordiff/visualization'; // Poprawny import

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      // Przykład użycia renderera
      const renderer = new ThreeRenderer({ container: containerRef.current });
      // renderer.camera.position.set(0, 0, 100); // Mamy dostęp do kamery
      console.log('Molecular viewer renderer initialized');
    }
  }, []);

  return (
    <div className="App">
      <h1>Molecular Viewer</h1>
      <div ref={containerRef} style={{ width: '800px', height: '600px', border: '1px solid black' }} />
    </div>
  );
}

export default App; 
