/**
 * Parser plików PDB (Protein Data Bank)
 * 
 * Format PDB jest standardem w krystalografii białek i zawiera:
 * - Współrzędne atomów
 * - Informacje o strukturze drugorzędowej
 * - Dane krystalograficzne
 * - Informacje o ligandach i rozpuszczalniku
 * 
 * Ten parser konwertuje dane PDB na nasz format VectorDiff,
 * zachowując wszystkie istotne informacje strukturalne.
 */

import { 
  MolecularAnimation, 
  ChainData, 
  ResidueData, 
  AtomData,
  BondData,
  SecondaryStructureElement,
  LigandData,
  ResidueType 
} from '../types/molecular-format';
import { createEmptyAnimation } from '@vectordiff/core';

export class PDBParser {
  private atoms: AtomData[] = [];
  private chains: Map<string, ChainData> = new Map();
  private ligands: Map<string, LigandData> = new Map();
  private secondaryStructure: SecondaryStructureElement[] = [];
  private bonds: BondData[] = [];
  private title: string = '';
  private resolution?: number;
  
  /**
   * Parsuje plik PDB i konwertuje na format VectorDiff
   * @param pdbContent Zawartość pliku PDB jako string
   * @returns Animacja molekularna w formacie VectorDiff
   */
  public parse(pdbContent: string): MolecularAnimation {
    // Resetujemy stan parsera
    this.reset();
    
    // Dzielimy plik na linie
    const lines = pdbContent.split('\n');
    
    // Parsujemy każdą linię według jej typu
    lines.forEach(line => {
      const recordType = line.substring(0, 6).trim();
      
      switch (recordType) {
        case 'TITLE':
          this.parseTitle(line);
          break;
          
        case 'REMARK':
          this.parseRemark(line);
          break;
          
        case 'ATOM':
          this.parseAtom(line);
          break;
          
        case 'HETATM':
          this.parseHetatm(line);
          break;
          
        case 'HELIX':
          this.parseHelix(line);
          break;
          
        case 'SHEET':
          this.parseSheet(line);
          break;
          
        case 'CONECT':
          this.parseConnect(line);
          break;
          
        case 'TER':
          // Koniec łańcucha - nie wymagamy specjalnej obsługi
          break;
          
        case 'END':
        case 'ENDMDL':
          // Koniec modelu lub pliku
          break;
      }
    });
    
    // Budujemy finalną strukturę animacji
    return this.buildAnimation();
  }
  
  /**
   * Resetuje stan parsera
   */
  private reset(): void {
    this.atoms = [];
    this.chains.clear();
    this.ligands.clear();
    this.secondaryStructure = [];
    this.bonds = [];
    this.title = '';
    this.resolution = undefined;
  }
  
  /**
   * Parsuje linię TITLE
   * TITLE zawiera opisowy tytuł struktury
   */
  private parseTitle(line: string): void {
    const title = line.substring(10, 80).trim();
    this.title = this.title ? `${this.title} ${title}` : title;
  }
  
  /**
   * Parsuje linie REMARK
   * REMARK 2 zawiera informację o rozdzielczości
   */
  private parseRemark(line: string): void {
    const remarkNumber = parseInt(line.substring(7, 10));
    
    if (remarkNumber === 2) {
      // REMARK   2 RESOLUTION. 2.00 ANGSTROMS.
      const resolutionMatch = line.match(/(\d+\.\d+)\s+ANGSTROMS/);
      if (resolutionMatch) {
        this.resolution = parseFloat(resolutionMatch[1]);
      }
    }
  }
  
  /**
   * Parsuje linię ATOM
   * Format: 
   * ATOM      1  N   MET A   1      20.154  29.699   5.276  1.00 49.05           N
   */
  private parseAtom(line: string): void {
    // Parsujemy pola według stałych pozycji w formacie PDB
    const atomId = parseInt(line.substring(6, 11));
    const atomName = line.substring(12, 16).trim();
    const altLoc = line.substring(16, 17).trim();
    const residueName = line.substring(17, 20).trim();
    const chainId = line.substring(21, 22).trim() || 'A';
    const residueId = parseInt(line.substring(22, 26));
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const occupancy = parseFloat(line.substring(54, 60)) || 1.0;
    const bFactor = parseFloat(line.substring(60, 66)) || 0.0;
    const element = line.substring(76, 78).trim() || this.guessElement(atomName);
    
    // Tworzymy obiekt atomu
    const atom: AtomData = {
      atomId,
      atomName,
      element,
      position: [x, y, z],
      bFactor,
      occupancy
    };
    
    if (altLoc) {
      atom.alternateLocation = altLoc;
    }
    
    this.atoms.push(atom);
    
    // Dodajemy atom do odpowiedniego łańcucha i residuum
    if (!this.chains.has(chainId)) {
      this.chains.set(chainId, {
        chainId,
        residues: []
      });
    }
    
    const chain = this.chains.get(chainId)!;
    let residue = chain.residues.find(r => r.residueId === residueId);
    
    if (!residue) {
      residue = {
        residueId,
        residueName,
        residueType: this.getResidueType(residueName),
        atoms: []
      };
      chain.residues.push(residue);
    }
    
    residue.atoms.push(atom);
  }
  
  /**
   * Parsuje linię HETATM (heteroatomy - ligandy, woda, jony)
   */
  private parseHetatm(line: string): void {
    // Format podobny do ATOM
    const atomId = parseInt(line.substring(6, 11));
    const atomName = line.substring(12, 16).trim();
    const residueName = line.substring(17, 20).trim();
    const chainId = line.substring(21, 22).trim();
    const residueId = parseInt(line.substring(22, 26));
    const x = parseFloat(line.substring(30, 38));
    const y = parseFloat(line.substring(38, 46));
    const z = parseFloat(line.substring(46, 54));
    const element = line.substring(76, 78).trim() || this.guessElement(atomName);
    
    const atom: AtomData = {
      atomId,
      atomName,
      element,
      position: [x, y, z]
    };
    
    // Jeśli to nie woda (HOH/WAT), traktujemy jako ligand
    if (residueName !== 'HOH' && residueName !== 'WAT') {
      const ligandKey = `${residueName}_${chainId}_${residueId}`;
      
      if (!this.ligands.has(ligandKey)) {
        this.ligands.set(ligandKey, {
          ligandId: ligandKey,
          name: residueName,
          atoms: [],
          bonds: []
        });
      }
      
      this.ligands.get(ligandKey)!.atoms.push(atom);
    }
  }
  
  /**
   * Parsuje linię HELIX (struktura helisy)
   * Format:
   * HELIX    1  H1 ILE A   16  GLU A   29  1                                  14
   */
  private parseHelix(line: string): void {
    const startResidue = parseInt(line.substring(21, 25));
    const endResidue = parseInt(line.substring(33, 37));
    const chainId = line.substring(19, 20).trim();
    const helixClass = parseInt(line.substring(38, 40)) || 1;
    
    this.secondaryStructure.push({
      type: 'helix',
      startResidue,
      endResidue,
      chainId,
      helixClass
    });
  }
  
  /**
   * Parsuje linię SHEET (arkusz beta)
   */
  private parseSheet(line: string): void {
    const strand = parseInt(line.substring(7, 10));
    const startResidue = parseInt(line.substring(22, 26));
    const endResidue = parseInt(line.substring(33, 37));
    const chainId = line.substring(21, 22).trim();
    const sense = parseInt(line.substring(38, 40)) as 1 | -1;
    
    this.secondaryStructure.push({
      type: 'sheet',
      startResidue,
      endResidue,
      chainId,
      strand,
      sense
    });
  }
  
  /**
   * Parsuje linię CONECT (połączenia między atomami)
   */
  private parseConnect(line: string): void {
    const atom1Id = parseInt(line.substring(6, 11));
    
    // CONECT może mieć do 4 połączonych atomów
    for (let i = 0; i < 4; i++) {
      const start = 11 + (i * 5);
      const end = start + 5;
      if (line.length >= end) {
        const atom2Id = parseInt(line.substring(start, end));
        if (!isNaN(atom2Id) && atom2Id > 0) {
          // Unikamy duplikatów - dodajemy tylko jeśli atom1Id < atom2Id
          if (atom1Id < atom2Id) {
            this.bonds.push({
              atom1Id,
              atom2Id,
              bondOrder: 1 // PDB nie zawiera informacji o rzędzie wiązania
            });
          }
        }
      }
    }
  }
  
  /**
   * Odgaduje element na podstawie nazwy atomu
   * Np. "CA" -> "C", "OG1" -> "O"
   */
  private guessElement(atomName: string): string {
    // Usuń cyfry z nazwy
    const nameWithoutDigits = atomName.replace(/\d/g, '');
    
    // Pierwsza litera to zazwyczaj element
    if (nameWithoutDigits.length > 0) {
      return nameWithoutDigits[0];
    }
    
    return 'X'; // Nieznany element
  }
  
  /**
   * Konwertuje trzyliterowy kod aminokwasu na jednoliterowy
   */
  private getResidueType(residueName: string): ResidueType {
    const mapping: { [key: string]: ResidueType } = {
      'ALA': 'A', 'ARG': 'R', 'ASN': 'N', 'ASP': 'D',
      'CYS': 'C', 'GLN': 'Q', 'GLU': 'E', 'GLY': 'G',
      'HIS': 'H', 'ILE': 'I', 'LEU': 'L', 'LYS': 'K',
      'MET': 'M', 'PHE': 'F', 'PRO': 'P', 'SER': 'S',
      'THR': 'T', 'TRP': 'W', 'TYR': 'Y', 'VAL': 'V'
    };
    
    return mapping[residueName] || 'X';
  }
  
  /**
   * Buduje finalną animację molekularną
   */
  private buildAnimation(): MolecularAnimation {
    // Obliczamy wymiary sceny na podstawie atomów
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    this.atoms.forEach(atom => {
      minX = Math.min(minX, atom.position[0]);
      minY = Math.min(minY, atom.position[1]);
      minZ = Math.min(minZ, atom.position[2]);
      maxX = Math.max(maxX, atom.position[0]);
      maxY = Math.max(maxY, atom.position[1]);
      maxZ = Math.max(maxZ, atom.position[2]);
    });
    
    const width = maxX - minX + 20;  // Dodajemy margines
    const height = maxY - minY + 20;
    const depth = maxZ - minZ + 20;
    
    // Tworzymy bazową animację
    const animation = createEmptyAnimation(width, height, depth) as MolecularAnimation;
    
    // Uzupełniamy metadane
    animation.metadata.author = 'PDB Parser';
    animation.metadata.source = 'Protein Data Bank';
    animation.metadata.title = this.title;
    if (this.resolution) {
      animation.metadata.resolution = this.resolution;
    }
    
    // Dodajemy dane białka
    const chainsArray = Array.from(this.chains.values());
    
    // Sortujemy residua w każdym łańcuchu
    chainsArray.forEach(chain => {
      chain.residues.sort((a, b) => a.residueId - b.residueId);
    });
    
    // Budujemy sekwencję
    const sequence = chainsArray
      .map(chain => chain.residues.map(r => r.residueType).join(''))
      .join('/'); // Łańcuchy oddzielone /
    
    animation.proteinData = {
      sequence,
      chains: chainsArray,
      secondaryStructure: this.secondaryStructure
    };
    
    // Dodajemy ligandy
    if (this.ligands.size > 0) {
      animation.ligands = Array.from(this.ligands.values());
    }
    
    // Dodajemy główny obiekt molekuły do sceny
    animation.baseScene.objects.push({
      id: 'protein_main',
      type: 'molecule',
      data: {
        atoms: this.atoms,
        bonds: this.bonds,
        chains: chainsArray,
        renderStyle: 'cartoon' // Domyślny styl renderowania
      },
      attributes: {
        name: this.title,
        visible: true
      }
    });
    
    // Dodajemy obiekty ligandów
    this.ligands.forEach((ligand, key) => {
      animation.baseScene.objects.push({
        id: `ligand_${key}`,
        type: 'molecule',
        data: {
          atoms: ligand.atoms,
          bonds: ligand.bonds,
          renderStyle: 'ball-stick'
        },
        attributes: {
          name: ligand.name,
          visible: true,
          isLigand: true
        }
      });
    });
    
    return animation;
  }
}

/**
 * Funkcja pomocnicza do szybkiego parsowania pliku PDB
 * @param pdbContent Zawartość pliku PDB
 * @returns Animacja molekularna
 */
export function parsePDB(pdbContent: string): MolecularAnimation {
  const parser = new PDBParser();
  return parser.parse(pdbContent);
}

/**
 * Funkcja do pobierania struktury z RCSB PDB
 * @param pdbId Identyfikator PDB (np. "1CRN")
 * @returns Promise z animacją molekularną
 */
export async function fetchPDBStructure(pdbId: string): Promise<MolecularAnimation> {
  const url = `https://files.rcsb.org/download/${pdbId.toUpperCase()}.pdb`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch PDB ${pdbId}: ${response.status}`);
    }
    
    const pdbContent = await response.text();
    return parsePDB(pdbContent);
  } catch (error) {
    throw new Error(`Error fetching PDB structure: ${error}`);
  }
}
