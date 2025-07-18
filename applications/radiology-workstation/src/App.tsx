import React, { useEffect, useRef } from 'react';
import { MedicalImageRenderer } from '@vectordiff/radiology';

function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      const renderer = new MedicalImageRenderer({ container: containerRef.current });
      renderer.camera.position.set(0, 0, 300); // Dostęp do kamery jest poprawny
      console.log('Radiology workstation renderer initialized');
    }
  }, []);

  return (
    <div className="App">
      <h1>Radiology Workstation</h1>
      <div ref={containerRef} style={{ width: '800px', height: '600px', border: '1px solid black' }} />
    </div>
  );
}

export default App;
