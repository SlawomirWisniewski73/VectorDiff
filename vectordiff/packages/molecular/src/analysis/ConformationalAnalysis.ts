/**
 * System analizy zmian konformacyjnych w białkach
 * 
 * Ten moduł zawiera algorytmy do:
 * - Wykrywania zmian strukturalnych między stanami białka
 * - Obliczania RMSD (Root Mean Square Deviation)
 * - Identyfikacji regionów elastycznych
 * - Generowania animacji przejść konformacyjnych
 * 
 * Kluczowa idea: zamiast animować każdy atom osobno, identyfikujemy
 * ruchy całych domen i grup atomów, co prowadzi do bardziej zwartej
 * reprezentacji i realistycznych animacji.
 */

import { 
  MolecularAnimation,
  AtomData,
  ConformationalChange,
  DomainMotion,
  calculateCenterOfMass
} from '../types/molecular-format';
import { addTransformation } from '@vectordiff/core';

/**
 * Klasa do analizy zmian konformacyjnych
 */
export class ConformationalAnalyzer {
  
  /**
   * Oblicza RMSD między dwoma zestawami atomów
   * RMSD to miara podobieństwa strukturalnego - im mniejsza, tym bardziej podobne struktury
   * 
   * @param atoms1 Pierwszy zestaw atomów
   * @param atoms2 Drugi zestaw atomów
   * @param alignFirst Czy najpierw wyrównać struktury
   * @returns RMSD w angstremach
   */
  public calculateRMSD(
    atoms1: AtomData[], 
    atoms2: AtomData[],
    alignFirst: boolean = true
  ): number {
    if (atoms1.length !== atoms2.length) {
      throw new Error('Atom sets must have the same length for RMSD calculation');
    }
    
    let alignedAtoms1 = atoms1;
    let alignedAtoms2 = atoms2;
    
    if (alignFirst) {
      // Wyrównujemy struktury używając algorytmu Kabscha
      const alignment = this.kabschAlignment(atoms1, atoms2);
      alignedAtoms1 = alignment.aligned1;
      alignedAtoms2 = alignment.aligned2;
    }
    
    // Obliczamy sumę kwadratów odległości
    let sumSquaredDistances = 0;
    
    for (let i = 0; i < alignedAtoms1.length; i++) {
      const dx = alignedAtoms1[i].position[0] - alignedAtoms2[i].position[0];
      const dy = alignedAtoms1[i].position[1] - alignedAtoms2[i].position[1];
      const dz = alignedAtoms1[i].position[2] - alignedAtoms2[i].position[2];
      
      sumSquaredDistances += dx * dx + dy * dy + dz * dz;
    }
    
    return Math.sqrt(sumSquaredDistances / atoms1.length);
  }
  
  /**
   * Algorytm Kabscha do optymalnego wyrównania struktur
   * Znajduje najlepszą rotację i translację minimalizującą RMSD
   * 
   * @param atoms1 Pierwszy zestaw atomów (referencja)
   * @param atoms2 Drugi zestaw atomów (do wyrównania)
   * @returns Wyrównane zestawy atomów i macierz transformacji
   */
  private kabschAlignment(atoms1: AtomData[], atoms2: AtomData[]): {
    aligned1: AtomData[],
    aligned2: AtomData[],
    rotationMatrix: number[][],
    translation: [number, number, number]
  } {
    // Obliczamy centra mas
    const center1 = calculateCenterOfMass(atoms1);
    const center2 = calculateCenterOfMass(atoms2);
    
    // Centrujemy obie struktury
    const centered1 = atoms1.map(atom => ({
      ...atom,
      position: [
        atom.position[0] - center1[0],
        atom.position[1] - center1[1],
        atom.position[2] - center1[2]
      ] as [number, number, number]
    }));
    
    const centered2 = atoms2.map(atom => ({
      ...atom,
      position: [
        atom.position[0] - center2[0],
        atom.position[1] - center2[1],
        atom.position[2] - center2[2]
      ] as [number, number, number]
    }));
    
    // Budujemy macierz kowariancji
    const covariance = this.buildCovarianceMatrix(centered1, centered2);
    
    // SVD (Singular Value Decomposition) - uproszczona implementacja
    // W rzeczywistej implementacji użylibyśmy biblioteki numerycznej
    const svd = this.simpleSVD(covariance);
    
    // Obliczamy macierz rotacji
    const rotationMatrix = this.calculateRotationMatrix(svd);
    
    // Aplikujemy rotację do drugiego zestawu
    const rotated2 = centered2.map(atom => {
      const rotated = this.rotatePoint(atom.position, rotationMatrix);
      return {
        ...atom,
        position: [
          rotated[0] + center1[0],
          rotated[1] + center1[1],
          rotated[2] + center1[2]
        ] as [number, number, number]
      };
    });
    
    return {
      aligned1: atoms1,
      aligned2: rotated2,
      rotationMatrix,
      translation: [
        center1[0] - center2[0],
        center1[1] - center2[1],
        center1[2] - center2[2]
      ]
    };
  }
  
  /**
   * Buduje macierz kowariancji dla algorytmu Kabscha
   */
  private buildCovarianceMatrix(atoms1: AtomData[], atoms2: AtomData[]): number[][] {
    const matrix: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    
    for (let i = 0; i < atoms1.length; i++) {
      for (let j = 0; j < 3; j++) {
        for (let k = 0; k < 3; k++) {
          matrix[j][k] += atoms1[i].position[j] * atoms2[i].position[k];
        }
      }
    }
    
    return matrix;
  }
  
  /**
   * Uproszczona implementacja SVD (w praktyce użylibyśmy bibliotekę)
   */
  private simpleSVD(matrix: number[][]): {
    U: number[][],
    S: number[],
    V: number[][]
  } {
    // To jest placeholder - rzeczywista implementacja wymagałaby
    // pełnego algorytmu SVD lub użycia biblioteki numerycznej
    return {
      U: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      S: [1, 1, 1],
      V: [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    };
  }
  
  /**
   * Oblicza macierz rotacji z wyników SVD
   */
  private calculateRotationMatrix(svd: any): number[][] {
    // Placeholder - w rzeczywistości: R = V * U^T
    return [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  }
  
  /**
   * Rotuje punkt używając macierzy rotacji
   */
  private rotatePoint(point: [number, number, number], matrix: number[][]): [number, number, number] {
    return [
      matrix[0][0] * point[0] + matrix[0][1] * point[1] + matrix[0][2] * point[2],
      matrix[1][0] * point[0] + matrix[1][1] * point[1] + matrix[1][2] * point[2],
      matrix[2][0] * point[0] + matrix[2][1] * point[1] + matrix[2][2] * point[2]
    ];
  }
  
  /**
   * Identyfikuje regiony elastyczne w białku
   * Regiony o wysokim RMSD lokalnym są bardziej elastyczne
   * 
   * @param animation1 Pierwsza konformacja
   * @param animation2 Druga konformacja
   * @param windowSize Rozmiar okna do obliczania lokalnego RMSD
   * @returns Mapa regionów elastycznych
   */
  public identifyFlexibleRegions(
    animation1: MolecularAnimation,
    animation2: MolecularAnimation,
    windowSize: number = 5
  ): Map<string, { chainId: string, startResidue: number, endResidue: number, flexibility: number }[]> {
    const flexibleRegions = new Map<string, any[]>();
    
    if (!animation1.proteinData || !animation2.proteinData) {
      return flexibleRegions;
    }
    
    // Analizujemy każdy łańcuch
    animation1.proteinData.chains.forEach(chain1 => {
      const chain2 = animation2.proteinData!.chains.find(c => c.chainId === chain1.chainId);
      if (!chain2) return;
      
      const regions: any[] = [];
      
      // Przechodzimy przez residua z oknem
      for (let i = 0; i < chain1.residues.length - windowSize; i++) {
        // Zbieramy atomy z okna
        const atoms1: AtomData[] = [];
        const atoms2: AtomData[] = [];
        
        for (let j = 0; j < windowSize; j++) {
          const res1 = chain1.residues[i + j];
          const res2 = chain2.residues[i + j];
          
          if (res1 && res2) {
            // Dodajemy tylko atomy szkieletu (CA, C, N, O)
            const backboneAtoms1 = res1.atoms.filter(a => 
              ['CA', 'C', 'N', 'O'].includes(a.atomName)
            );
            const backboneAtoms2 = res2.atoms.filter(a => 
              ['CA', 'C', 'N', 'O'].includes(a.atomName)
            );
            
            atoms1.push(...backboneAtoms1);
            atoms2.push(...backboneAtoms2);
          }
        }
        
        if (atoms1.length > 0 && atoms1.length === atoms2.length) {
          const rmsd = this.calculateRMSD(atoms1, atoms2, true);
          
          // Jeśli RMSD jest wysoki, oznacza to region elastyczny
          if (rmsd > 1.5) { // Próg 1.5 Å
            regions.push({
              chainId: chain1.chainId,
              startResidue: chain1.residues[i].residueId,
              endResidue: chain1.residues[i + windowSize - 1].residueId,
              flexibility: rmsd
            });
          }
        }
      }
      
      flexibleRegions.set(chain1.chainId, regions);
    });
    
    return flexibleRegions;
  }
  
  /**
   * Generuje animację przejścia między dwoma konformacjami
   * Używa interpolacji liniowej z opcjonalnym wygładzaniem
   * 
   * @param startConformation Początkowa konformacja
   * @param endConformation Końcowa konformacja
   * @param duration Czas trwania animacji w ms
   * @param steps Liczba kroków interpolacji
   * @returns Animacja przejścia konformacyjnego
   */
  public generateConformationalTransition(
    startConformation: MolecularAnimation,
    endConformation: MolecularAnimation,
    duration: number = 2000,
    steps: number = 50
  ): MolecularAnimation {
    // Klonujemy animację początkową jako bazę
    const transitionAnimation: MolecularAnimation = JSON.parse(
      JSON.stringify(startConformation)
    );
    
    // Ustawiamy czas trwania
    transitionAnimation.metadata.duration = duration;
    transitionAnimation.metadata.animationType = 'conformational-transition';
    
    // Wyrównujemy struktury
    const startAtoms = this.extractAllAtoms(startConformation);
    const endAtoms = this.extractAllAtoms(endConformation);
    
    const alignment = this.kabschAlignment(startAtoms, endAtoms);
    
    // Generujemy klatki kluczowe
    for (let step = 1; step <= steps; step++) {
      const t = step / steps; // Parametr interpolacji 0-1
      const timestamp = (duration * step) / steps;
      
      // Obliczamy przemieszczenia atomów
      const atomDisplacements: any[] = [];
      
      for (let i = 0; i < startAtoms.length; i++) {
        const startPos = startAtoms[i].position;
        const endPos = alignment.aligned2[i].position;
        
        // Interpolacja liniowa pozycji
        const displacement: [number, number, number] = [
          (endPos[0] - startPos[0]) * t,
          (endPos[1] - startPos[1]) * t,
          (endPos[2] - startPos[2]) * t
        ];
        
        // Dodajemy tylko znaczące przemieszczenia
        const distance = Math.sqrt(
          displacement[0] ** 2 + 
          displacement[1] ** 2 + 
          displacement[2] ** 2
        );
        
        if (distance > 0.01) { // Próg 0.01 Å
          atomDisplacements.push({
            atomId: startAtoms[i].atomId,
            displacement
          });
        }
      }
      
      // Tworzymy transformację konformacyjną
      const conformationalChange: ConformationalChange = {
        type: 'conformational',
        atomDisplacements
      };
      
      // Dodajemy do timeline
      transitionAnimation.timeline.push({
        timestamp,
        changes: [{
          objectId: 'protein_main',
          transformation: conformationalChange
        }]
      });
    }
    
    return transitionAnimation;
  }
  
  /**
   * Ekstraktuje wszystkie atomy z animacji molekularnej
   */
  private extractAllAtoms(animation: MolecularAnimation): AtomData[] {
    const atoms: AtomData[] = [];
    
    if (animation.proteinData) {
      animation.proteinData.chains.forEach(chain => {
        chain.residues.forEach(residue => {
          atoms.push(...residue.atoms);
        });
      });
    }
    
    return atoms;
  }
  
  /**
   * Wykrywa ruchy domen w białku
   * Domeny to duże, sztywne fragmenty które poruszają się jako całość
   * 
   * @param animation1 Pierwsza konformacja
   * @param animation2 Druga konformacja
   * @param minDomainSize Minimalna wielkość domeny (liczba reszt)
   * @returns Lista wykrytych ruchów domen
   */
  public detectDomainMotions(
    animation1: MolecularAnimation,
    animation2: MolecularAnimation,
    minDomainSize: number = 30
  ): DomainMotion[] {
    const domainMotions: DomainMotion[] = [];
    
    // Identyfikujemy elastyczne regiony
    const flexibleRegions = this.identifyFlexibleRegions(animation1, animation2);
    
    // Znajdujemy sztywne domeny między regionami elastycznymi
    // (To jest uproszczona implementacja - w praktyce używalibyśmy
    // bardziej zaawansowanych algorytmów jak DynDom lub FlexServ)
    
    if (!animation1.proteinData || !animation2.proteinData) {
      return domainMotions;
    }
    
    animation1.proteinData.chains.forEach(chain => {
      const flexRegions = flexibleRegions.get(chain.chainId) || [];
      
      // Sortujemy regiony elastyczne według pozycji
      flexRegions.sort((a, b) => a.startResidue - b.startResidue);
      
      // Identyfikujemy domeny między regionami elastycznymi
      let domainStart = chain.residues[0].residueId;
      
      flexRegions.forEach((region, index) => {
        const domainEnd = region.startResidue - 1;
        const domainSize = domainEnd - domainStart + 1;
        
        if (domainSize >= minDomainSize) {
          // Analizujemy ruch tej domeny
          const motion = this.analyzeDomainMotion(
            animation1,
            animation2,
            chain.chainId,
            domainStart,
            domainEnd
          );
          
          if (motion) {
            domainMotions.push(motion);
          }
        }
        
        domainStart = region.endResidue + 1;
      });
      
      // Sprawdzamy ostatnią domenę
      const lastDomainEnd = chain.residues[chain.residues.length - 1].residueId;
      const lastDomainSize = lastDomainEnd - domainStart + 1;
      
      if (lastDomainSize >= minDomainSize) {
        const motion = this.analyzeDomainMotion(
          animation1,
          animation2,
          chain.chainId,
          domainStart,
          lastDomainEnd
        );
        
        if (motion) {
          domainMotions.push(motion);
        }
      }
    });
    
    return domainMotions;
  }
  
  /**
   * Analizuje ruch pojedynczej domeny
   */
  private analyzeDomainMotion(
    animation1: MolecularAnimation,
    animation2: MolecularAnimation,
    chainId: string,
    startResidue: number,
    endResidue: number
  ): DomainMotion | null {
    // Zbieramy atomy domeny z obu konformacji
    const domainAtoms1: AtomData[] = [];
    const domainAtoms2: AtomData[] = [];
    
    const chain1 = animation1.proteinData!.chains.find(c => c.chainId === chainId);
    const chain2 = animation2.proteinData!.chains.find(c => c.chainId === chainId);
    
    if (!chain1 || !chain2) return null;
    
    // Zbieramy atomy CA (węgiel alfa) dla analizy ruchu
    chain1.residues.forEach(res => {
      if (res.residueId >= startResidue && res.residueId <= endResidue) {
        const ca = res.atoms.find(a => a.atomName === 'CA');
        if (ca) domainAtoms1.push(ca);
      }
    });
    
    chain2.residues.forEach(res => {
      if (res.residueId >= startResidue && res.residueId <= endResidue) {
        const ca = res.atoms.find(a => a.atomName === 'CA');
        if (ca) domainAtoms2.push(ca);
      }
    });
    
    if (domainAtoms1.length === 0 || domainAtoms1.length !== domainAtoms2.length) {
      return null;
    }
    
    // Obliczamy centra mas domen
    const center1 = calculateCenterOfMass(domainAtoms1);
    const center2 = calculateCenterOfMass(domainAtoms2);
    
    // Obliczamy przemieszczenie centrum masy
    const displacement = Math.sqrt(
      (center2[0] - center1[0]) ** 2 +
      (center2[1] - center1[1]) ** 2 +
      (center2[2] - center1[2]) ** 2
    );
    
    // Jeśli przemieszczenie jest znaczące, analizujemy rotację
    if (displacement > 2.0) { // Próg 2 Å
      // Tu byłaby bardziej złożona analiza rotacji
      // Uproszczenie: zakładamy rotację wokół osi przechodzącej przez centrum
      
      return {
        type: 'domain-motion',
        domainId: `${chainId}_${startResidue}-${endResidue}`,
        rotationAxis: [0, 0, 1], // Placeholder - należałoby obliczyć rzeczywistą oś
        rotationAngle: 30, // Placeholder - należałoby obliczyć rzeczywisty kąt
        hingeResidues: [startResidue - 1, endResidue + 1] // Residua zawiasowe
      };
    }
    
    return null;
  }
}

/**
 * Funkcja pomocnicza do szybkiej analizy zmian konformacyjnych
 * @param anim1 Pierwsza animacja
 * @param anim2 Druga animacja
 * @returns Obiekt z wynikami analizy
 */
export function analyzeConformationalChanges(
  anim1: MolecularAnimation,
  anim2: MolecularAnimation
): {
  rmsd: number,
  flexibleRegions: Map<string, any[]>,
  domainMotions: DomainMotion[]
} {
  const analyzer = new ConformationalAnalyzer();
  
  // Ekstraktujemy wszystkie atomy
  const atoms1: AtomData[] = [];
  const atoms2: AtomData[] = [];
  
  if (anim1.proteinData && anim2.proteinData) {
    anim1.proteinData.chains.forEach(chain => {
      chain.residues.forEach(res => {
        atoms1.push(...res.atoms.filter(a => a.atomName === 'CA'));
      });
    });
    
    anim2.proteinData.chains.forEach(chain => {
      chain.residues.forEach(res => {
        atoms2.push(...res.atoms.filter(a => a.atomName === 'CA'));
      });
    });
  }
  
  return {
    rmsd: analyzer.calculateRMSD(atoms1, atoms2),
    flexibleRegions: analyzer.identifyFlexibleRegions(anim1, anim2),
    domainMotions: analyzer.detectDomainMotions(anim1, anim2)
  };
}
