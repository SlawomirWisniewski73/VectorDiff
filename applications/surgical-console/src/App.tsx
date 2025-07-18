import React, { useEffect, useRef } from 'react';
import { SurgicalRenderer } from '@vectordiff/surgical';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const renderer = new SurgicalRenderer({ container: containerRef.current });
      console.log('Surgical console renderer initialized', renderer.camera);
    }
  }, []);

  return (
    <div className="App">
      <h1>Surgical Console</h1>
      <div ref={containerRef} style={{ width: '800px', height: '600px', border: '1px solid black' }} />
    </div>
  );
}

export default App;
