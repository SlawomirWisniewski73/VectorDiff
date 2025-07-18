/**
 * Definicje typów specyficznych dla modelowania molekularnego
 * 
 * Ten plik rozszerza podstawowy format VectorDiff o struktury
 * niezbędne do reprezentacji białek, ligandów i ich interakcji.
 * 
 * Kluczowe koncepcje:
 * - Hierarchiczna reprezentacja: łańcuch -> residuum -> atom
 * - Struktury drugorzędowe (helisy, arkusze beta)
 * - Wiązania chemiczne i interakcje niekowalencyjne
 * - Powierzchnie molekularne i kieszenie wiążące
 */

import { VectorDiffAnimation, VectorObject, Transformation } from '@vectordiff/core';

/**
 * Rozszerzona animacja molekularna
 * Zawiera dodatkowe metadane specyficzne dla symulacji molekularnych
 */
export interface MolecularAnimation extends VectorDiffAnimation {
  // Dane strukturalne białka
  proteinData?: {
    sequence: string;              // Sekwencja aminokwasowa
    chains: ChainData[];          // Łańcuchy polipeptydowe
    secondaryStructure?: SecondaryStructureElement[]; // Elementy struktury drugorzędowej
    disulfideBonds?: DisulfideBond[]; // Mostki dwusiarczkowe
  };
  
  // Dane o ligandach
  ligands?: LigandData[];
  
  // Parametry symulacji
  simulationParameters?: {
    temperature: number;          // Temperatura w Kelwinach
    pH: number;                  // pH środowiska
    ionicStrength: number;       // Siła jonowa
    solvent: string;             // Typ rozpuszczalnika
    forcefield: string;          // Pole siłowe (np. AMBER, CHARMM)
    timestep?: number;           // Krok czasowy symulacji
  };
  
  // Dane energetyczne
  energyProfile?: {
    timestamps: number[];        // Punkty czasowe
    totalEnergy: number[];       // Energia całkowita
    kineticEnergy: number[];     // Energia kinetyczna
    potentialEnergy: number[];   // Energia potencjalna
    bondEnergy?: number[];       // Energia wiązań
    angleEnergy?: number[];      // Energia kątów
    dihedralEnergy?: number[];   // Energia kątów dwuściennych
    electrostaticEnergy?: number[]; // Energia elektrostatyczna
    vanDerWaalsEnergy?: number[]; // Energia van der Waalsa
  };
}

/**
 * Dane łańcucha polipeptydowego
 */
export interface ChainData {
  chainId: string;               // Identyfikator łańcucha (A, B, C...)
  residues: ResidueData[];       // Lista reszt aminokwasowych
  nTerminus?: AtomData;          // N-koniec
  cTerminus?: AtomData;          // C-koniec
}

/**
 * Dane pojedynczej reszty aminokwasowej
 */
export interface ResidueData {
  residueId: number;             // Numer reszty w sekwencji
  residueName: string;           // Trzyliterowy kod (np. ALA, GLY)
  residueType: ResidueType;      // Jednoliterowy kod
  atoms: AtomData[];             // Atomy w reszcie
  phi?: number;                  // Kąt phi szkieletu
  psi?: number;                  // Kąt psi szkieletu
  omega?: number;                // Kąt omega szkieletu
  secondaryStructure?: 'helix' | 'sheet' | 'turn' | 'coil'; // Typ struktury drugorzędowej
  solventAccessibility?: number; // Dostępność dla rozpuszczalnika
}

/**
 * Dane atomu
 * To jest fundamentalny budulec wszystkich struktur molekularnych
 */
export interface AtomData {
  atomId: number;                // Unikalny identyfikator atomu
  atomName: string;              // Nazwa atomu (np. CA, CB)
  element: ElementType;          // Symbol pierwiastka
  position: [number, number, number]; // Współrzędne X, Y, Z
  charge?: number;               // Ładunek cząstkowy
  radius?: number;               // Promień van der Waalsa
  bFactor?: number;              // Czynnik temperaturowy (B-factor)
  occupancy?: number;            // Obsadzenie
  alternateLocation?: string;    // Alternatywna lokalizacja
}

/**
 * Typy pierwiastków najczęściej występujące w białkach
 */
export type ElementType = 'H' | 'C' | 'N' | 'O' | 'S' | 'P' | 'Fe' | 'Zn' | 'Ca' | 'Mg' | 'Na' | 'K' | 'Cl' | string;

/**
 * Typy reszt aminokwasowych
 */
export type ResidueType = 
  'A' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'K' | 'L' |
  'M' | 'N' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'V' | 'W' | 'Y' |
  'X'; // X dla nieznanej reszty

/**
 * Element struktury drugorzędowej
 */
export interface SecondaryStructureElement {
  type: 'helix' | 'sheet' | 'turn' | 'coil';
  startResidue: number;
  endResidue: number;
  chainId: string;
  // Dodatkowe parametry dla helis
  helixClass?: number;           // Klasa helisy (1-10)
  // Dodatkowe parametry dla arkuszy beta
  strand?: number;               // Numer nici w arkuszu
  sense?: 1 | -1;               // Kierunek nici (parallel/antiparallel)
}

/**
 * Mostek dwusiarczkowy
 */
export interface DisulfideBond {
  residue1: { chainId: string; residueId: number };
  residue2: { chainId: string; residueId: number };
  distance: number;              // Długość wiązania S-S
}

/**
 * Dane ligandu (małej cząsteczki)
 */
export interface LigandData {
  ligandId: string;              // Identyfikator ligandu
  name: string;                  // Nazwa zwyczajowa
  smiles?: string;               // Notacja SMILES
  atoms: AtomData[];             // Atomy ligandu
  bonds: BondData[];             // Wiązania w ligandzie
  bindingSite?: BindingSite;    // Miejsce wiązania w białku
  affinity?: number;             // Powinowactwo wiązania (Ki, Kd)
}

/**
 * Wiązanie chemiczne
 */
export interface BondData {
  atom1Id: number;
  atom2Id: number;
  bondOrder: 1 | 1.5 | 2 | 3;   // Rząd wiązania
  bondType?: 'single' | 'double' | 'triple' | 'aromatic';
  isRotatable?: boolean;         // Czy wiązanie może się obracać
}

/**
 * Miejsce wiązania ligandu
 */
export interface BindingSite {
  residues: { chainId: string; residueId: number }[]; // Reszty tworzące kieszeń
  volume?: number;               // Objętość kieszeni
  hydrophobicity?: number;       // Hydrofobowość kieszeni
  electrostatics?: number;       // Potencjał elektrostatyczny
}

/**
 * Rozszerzone typy obiektów molekularnych
 */
export interface MoleculeObject extends VectorObject {
  type: 'molecule';
  data: {
    atoms: AtomData[];
    bonds: BondData[];
    chains?: ChainData[];
    renderStyle?: 'ball-stick' | 'stick' | 'cartoon' | 'surface' | 'ribbon';
  };
}

/**
 * Transformacje specyficzne dla molekuł
 */
export interface ConformationalChange extends Transformation {
  type: 'conformational';
  // Zmiany kątów dwuściennych
  dihedralChanges?: {
    residueId: number;
    chainId: string;
    phiDelta?: number;
    psiDelta?: number;
    chi1Delta?: number;
    chi2Delta?: number;
  }[];
  // Przemieszczenia atomów
  atomDisplacements?: {
    atomId: number;
    displacement: [number, number, number];
  }[];
}

/**
 * Dynamika domeny białkowej
 */
export interface DomainMotion extends Transformation {
  type: 'domain-motion';
  domainId: string;              // Identyfikator domeny
  rotationAxis: [number, number, number]; // Oś obrotu
  rotationAngle: number;         // Kąt obrotu
  hingeResidues?: number[];      // Reszty zawiasowe
}

/**
 * Zmiana stanu wiązania ligandu
 */
export interface BindingTransformation extends Transformation {
  type: 'binding';
  ligandId: string;
  bindingState: 'approaching' | 'binding' | 'bound' | 'releasing';
  interactionEnergy?: number;    // Energia oddziaływania
  contacts?: ProteinLigandContact[]; // Kontakty białko-ligand
}

/**
 * Kontakt między białkiem a ligandem
 */
export interface ProteinLigandContact {
  proteinAtom: { chainId: string; residueId: number; atomName: string };
  ligandAtom: { atomId: number };
  distance: number;
  contactType: 'hydrogen-bond' | 'hydrophobic' | 'electrostatic' | 'van-der-waals' | 'pi-stacking';
  energy?: number;
}

/**
 * Funkcje pomocnicze do pracy z danymi molekularnymi
 */

/**
 * Oblicza środek masy molekuły
 * @param atoms Lista atomów
 * @returns Współrzędne środka masy
 */
export function calculateCenterOfMass(atoms: AtomData[]): [number, number, number] {
  const masses = {
    'H': 1.008, 'C': 12.011, 'N': 14.007, 'O': 15.999, 
    'S': 32.065, 'P': 30.974, 'Fe': 55.845
  };
  
  let totalMass = 0;
  let centerX = 0, centerY = 0, centerZ = 0;
  
  atoms.forEach(atom => {
    const mass = masses[atom.element] || 1.0;
    totalMass += mass;
    centerX += atom.position[0] * mass;
    centerY += atom.position[1] * mass;
    centerZ += atom.position[2] * mass;
  });
  
  return [
    centerX / totalMass,
    centerY / totalMass,
    centerZ / totalMass
  ];
}

/**
 * Oblicza promień żyracji molekuły
 * Mierzy rozproszenie masy wokół środka masy
 * @param atoms Lista atomów
 * @returns Promień żyracji
 */
export function calculateRadiusOfGyration(atoms: AtomData[]): number {
  const centerOfMass = calculateCenterOfMass(atoms);
  let sumSquaredDistances = 0;
  
  atoms.forEach(atom => {
    const dx = atom.position[0] - centerOfMass[0];
    const dy = atom.position[1] - centerOfMass[1];
    const dz = atom.position[2] - centerOfMass[2];
    sumSquaredDistances += dx * dx + dy * dy + dz * dz;
  });
  
  return Math.sqrt(sumSquaredDistances / atoms.length);
}
