/**
 * Wyspecjalizowany renderer 3D dla wizualizacji molekularnych
 * 
 * Ten renderer rozszerza podstawowy ThreeRenderer o funkcje specyficzne
 * dla wizualizacji białek i innych biomolekuł:
 * - Różne style reprezentacji (cartoon, ball-and-stick, surface)
 * - Kolorowanie według różnych właściwości
 * - Renderowanie interakcji molekularnych
 * - Efekty wizualne dla podkreślenia ważnych elementów
 * 
 * Dlaczego to jest ważne?
 * Wizualizacja molekuł to nie tylko estetyka - sposób reprezentacji
 * może ujawnić ważne cechy strukturalne i funkcjonalne białka.
 */

import * as THREE from 'three';
import { ThreeRenderer, ThreeRendererOptions } from '@vectordiff/visualization';
import { 
  MolecularAnimation, 
  AtomData, 
  BondData, 
  ChainData,
  ResidueData,
  SecondaryStructureElement 
} from '../types/molecular-format';

export interface MolecularRendererOptions extends ThreeRendererOptions {
  defaultRenderStyle?: 'cartoon' | 'ball-stick' | 'stick' | 'surface' | 'ribbon';
  defaultColorScheme?: 'chain' | 'secondary' | 'bfactor' | 'hydrophobicity' | 'element';
  showHydrogenBonds?: boolean;
  showWater?: boolean;
  atomScale?: number;
  bondRadius?: number;
}

export class MolecularRenderer extends ThreeRenderer {
  private molecularOptions: MolecularRendererOptions;
  private atomMeshes: Map<number, THREE.Mesh> = new Map();
  private bondMeshes: Map<string, THREE.Mesh> = new Map();
  private cartoonMeshes: Map<string, THREE.Mesh> = new Map();
  private colorSchemes: Map<string, (atom: AtomData, residue?: ResidueData) => THREE.Color> = new Map();
  
  // Materiały dla różnych elementów
  private materials: {
    atoms: Map<string, THREE.Material>,
    bonds: THREE.Material,
    cartoon: THREE.Material,
    surface: THREE.Material
  };
  
  constructor(options: MolecularRendererOptions) {
    // Ustawiamy tryb medyczny na 'molecular'
    super({ ...options, medicalMode: 'molecular' });
    
    this.molecularOptions = {
      defaultRenderStyle: options.defaultRenderStyle || 'cartoon',
      defaultColorScheme: options.defaultColorScheme || 'chain',
      showHydrogenBonds: options.showHydrogenBonds !== false,
      showWater: options.showWater || false,
      atomScale: options.atomScale || 1.0,
      bondRadius: options.bondRadius || 0.2
    };
    
    // Inicjalizujemy materiały
    this.materials = this.initializeMaterials();
    
    // Inicjalizujemy schematy kolorowania
    this.initializeColorSchemes();
  }
  
  /**
   * Inicjalizuje podstawowe materiały
   */
  private initializeMaterials(): any {
    const materials = {
      atoms: new Map<string, THREE.Material>(),
      bonds: new THREE.MeshPhongMaterial({
        color: 0xcccccc,
        shininess: 100
      }),
      cartoon: new THREE.MeshPhongMaterial({
        color: 0xffffff,
        shininess: 150,
        side: THREE.DoubleSide
      }),
      surface: new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      })
    };
    
    // Materiały dla różnych pierwiastków (schemat kolorów CPK)
    const elementColors: { [key: string]: number } = {
      'H': 0xffffff,  // Biały
      'C': 0x909090,  // Szary
      'N': 0x3050f8,  // Niebieski
      'O': 0xff0d0d,  // Czerwony
      'S': 0xffff30,  // Żółty
      'P': 0xff8000,  // Pomarańczowy
      'Fe': 0xe06633, // Brązowy
      'Ca': 0x3dff00  // Zielony
    };
    
    Object.entries(elementColors).forEach(([element, color]) => {
      materials.atoms.set(element, new THREE.MeshPhongMaterial({
        color,
        shininess: 100
      }));
    });
    
    return materials;
  }
  
  /**
   * Inicjalizuje schematy kolorowania
   * Każdy schemat to funkcja, która przypisuje kolor atomowi
   */
  private initializeColorSchemes(): void {
    // Kolorowanie według łańcucha
    const chainColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];
    let chainColorMap = new Map<string, THREE.Color>();
    
    this.colorSchemes.set('chain', (atom, residue) => {
      if (!residue) return new THREE.Color(0xcccccc);
      
      // Przypisujemy kolor do łańcucha jeśli jeszcze nie ma
      if (!chainColorMap.has(residue.chainId || 'A')) {
        const index = chainColorMap.size % chainColors.length;
        chainColorMap.set(residue.chainId || 'A', new THREE.Color(chainColors[index]));
      }
      
      return chainColorMap.get(residue.chainId || 'A')!;
    });
    
    // Kolorowanie według struktury drugorzędowej
    this.colorSchemes.set('secondary', (atom, residue) => {
      if (!residue || !residue.secondaryStructure) {
        return new THREE.Color(0x808080); // Szary dla pętli
      }
      
      switch (residue.secondaryStructure) {
        case 'helix': return new THREE.Color(0xff0080);   // Różowy
        case 'sheet': return new THREE.Color(0xffc800);   // Żółty
        case 'turn': return new THREE.Color(0x80ff00);    // Zielony
        default: return new THREE.Color(0x808080);        // Szary
      }
    });
    
    // Kolorowanie według B-factor (czynnika temperaturowego)
    // Niebieski = niska mobilność, Czerwony = wysoka mobilność
    this.colorSchemes.set('bfactor', (atom) => {
      const bFactor = atom.bFactor || 20;
      const normalized = Math.min(Math.max((bFactor - 10) / 40, 0), 1);
      
      // Gradient od niebieskiego do czerwonego
      const hue = (1 - normalized) * 0.66; // 0.66 = niebieski, 0 = czerwony
      return new THREE.Color().setHSL(hue, 1, 0.5);
    });
    
    // Kolorowanie według hydrofobowości
    this.colorSchemes.set('hydrophobicity', (atom, residue) => {
      if (!residue) return new THREE.Color(0xcccccc);
      
      // Skala hydrofobowości Kyte-Doolittle
      const hydrophobicity: { [key: string]: number } = {
        'I': 4.5, 'V': 4.2, 'L': 3.8, 'F': 2.8, 'C': 2.5,
        'M': 1.9, 'A': 1.8, 'G': -0.4, 'T': -0.7, 'S': -0.8,
        'W': -0.9, 'Y': -1.3, 'P': -1.6, 'H': -3.2, 'Q': -3.5,
        'N': -3.5, 'E': -3.5, 'D': -3.5, 'K': -3.9, 'R': -4.5
      };
      
      const value = hydrophobicity[residue.residueType] || 0;
      const normalized = (value + 4.5) / 9; // Normalizacja do 0-1
      
      // Gradient od niebieskiego (hydrofilowy) do czerwonego (hydrofobowy)
      const hue = normalized * 0.33; // 0 = niebieski, 0.33 = czerwony
      return new THREE.Color().setHSL(hue, 1, 0.5);
    });
    
    // Kolorowanie według pierwiastka (CPK)
    this.colorSchemes.set('element', (atom) => {
      const elementColors: { [key: string]: number } = {
        'H': 0xffffff, 'C': 0x909090, 'N': 0x3050f8,
        'O': 0xff0d0d, 'S': 0xffff30, 'P': 0xff8000
      };
      return new THREE.Color(elementColors[atom.element] || 0xffffff);
    });
  }
  
  /**
   * Ładuje animację molekularną
   * Nadpisuje metodę z klasy bazowej
   */
  public loadAnimation(animation: VectorDiffAnimation): void {
    // Sprawdzamy czy to animacja molekularna
    const molecularAnimation = animation as MolecularAnimation;
    
    if (!molecularAnimation.proteinData && !molecularAnimation.ligands) {
      // Jeśli brak danych molekularnych, używamy standardowej metody
      super.loadAnimation(animation);
      return;
    }
    
    // Czyścimy poprzednią scenę
    this.clearMolecularScene();
    
    // Zapisujemy animację
    this.animation = animation;
    
    // Renderujemy molekuły według stylu
    const renderStyle = this.molecularOptions.defaultRenderStyle!;
    
    switch (renderStyle) {
      case 'cartoon':
        this.renderCartoon(molecularAnimation);
        break;
        
      case 'ball-stick':
        this.renderBallAndStick(molecularAnimation);
        break;
        
      case 'stick':
        this.renderStick(molecularAnimation);
        break;
        
      case 'surface':
        this.renderSurface(molecularAnimation);
        break;
        
      case 'ribbon':
        this.renderRibbon(molecularAnimation);
        break;
    }
    
    // Renderujemy ligandy (zawsze jako ball-and-stick)
    if (molecularAnimation.ligands) {
      molecularAnimation.ligands.forEach(ligand => {
        this.renderLigand(ligand);
      });
    }
    
    // Renderujemy interakcje jeśli włączone
    if (this.molecularOptions.showHydrogenBonds) {
      this.renderHydrogenBonds(molecularAnimation);
    }
    
    // Centrujemy kamerę na molekule
    this.centerCameraOnMolecule();
    
    // Pierwszy render
    this.render();
  }
  
  /**
   * Renderuje reprezentację cartoon (wstążkową)
   * To najbardziej popularna reprezentacja dla białek
   */
  private renderCartoon(animation: MolecularAnimation): void {
    if (!animation.proteinData) return;
    
    animation.proteinData.chains.forEach(chain => {
      const chainGroup = new THREE.Group();
      chainGroup.name = `chain_${chain.chainId}`;
      
      // Dla każdego elementu struktury drugorzędowej
      const secondaryElements = this.groupResiduesBySecondaryStructure(
        chain, 
        animation.proteinData!.secondaryStructure || []
      );
      
      secondaryElements.forEach(element => {
        let mesh: THREE.Mesh | null = null;
        
        switch (element.type) {
          case 'helix':
            mesh = this.createHelixMesh(element.residues);
            break;
            
          case 'sheet':
            mesh = this.createSheetMesh(element.residues);
            break;
            
          case 'turn':
          case 'coil':
            mesh = this.createCoilMesh(element.residues);
            break;
        }
        
        if (mesh) {
          // Aplikujemy kolor
          const colorScheme = this.colorSchemes.get(this.molecularOptions.defaultColorScheme!);
          if (colorScheme && element.residues.length > 0) {
            const color = colorScheme(
              element.residues[0].atoms[0], 
              element.residues[0]
            );
            (mesh.material as THREE.MeshPhongMaterial).color = color;
          }
          
          chainGroup.add(mesh);
          this.cartoonMeshes.set(`${chain.chainId}_${element.type}_${element.residues[0].residueId}`, mesh);
        }
      });
      
      this.scene.add(chainGroup);
    });
  }
  
  /**
   * Grupuje residua według struktury drugorzędowej
   */
  private groupResiduesBySecondaryStructure(
    chain: ChainData,
    secondaryStructure: SecondaryStructureElement[]
  ): { type: string, residues: ResidueData[] }[] {
    const groups: { type: string, residues: ResidueData[] }[] = [];
    
    // Oznaczamy residua według struktury drugorzędowej
    chain.residues.forEach(residue => {
      // Znajdujemy element struktury dla tego residuum
      const element = secondaryStructure.find(ss => 
        ss.chainId === chain.chainId &&
        residue.residueId >= ss.startResidue &&
        residue.residueId <= ss.endResidue
      );
      
      if (element) {
        residue.secondaryStructure = element.type;
      } else {
        residue.secondaryStructure = 'coil';
      }
    });
    
    // Grupujemy ciągłe fragmenty o tej samej strukturze
    let currentGroup: { type: string, residues: ResidueData[] } | null = null;
    
    chain.residues.forEach(residue => {
      const ssType = residue.secondaryStructure || 'coil';
      
      if (!currentGroup || currentGroup.type !== ssType) {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = { type: ssType, residues: [] };
      }
      
      currentGroup.residues.push(residue);
    });
    
    if (currentGroup) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  /**
   * Tworzy mesh dla helisy alfa
   * Helisa to spiralna struktura - jedna z głównych struktur drugorzędowych
   */
  private createHelixMesh(residues: ResidueData[]): THREE.Mesh {
    // Zbieramy punkty CA (węgiel alfa) dla stworzenia ścieżki
    const points: THREE.Vector3[] = [];
    
    residues.forEach(residue => {
      const ca = residue.atoms.find(a => a.atomName === 'CA');
      if (ca) {
        points.push(new THREE.Vector3(...ca.position));
      }
    });
    
    if (points.length < 2) {
      return new THREE.Mesh(); // Pusty mesh
    }
    
    // Tworzymy splajn przez punkty CA
    const curve = new THREE.CatmullRomCurve3(points);
    
    // Geometria helisy - cylinder skręcony wzdłuż ścieżki
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      points.length * 10,  // Segmenty wzdłuż
      1.5,                  // Promień helisy
      8,                    // Segmenty radialne
      false                 // Zamknięta
    );
    
    const material = this.materials.cartoon.clone();
    return new THREE.Mesh(tubeGeometry, material);
  }
  
  /**
   * Tworzy mesh dla arkusza beta
   * Arkusze to płaskie, pofałdowane struktury
   */
  private createSheetMesh(residues: ResidueData[]): THREE.Mesh {
    // Dla arkusza tworzymy płaską wstążkę
    const points: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    
    residues.forEach((residue, i) => {
      const ca = residue.atoms.find(a => a.atomName === 'CA');
      const c = residue.atoms.find(a => a.atomName === 'C');
      const n = residue.atoms.find(a => a.atomName === 'N');
      
      if (ca && c && n) {
        points.push(new THREE.Vector3(...ca.position));
        
        // Obliczamy normalną płaszczyzny peptydu
        const v1 = new THREE.Vector3(...c.position).sub(new THREE.Vector3(...ca.position));
        const v2 = new THREE.Vector3(...n.position).sub(new THREE.Vector3(...ca.position));
        const normal = v1.cross(v2).normalize();
        normals.push(normal);
      }
    });
    
    if (points.length < 2) {
      return new THREE.Mesh();
    }
    
    // Tworzymy geometrię wstążki
    const geometry = this.createRibbonGeometry(points, normals, 3.0, 0.5);
    const material = this.materials.cartoon.clone();
    
    return new THREE.Mesh(geometry, material);
  }
  
  /**
   * Tworzy mesh dla pętli/zakrętów
   * To nieregularne fragmenty łączące elementy struktury regularnej
   */
  private createCoilMesh(residues: ResidueData[]): THREE.Mesh {
    const points: THREE.Vector3[] = [];
    
    residues.forEach(residue => {
      const ca = residue.atoms.find(a => a.atomName === 'CA');
      if (ca) {
        points.push(new THREE.Vector3(...ca.position));
      }
    });
    
    if (points.length < 2) {
      return new THREE.Mesh();
    }
    
    // Dla pętli używamy cienkiej tuby
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeometry = new THREE.TubeGeometry(
      curve,
      points.length * 5,
      0.5,  // Cieńsza niż helisa
      6,
      false
    );
    
    const material = this.materials.cartoon.clone();
    return new THREE.Mesh(tubeGeometry, material);
  }
  
  /**
   * Tworzy geometrię wstążki
   * Używane dla arkuszy beta i innych płaskich struktur
   */
  private createRibbonGeometry(
    points: THREE.Vector3[], 
    normals: THREE.Vector3[], 
    width: number, 
    thickness: number
  ): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const indices: number[] = [];
    const uvs: number[] = [];
    
    // Dla każdego punktu tworzymy przekrój prostokątny
    points.forEach((point, i) => {
      const normal = normals[i] || new THREE.Vector3(0, 1, 0);
      const tangent = i < points.length - 1 
        ? points[i + 1].clone().sub(point).normalize()
        : points[i].clone().sub(points[i - 1]).normalize();
      
      const binormal = tangent.clone().cross(normal).normalize();
      
      // Cztery wierzchołki przekroju
      const halfWidth = width / 2;
      const halfThickness = thickness / 2;
      
      // Górna lewa
      vertices.push(
        point.x - binormal.x * halfWidth - normal.x * halfThickness,
        point.y - binormal.y * halfWidth - normal.y * halfThickness,
        point.z - binormal.z * halfWidth - normal.z * halfThickness
      );
      
      // Górna prawa
      vertices.push(
        point.x + binormal.x * halfWidth - normal.x * halfThickness,
        point.y + binormal.y * halfWidth - normal.y * halfThickness,
        point.z + binormal.z * halfWidth - normal.z * halfThickness
      );
      
      // Dolna prawa
      vertices.push(
        point.x + binormal.x * halfWidth + normal.x * halfThickness,
        point.y + binormal.y * halfWidth + normal.y * halfThickness,
        point.z + binormal.z * halfWidth + normal.z * halfThickness
      );
      
      // Dolna lewa
      vertices.push(
        point.x - binormal.x * halfWidth + normal.x * halfThickness,
        point.y - binormal.y * halfWidth + normal.y * halfThickness,
        point.z - binormal.z * halfWidth + normal.z * halfThickness
      );
      
      // UV
      const u = i / (points.length - 1);
      uvs.push(0, u, 1, u, 1, u, 0, u);
    });
    
    // Tworzymy trójkąty łączące przekroje
    for (let i = 0; i < points.length - 1; i++) {
      const a = i * 4;
      const b = (i + 1) * 4;
      
      // Górna powierzchnia
      indices.push(a, b, b + 1);
      indices.push(a, b + 1, a + 1);
      
      // Prawa powierzchnia
      indices.push(a + 1, b + 1, b + 2);
      indices.push(a + 1, b + 2, a + 2);
      
      // Dolna powierzchnia
      indices.push(a + 2, b + 2, b + 3);
      indices.push(a + 2, b + 3, a + 3);
      
      // Lewa powierzchnia
      indices.push(a + 3, b + 3, b);
      indices.push(a + 3, b, a);
    }
    
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    
    return geometry;
  }
  
  /**
   * Renderuje reprezentację ball-and-stick
   * Atomy jako kule, wiązania jako cylindry
   */
  private renderBallAndStick(animation: MolecularAnimation): void {
    if (!animation.proteinData) return;
    
    const atomGroup = new THREE.Group();
    atomGroup.name = 'atoms';
    
    const bondGroup = new THREE.Group();
    bondGroup.name = 'bonds';
    
    // Renderujemy atomy
    animation.proteinData.chains.forEach(chain => {
      chain.residues.forEach(residue => {
        residue.atoms.forEach(atom => {
          // Pomijamy wodory jeśli nie są wymagane
          if (atom.element === 'H' && !this.molecularOptions.showWater) {
            return;
          }
          
          const mesh = this.createAtomMesh(atom, residue);
          atomGroup.add(mesh);
          this.atomMeshes.set(atom.atomId, mesh);
        });
      });
    });
    
    // Renderujemy wiązania
    // Tu używamy uproszczonego podejścia - łączymy atomy w obrębie residuum
    animation.proteinData.chains.forEach(chain => {
      chain.residues.forEach((residue, resIndex) => {
        // Wiązania wewnątrz residuum
        this.createIntraResidueBonds(residue, bondGroup);
        
        // Wiązanie peptydowe do następnego residuum
        if (resIndex < chain.residues.length - 1) {
          const nextResidue = chain.residues[resIndex + 1];
          this.createPeptideBond(residue, nextResidue, bondGroup);
        }
      });
    });
    
    this.scene.add(atomGroup);
    this.scene.add(bondGroup);
  }
  
  /**
   * Tworzy mesh dla pojedynczego atomu
   */
  private createAtomMesh(atom: AtomData, residue?: ResidueData): THREE.Mesh {
    // Promienie van der Waalsa dla różnych pierwiastków (w angstremach)
    const vdwRadii: { [key: string]: number } = {
      'H': 1.2, 'C': 1.7, 'N': 1.55, 'O': 1.52,
      'S': 1.8, 'P': 1.8, 'Fe': 1.4, 'Ca': 1.0
    };
    
    const radius = (vdwRadii[atom.element] || 1.5) * this.molecularOptions.atomScale! * 0.3;
    const geometry = new THREE.SphereGeometry(radius, 16, 16);
    
    // Wybieramy materiał i kolor
    let material = this.materials.atoms.get(atom.element);
    if (!material) {
      material = new THREE.MeshPhongMaterial({ color: 0xffffff });
    }
    
    // Aplikujemy schemat kolorowania jeśli nie jest 'element'
    if (this.molecularOptions.defaultColorScheme !== 'element') {
      const colorScheme = this.colorSchemes.get(this.molecularOptions.defaultColorScheme!);
      if (colorScheme) {
        material = material.clone();
        (material as THREE.MeshPhongMaterial).color = colorScheme(atom, residue);
      }
    }
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...atom.position);
    mesh.userData = { atomId: atom.atomId, element: atom.element };
    
    return mesh;
  }
  
  /**
   * Tworzy wiązania wewnątrz residuum
   */
  private createIntraResidueBonds(residue: ResidueData, bondGroup: THREE.Group): void {
    // Definiujemy typowe wiązania w aminokwasach
    const commonBonds: [string, string][] = [
      ['N', 'CA'], ['CA', 'C'], ['C', 'O'], ['CA', 'CB'],
      ['CB', 'CG'], ['CG', 'CD'], ['CD', 'CE'], ['CE', 'NZ']
    ];
    
    const atomMap = new Map<string, AtomData>();
    residue.atoms.forEach(atom => {
      atomMap.set(atom.atomName, atom);
    });
    
    commonBonds.forEach(([atom1Name, atom2Name]) => {
      const atom1 = atomMap.get(atom1Name);
      const atom2 = atomMap.get(atom2Name);
      
      if (atom1 && atom2) {
        const bond = this.createBondMesh(atom1, atom2);
        bondGroup.add(bond);
        this.bondMeshes.set(`${atom1.atomId}_${atom2.atomId}`, bond);
      }
    });
  }
  
  /**
   * Tworzy wiązanie peptydowe między residuami
   */
  private createPeptideBond(residue1: ResidueData, residue2: ResidueData, bondGroup: THREE.Group): void {
    const c = residue1.atoms.find(a => a.atomName === 'C');
    const n = residue2.atoms.find(a => a.atomName === 'N');
    
    if (c && n) {
      const bond = this.createBondMesh(c, n);
      bondGroup.add(bond);
      this.bondMeshes.set(`${c.atomId}_${n.atomId}`, bond);
    }
  }
  
  /**
   * Tworzy mesh cylindra reprezentujący wiązanie
   */
  private createBondMesh(atom1: AtomData, atom2: AtomData): THREE.Mesh {
    const pos1 = new THREE.Vector3(...atom1.position);
    const pos2 = new THREE.Vector3(...atom2.position);
    
    const direction = pos2.clone().sub(pos1);
    const length = direction.length();
    direction.normalize();
    
    // Cylinder w Three.js jest domyślnie wzdłuż osi Y
    const geometry = new THREE.CylinderGeometry(
      this.molecularOptions.bondRadius,
      this.molecularOptions.bondRadius,
      length,
      8
    );
    
    const material = this.materials.bonds.clone();
    const mesh = new THREE.Mesh(geometry, material);
    
    // Pozycjonujemy cylinder między atomami
    mesh.position.copy(pos1).add(pos2).multiplyScalar(0.5);
    
    // Obracamy cylinder aby wskazywał we właściwym kierunku
    mesh.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction
    );
    
    return mesh;
  }
  
  /**
   * Renderuje ligand
   */
  private renderLigand(ligand: LigandData): void {
    const ligandGroup = new THREE.Group();
    ligandGroup.name = `ligand_${ligand.ligandId}`;
    
    // Renderujemy atomy ligandu
    ligand.atoms.forEach(atom => {
      const mesh = this.createAtomMesh(atom);
      mesh.scale.multiplyScalar(0.8); // Trochę mniejsze dla odróżnienia
      ligandGroup.add(mesh);
    });
    
    // Renderujemy wiązania ligandu
    ligand.bonds.forEach(bond => {
      const atom1 = ligand.atoms.find(a => a.atomId === bond.atom1Id);
      const atom2 = ligand.atoms.find(a => a.atomId === bond.atom2Id);
      
      if (atom1 && atom2) {
        const bondMesh = this.createBondMesh(atom1, atom2);
        ligandGroup.add(bondMesh);
      }
    });
    
    this.scene.add(ligandGroup);
  }
  
  /**
   * Renderuje wiązania wodorowe
   * Wiązania wodorowe to słabe interakcje ważne dla struktury białka
   */
  private renderHydrogenBonds(animation: MolecularAnimation): void {
    if (!animation.proteinData) return;
    
    const hBondGroup = new THREE.Group();
    hBondGroup.name = 'hydrogen_bonds';
    
    // Znajdowanie potencjalnych wiązań wodorowych
    // Donor: N-H, O-H
    // Akceptor: O, N
    const donors: { atom: AtomData, hydrogen?: AtomData }[] = [];
    const acceptors: AtomData[] = [];
    
    animation.proteinData.chains.forEach(chain => {
      chain.residues.forEach(residue => {
        residue.atoms.forEach(atom => {
          // Identyfikacja donorów i akceptorów
          if (atom.element === 'N' || (atom.element === 'O' && atom.atomName === 'OH')) {
            donors.push({ atom });
          }
          if (atom.element === 'O' || atom.element === 'N') {
            acceptors.push(atom);
          }
        });
      });
    });
    
    // Sprawdzanie par donor-akceptor
    donors.forEach(donor => {
      acceptors.forEach(acceptor => {
        if (donor.atom.atomId === acceptor.atomId) return;
        
        const distance = this.calculateDistance(donor.atom.position, acceptor.position);
        
        // Typowy zakres dla wiązania wodorowego: 2.5-3.5 Å
        if (distance > 2.5 && distance < 3.5) {
          const hBond = this.createHydrogenBondMesh(donor.atom, acceptor);
          hBondGroup.add(hBond);
        }
      });
    });
    
    this.scene.add(hBondGroup);
  }
  
  /**
   * Tworzy mesh dla wiązania wodorowego (linia przerywana)
   */
  private createHydrogenBondMesh(donor: AtomData, acceptor: AtomData): THREE.Line {
    const points = [
      new THREE.Vector3(...donor.position),
      new THREE.Vector3(...acceptor.position)
    ];
    
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x00ff00,
      dashSize: 0.5,
      gapSize: 0.3,
      linewidth: 2
    });
    
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    
    return line;
  }
  
  /**
   * Oblicza odległość między dwoma punktami
   */
  private calculateDistance(pos1: [number, number, number], pos2: [number, number, number]): number {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  
  /**
   * Czyści scenę molekularną
   */
  private clearMolecularScene(): void {
    // Usuwamy meshe atomów
    this.atomMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });
    this.atomMeshes.clear();
    
    // Usuwamy meshe wiązań
    this.bondMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });
    this.bondMeshes.clear();
    
    // Usuwamy meshe cartoon
    this.cartoonMeshes.forEach(mesh => {
      mesh.geometry.dispose();
      if (mesh.material instanceof THREE.Material) {
        mesh.material.dispose();
      }
      if (mesh.parent) {
        mesh.parent.remove(mesh);
      }
    });
    this.cartoonMeshes.clear();
    
    // Wywołujemy metodę bazową
    super.clearScene();
  }
  
  /**
   * Centruje kamerę na molekule
   */
  private centerCameraOnMolecule(): void {
    // Obliczamy bounding box wszystkich atomów
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    // Przechodzimy przez wszystkie meshe atomów
    this.atomMeshes.forEach(mesh => {
      minX = Math.min(minX, mesh.position.x);
      minY = Math.min(minY, mesh.position.y);
      minZ = Math.min(minZ, mesh.position.z);
      maxX = Math.max(maxX, mesh.position.x);
      maxY = Math.max(maxY, mesh.position.y);
      maxZ = Math.max(maxZ, mesh.position.z);
    });
    
    // Jeśli nie ma atomów, sprawdzamy cartoon meshe
    if (this.atomMeshes.size === 0) {
      this.cartoonMeshes.forEach(mesh => {
        const box = new THREE.Box3().setFromObject(mesh);
        minX = Math.min(minX, box.min.x);
        minY = Math.min(minY, box.min.y);
        minZ = Math.min(minZ, box.min.z);
        maxX = Math.max(maxX, box.max.x);
        maxY = Math.max(maxY, box.max.y);
        maxZ = Math.max(maxZ, box.max.z);
      });
    }
    
    // Obliczamy centrum
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    
    // Obliczamy rozmiar
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);
    
    // Ustawiamy target kontrolek na centrum molekuły
    if (this.controls) {
      this.controls.target.set(centerX, centerY, centerZ);
    }
    
    // Ustawiamy kamerę w odpowiedniej odległości
    const distance = maxSize * 2;
    this.camera.position.set(
      centerX + distance * 0.5,
      centerY + distance * 0.3,
      centerZ + distance * 0.8
    );
    
    this.camera.lookAt(centerX, centerY, centerZ);
    
    // Aktualizujemy near/far plane kamery
    this.camera.near = distance * 0.01;
    this.camera.far = distance * 10;
    this.camera.updateProjectionMatrix();
  }
  
  /**
   * Zmienia styl renderowania
   * @param style Nowy styl renderowania
   */
  public setRenderStyle(style: 'cartoon' | 'ball-stick' | 'stick' | 'surface' | 'ribbon'): void {
    this.molecularOptions.defaultRenderStyle = style;
    
    // Przeładowujemy animację z nowym stylem
    if (this.animation) {
      this.loadAnimation(this.animation);
    }
  }
  
  /**
   * Zmienia schemat kolorowania
   * @param scheme Nowy schemat kolorowania
   */
  public setColorScheme(scheme: 'chain' | 'secondary' | 'bfactor' | 'hydrophobicity' | 'element'): void {
    this.molecularOptions.defaultColorScheme = scheme;
    
    // Aktualizujemy kolory istniejących obiektów
    const colorScheme = this.colorSchemes.get(scheme);
    if (!colorScheme) return;
    
    // Aktualizujemy kolory atomów
    this.atomMeshes.forEach((mesh, atomId) => {
      // Znajdujemy atom i residuum
      // (W prawdziwej implementacji przechowywalibyśmy te dane)
      const material = mesh.material as THREE.MeshPhongMaterial;
      material.color = colorScheme({ atomId, element: mesh.userData.element } as AtomData);
    });
    
    // Renderujemy ponownie
    this.render();
  }
  
  /**
   * Eksportuje scenę molekularną do formatu PDB
   * @returns String w formacie PDB
   */
  public exportToPDB(): string {
    // To jest uproszczona implementacja
    let pdbContent = 'REMARK   Generated by VectorDiff Molecular Renderer\n';
    let atomIndex = 1;
    
    this.atomMeshes.forEach((mesh, atomId) => {
      const pos = mesh.position;
      const element = mesh.userData.element || 'X';
      
      // Format PDB dla linii ATOM
      // ATOM      1  N   MET A   1      20.154  29.699   5.276  1.00 49.05           N
      pdbContent += sprintf(
        'ATOM  %5d  %-4s %3s %1s%4d    %8.3f%8.3f%8.3f%6.2f%6.2f          %2s\n',
        atomIndex++,
        element,
        'UNK', // Nieznane residuum
        'A',   // Łańcuch A
        1,     // Numer residuum
        pos.x,
        pos.y,
        pos.z,
        1.00,  // Occupancy
        0.00,  // B-factor
        element
      );
    });
    
    pdbContent += 'END\n';
    return pdbContent;
  }
}

/**
 * Pomocnicza funkcja sprintf (uproszczona implementacja)
 */
function sprintf(format: string, ...args: any[]): string {
  let i = 0;
  return format.replace(/%(-?\d*)(\.\d+)?([dfs])/g, (match, width, precision, type) => {
    const arg = args[i++];
    let formatted = '';
    
    switch (type) {
      case 'd':
        formatted = Math.floor(arg).toString();
        break;
      case 'f':
        formatted = parseFloat(arg).toFixed(precision ? parseInt(precision.slice(1)) : 6);
        break;
      case 's':
        formatted = String(arg);
        break;
    }
    
    // Padding
    const w = parseInt(width) || 0;
    if (w > 0) {
      formatted = formatted.padStart(w);
    } else if (w < 0) {
      formatted = formatted.padEnd(-w);
    }
    
    return formatted;
  }
}
