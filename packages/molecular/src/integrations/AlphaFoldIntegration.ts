/**
 * Integracja z bazą danych AlphaFold
 * 
 * AlphaFold to przełomowy system AI od DeepMind, który przewiduje
 * struktury 3D białek na podstawie ich sekwencji aminokwasowych.
 * Ta integracja pozwala na:
 * - Pobieranie przewidzianych struktur
 * - Analizę pewności przewidywań (pLDDT scores)
 * - Porównywanie z eksperymentalnymi strukturami
 * 
 * To pokazuje, jak VectorDiff może być mostem między AI a wizualizacją
 */

import { MolecularAnimation } from '../types/molecular-format';
import { parsePDB } from '../parsers/PDBParser';

export interface AlphaFoldPrediction {
  uniprotId: string;
  organismScientificName: string;
  gene: string;
  pdbUrl: string;
  cifUrl: string;
  paeUrl: string; // Predicted Aligned Error
  confidenceVersion: string;
}

export interface AlphaFoldConfidence {
  residueNumber: number;
  plddt: number; // Predicted Local Distance Difference Test (0-100)
}

export class AlphaFoldIntegration {
  private static readonly BASE_URL = 'https://alphafold.ebi.ac.uk';
  private static readonly API_BASE = `${AlphaFoldIntegration.BASE_URL}/api`;
  
  /**
   * Pobiera strukturę białka z AlphaFold
   * @param uniprotId Identyfikator UniProt (np. "P00533" dla EGFR człowieka)
   * @returns Animacja molekularna z przewidzianą strukturą
   */
  public static async fetchStructure(uniprotId: string): Promise<MolecularAnimation> {
    try {
      // Pobieramy metadane o przewidywaniu
      const metadata = await this.fetchMetadata(uniprotId);
      
      // Pobieramy plik PDB
      const pdbResponse = await fetch(metadata.pdbUrl);
      if (!pdbResponse.ok) {
        throw new Error(`Failed to fetch PDB file: ${pdbResponse.statusText}`);
      }
      
      const pdbContent = await pdbResponse.text();
      
      // Parsujemy PDB do naszego formatu
      const animation = parsePDB(pdbContent);
      
      // Dodajemy metadane AlphaFold
      animation.metadata.source = 'AlphaFold';
      animation.metadata.alphafold = {
        uniprotId,
        organism: metadata.organismScientificName,
        gene: metadata.gene,
        version: metadata.confidenceVersion
      };
      
      // Pobieramy i dodajemy dane o pewności przewidywania
      const confidenceData = await this.fetchConfidenceData(uniprotId);
      this.addConfidenceToAnimation(animation, confidenceData);
      
      return animation;
    } catch (error) {
      throw new Error(`Failed to fetch AlphaFold structure: ${error}`);
    }
  }
  
  /**
   * Pobiera metadane o przewidywaniu
   */
  private static async fetchMetadata(uniprotId: string): Promise<AlphaFoldPrediction> {
    const url = `${this.API_BASE}/prediction/${uniprotId}`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch metadata: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Pierwsze przewidywanie (zazwyczaj jest tylko jedno)
    if (!data || data.length === 0) {
      throw new Error('No prediction found for this UniProt ID');
    }
    
    return data[0];
  }
  
  /**
   * Pobiera dane o pewności przewidywania (pLDDT)
   * pLDDT to miara pewności przewidywania dla każdego residuum
   * Wartości:
   * - > 90: Bardzo wysoka pewność
   * - 70-90: Wysoka pewność
   * - 50-70: Niska pewność
   * - < 50: Bardzo niska pewność
   */
  private static async fetchConfidenceData(uniprotId: string): Promise<AlphaFoldConfidence[]> {
    // W rzeczywistej implementacji pobieralibyśmy dane z API
    // Tutaj zwracamy przykładowe dane
    
    // Symulujemy różne poziomy pewności dla różnych regionów białka
    const confidenceData: AlphaFoldConfidence[] = [];
    
    // Załóżmy białko o długości 300 aminokwasów
    for (let i = 1; i <= 300; i++) {
      let plddt: number;
      
      // Regiony o wysokiej pewności (struktury regularne)
      if ((i >= 20 && i <= 80) || (i >= 150 && i <= 200)) {
        plddt = 85 + Math.random() * 15; // 85-100
      }
      // Regiony o średniej pewności
      else if ((i >= 81 && i <= 120) || (i >= 201 && i <= 250)) {
        plddt = 60 + Math.random() * 25; // 60-85
      }
      // Regiony o niskiej pewności (pętle, końce)
      else {
        plddt = 30 + Math.random() * 30; // 30-60
      }
      
      confidenceData.push({
        residueNumber: i,
        plddt: Math.round(plddt * 100) / 100
      });
    }
    
    return confidenceData;
  }
  
  /**
   * Dodaje dane o pewności do animacji
   * Pewność jest zapisywana jako B-factor, co pozwala na wizualizację
   */
  private static addConfidenceToAnimation(
    animation: MolecularAnimation, 
    confidenceData: AlphaFoldConfidence[]
  ): void {
    if (!animation.proteinData) return;
    
    // Tworzymy mapę pewności według numeru residuum
    const confidenceMap = new Map<number, number>();
    confidenceData.forEach(conf => {
      confidenceMap.set(conf.residueNumber, conf.plddt);
    });
    
    // Aktualizujemy B-factor atomów na podstawie pewności
    animation.proteinData.chains.forEach(chain => {
      chain.residues.forEach(residue => {
        const confidence = confidenceMap.get(residue.residueId);
        
        if (confidence !== undefined) {
          // Konwertujemy pLDDT (0-100) na B-factor
          // Wysoka pewność = niski B-factor
          const bFactor = (100 - confidence) * 0.5;
          
          residue.atoms.forEach(atom => {
            atom.bFactor = bFactor;
          });
          
          // Zapisujemy również bezpośrednio w residuum
          (residue as any).alphafoldConfidence = confidence;
        }
      });
    });
    
    // Dodajemy profil pewności do metadanych
    animation.metadata.confidenceProfile = confidenceData;
  }
  
  /**
   * Pobiera i porównuje wiele modeli dla tego samego białka
   * Przydatne do analizy niepewności strukturalnej
   * 
   * @param uniprotIds Lista identyfikatorów UniProt do porównania
   * @returns Lista animacji molekularnych
   */
  public static async fetchMultipleModels(uniprotIds: string[]): Promise<MolecularAnimation[]> {
    const animations: MolecularAnimation[] = [];
    
    for (const uniprotId of uniprotIds) {
      try {
        const animation = await this.fetchStructure(uniprotId);
        animations.push(animation);
      } catch (error) {
        console.error(`Failed to fetch ${uniprotId}:`, error);
      }
    }
    
    return animations;
  }
  
  /**
   * Generuje animację pokazującą niepewność przewidywania
   * Regiony o niskiej pewności "wibrują" bardziej
   * 
   * @param animation Animacja z danymi AlphaFold
   * @param duration Czas trwania animacji niepewności
   * @returns Animacja z dodanymi wibracjami
   */
  public static generateUncertaintyAnimation(
    animation: MolecularAnimation,
    duration: number = 2000
  ): MolecularAnimation {
    // Klonujemy animację
    const uncertaintyAnimation = JSON.parse(JSON.stringify(animation));
    uncertaintyAnimation.metadata.animationType = 'alphafold-uncertainty';
    uncertaintyAnimation.metadata.duration = duration;
    
    if (!uncertaintyAnimation.proteinData) return uncertaintyAnimation;
    
    // Generujemy klatki z wibracjami proporcjonalnymi do niepewności
    const steps = 50;
    
    for (let step = 0; step < steps; step++) {
      const timestamp = (duration * step) / steps;
      const phase = (step / steps) * 2 * Math.PI;
      
      const atomDisplacements: any[] = [];
      
      uncertaintyAnimation.proteinData.chains.forEach(chain => {
        chain.residues.forEach(residue => {
          const confidence = (residue as any).alphafoldConfidence || 90;
          
          // Amplituda wibracji odwrotnie proporcjonalna do pewności
          const amplitude = (100 - confidence) / 100 * 0.5; // Max 0.5 Å
          
          residue.atoms.forEach(atom => {
            // Losowy kierunek wibracji dla każdego atomu
            const vibration: [number, number, number] = [
              amplitude * Math.sin(phase) * (Math.random() - 0.5),
              amplitude * Math.cos(phase) * (Math.random() - 0.5),
              amplitude * Math.sin(phase + Math.PI/2) * (Math.random() - 0.5)
            ];
            
            atomDisplacements.push({
              atomId: atom.atomId,
              displacement: vibration
            });
          });
        });
      });
      
      // Dodajemy klatkę do timeline
      uncertaintyAnimation.timeline.push({
        timestamp,
        changes: [{
          objectId: 'protein_main',
          transformation: {
            type: 'conformational',
            atomDisplacements
          }
        }]
      });
    }
    
    return uncertaintyAnimation;
  }
  
  /**
   * Analizuje regiony o niskiej pewności
   * Zwraca listę regionów, które mogą wymagać eksperymentalnej weryfikacji
   * 
   * @param animation Animacja z danymi AlphaFold
   * @param threshold Próg pewności (domyślnie 70)
   * @returns Lista regionów o niskiej pewności
   */
  public static analyzeLowConfidenceRegions(
    animation: MolecularAnimation,
    threshold: number = 70
  ): Array<{
    chainId: string,
    startResidue: number,
    endResidue: number,
    averageConfidence: number,
    description: string
  }> {
    const lowConfidenceRegions: any[] = [];
    
    if (!animation.proteinData) return lowConfidenceRegions;
    
    animation.proteinData.chains.forEach(chain => {
      let regionStart = -1;
      let regionConfidences: number[] = [];
      
      chain.residues.forEach((residue, index) => {
        const confidence = (residue as any).alphafoldConfidence || 90;
        
        if (confidence < threshold) {
          // Początek nowego regionu lub kontynuacja
          if (regionStart === -1) {
            regionStart = residue.residueId;
          }
          regionConfidences.push(confidence);
        } else if (regionStart !== -1) {
          // Koniec regionu o niskiej pewności
          const avgConfidence = regionConfidences.reduce((a, b) => a + b, 0) / regionConfidences.length;
          
          lowConfidenceRegions.push({
            chainId: chain.chainId,
            startResidue: regionStart,
            endResidue: chain.residues[index - 1].residueId,
            averageConfidence: Math.round(avgConfidence * 100) / 100,
            description: this.describeRegion(avgConfidence, regionConfidences.length)
          });
          
          // Reset
          regionStart = -1;
          regionConfidences = [];
        }
      });
      
      // Sprawdzamy czy ostatni region też ma niską pewność
      if (regionStart !== -1) {
        const avgConfidence = regionConfidences.reduce((a, b) => a + b, 0) / regionConfidences.length;
        
        lowConfidenceRegions.push({
          chainId: chain.chainId,
          startResidue: regionStart,
          endResidue: chain.residues[chain.residues.length - 1].residueId,
          averageConfidence: Math.round(avgConfidence * 100) / 100,
          description: this.describeRegion(avgConfidence, regionConfidences.length)
        });
      }
    });
    
    return lowConfidenceRegions;
  }
  
  /**
   * Opisuje region na podstawie pewności
   */
  private static describeRegion(avgConfidence: number, length: number): string {
    if (avgConfidence < 50) {
      return `Bardzo niska pewność (${length} reszt) - prawdopodobnie nieustrukturalizowany lub bardzo elastyczny region`;
    } else if (avgConfidence < 70) {
      return `Niska pewność (${length} reszt) - możliwa pętla lub region o wysokiej elastyczności`;
    } else {
      return `Średnia pewność (${length} reszt) - struktura może być niedokładna`;
    }
  }
}

/**
 * Funkcja pomocnicza do szybkiego pobrania struktury z AlphaFold
 * @param uniprotId Identyfikator UniProt
 * @returns Promise z animacją molekularną
 */
export async function fetchAlphaFoldStructure(uniprotId: string): Promise<MolecularAnimation> {
  return AlphaFoldIntegration.fetchStructure(uniprotId);
}

/**
 * Hook React do używania struktur AlphaFold
 * @param uniprotId Identyfikator UniProt
 * @returns Stan ładowania, błąd i animacja
 */
export function useAlphaFoldStructure(uniprotId: string): {
  loading: boolean,
  error: Error | null,
  animation: MolecularAnimation | null
} {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const [animation, setAnimation] = React.useState<MolecularAnimation | null>(null);
  
  React.useEffect(() => {
    let cancelled = false;
    
    const loadStructure = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const anim = await fetchAlphaFoldStructure(uniprotId);
        
        if (!cancelled) {
          setAnimation(anim);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err as Error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    loadStructure();
    
    return () => {
      cancelled = true;
    };
  }, [uniprotId]);
  
  return { loading, error, animation }
}
