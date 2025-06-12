/**
 * React Component dla odtwarzacza animacji VectorDiff
 * 
 * Ten komponent zapewnia kompletny interfejs użytkownika do:
 * - Odtwarzania animacji
 * - Kontroli czasu
 * - Wyboru renderera (SVG/WebGL)
 * - Eksportu
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { VectorDiffAnimation } from '@vectordiff/core';
import { SVGRenderer } from '../renderers/SVGRenderer';
import { ThreeRenderer } from '../renderers/ThreeRenderer';

export interface VectorDiffPlayerProps {
  animation: VectorDiffAnimation | null;
  width?: number;
  height?: number;
  renderer?: 'svg' | 'webgl';
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  className?: string;
  onTimeUpdate?: (time: number) => void;
  onEnd?: () => void;
  medicalMode?: 'molecular' | 'radiology' | 'surgical';
}

export const VectorDiffPlayer: React.FC<VectorDiffPlayerProps> = ({
  animation,
  width = 800,
  height = 600,
  renderer = 'svg',
  autoPlay = false,
  loop = true,
  controls = true,
  className,
  onTimeUpdate,
  onEnd,
  medicalMode
}) => {
  // Referencje do elementów DOM i rendererów
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<SVGRenderer | ThreeRenderer | null>(null);
  
  // Stan komponentu
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Inicjalizacja renderera
  useEffect(() => {
    if (!containerRef.current || !animation) return;
    
    // Czyszczenie poprzedniego renderera
    if (rendererRef.current) {
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
    
    // Tworzenie nowego renderera
    if (renderer === 'svg') {
      rendererRef.current = new SVGRenderer({
        container: containerRef.current,
        width,
        height,
        enableInteraction: true
      });
    } else {
      rendererRef.current = new ThreeRenderer({
        container: containerRef.current,
        width,
        height,
        enableControls: true,
        enableShadows: true,
        medicalMode
      });
    }
    
    // Ładowanie animacji
    rendererRef.current.loadAnimation(animation);
    setDuration(animation.metadata.duration);
    
    // Auto-play jeśli włączone
    if (autoPlay) {
      rendererRef.current.play();
      setIsPlaying(true);
    }
    
    // Cleanup
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, [animation, renderer, width, height, autoPlay, medicalMode]);
  
  // Aktualizacja czasu
  useEffect(() => {
    if (!rendererRef.current || !isPlaying) return;
    
    const updateTime = () => {
      if (rendererRef.current) {
        const time = rendererRef.current.time;
        setCurrentTime(time);
        
        if (onTimeUpdate) {
          onTimeUpdate(time);
        }
        
        // Sprawdzenie końca animacji
        if (time >= duration && duration > 0) {
          if (!loop) {
            handleStop();
            if (onEnd) {
              onEnd();
            }
          }
        }
      }
    };
    
    const interval = setInterval(updateTime, 50); // 20 FPS dla UI
    
    return () => clearInterval(interval);
  }, [isPlaying, duration, loop, onTimeUpdate, onEnd]);
  
  // Kontrola odtwarzania
  const handlePlay = useCallback(() => {
    if (rendererRef.current && !isPlaying) {
      rendererRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);
  
  const handlePause = useCallback(() => {
    if (rendererRef.current && isPlaying) {
      rendererRef.current.pause();
      setIsPlaying(false);
    }
  }, [isPlaying]);
  
  const handleStop = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.stop();
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, []);
  
  const handleSeek = useCallback((time: number) => {
    if (rendererRef.current) {
      rendererRef.current.seek(time);
      setCurrentTime(time);
    }
  }, []);
  
  // Formatowanie czasu
  const formatTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  // Eksport
  const handleExport = useCallback(() => {
    if (!rendererRef.current) return;
    
    if (renderer === 'svg' && rendererRef.current instanceof SVGRenderer) {
      const svgString = rendererRef.current.exportSVG();
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = 'vectordiff-frame.svg';
      a.click();
      
      URL.revokeObjectURL(url);
    }
    // Dla WebGL można dodać eksport do PNG lub GLTF
  }, [renderer]);
  
  return (
    <div className={`vectordiff-player ${className || ''}`}>
      {/* Kontener renderera */}
      <div 
        ref={containerRef} 
        className="vectordiff-player__canvas"
        style={{ width, height }}
      />
      
      {/* Kontrolki */}
      {controls && animation && (
        <div className="vectordiff-player__controls">
          {/* Przyciski odtwarzania */}
          <div className="vectordiff-player__buttons">
            {!isPlaying ? (
              <button 
                className="vectordiff-player__button play"
                onClick={handlePlay}
                aria-label="Play"
              >
                ▶️
              </button>
            ) : (
              <button 
                className="vectordiff-player__button pause"
                onClick={handlePause}
                aria-label="Pause"
              >
                ⏸️
              </button>
            )}
            
            <button 
              className="vectordiff-player__button stop"
              onClick={handleStop}
              aria-label="Stop"
            >
              ⏹️
            </button>
          </div>
          
          {/* Pasek czasu */}
          <div className="vectordiff-player__timeline">
            <input
              type="range"
              min="0"
              max={duration}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="vectordiff-player__slider"
            />
            <span className="vectordiff-player__time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
          
          {/* Dodatkowe opcje */}
          <div className="vectordiff-player__options">
            <button 
              className="vectordiff-player__button export"
              onClick={handleExport}
              aria-label="Export"
            >
              💾
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Style CSS jako string - można wyeksportować do osobnego pliku
export const vectorDiffPlayerStyles = `
.vectordiff-player {
  display: flex;
  flex-direction: column;
  gap: 10px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.vectordiff-player__canvas {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.vectordiff-player__controls {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 10px;
  background: #f5f5f5;
  border-radius: 4px;
}

.vectordiff-player__buttons {
  display: flex;
  gap: 5px;
}

.vectordiff-player__button {
  width: 36px;
  height: 36px;
  border: none;
  background: #fff;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background-color 0.2s;
}

.vectordiff-player__button:hover {
  background: #e0e0e0;
}

.vectordiff-player__button:active {
  background: #d0d0d0;
}

.vectordiff-player__timeline {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
}

.vectordiff-player__slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: #ddd;
  border-radius: 2px;
  outline: none;
}

.vectordiff-player__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: #007bff;
  border-radius: 50%;
  cursor: pointer;
}

.vectordiff-player__slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: #007bff;
  border-radius: 50%;
  cursor: pointer;
  border: none;
}

.vectordiff-player__time {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.vectordiff-player__options {
  display: flex;
  gap: 5px;
}
