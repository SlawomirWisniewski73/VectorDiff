import React, { useEffect, useRef } from 'react';
import { ThreeRenderer } from '@vectordiff/visualization';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const renderer = new ThreeRenderer({ container: containerRef.current });
      console.log('Molecular viewer renderer initialized', renderer.camera);
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
