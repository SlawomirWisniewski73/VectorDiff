import React from 'react';
import {
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Stack,
  LinearProgress
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MolecularAnimation } from '@vectordiff/molecular';

interface StructurePanelProps {
  animation: MolecularAnimation;
}

export function StructurePanel({ animation }: StructurePanelProps) {
  const proteinData = animation.proteinData;
  
  if (!proteinData) {
    return <Typography>Brak danych strukturalnych</Typography>;
  }
  
  // Statystyki
  const totalAtoms = proteinData.chains.reduce(
    (sum, chain) => sum + chain.residues.reduce(
      (chainSum, res) => chainSum + res.atoms.length, 0
    ), 0
  );
  
  const totalResidues = proteinData.chains.reduce(
    (sum, chain) => sum + chain.residues.length, 0
  );
  
  // Zliczanie struktur drugorzędowych
  const secondaryStats = {
    helix: 0,
    sheet: 0,
    turn: 0,
    coil: 0
  };
  
  proteinData.secondaryStructure?.forEach(ss => {
    const count = ss.endResidue - ss.startResidue + 1;
    secondaryStats[ss.type] += count;
  });
  
  return (
    <Box>
      {/* Podstawowe informacje */}
      <Typography variant="h6" gutterBottom>
        {animation.metadata.title || 'Struktura białka'}
      </Typography>
      
      <Stack direction="row" spacing={1} mb={2}>
        <Chip label={`${proteinData.chains.length} łańcuchów`} size="small" />
        <Chip label={`${totalResidues} reszt`} size="small" />
        <Chip label={`${totalAtoms} atomów`} size="small" />
      </Stack>
      
      {/* Struktura drugorzędowa */}
      <Typography variant="subtitle2" gutterBottom>
        Struktura drugorzędowa
      </Typography>
      <Box mb={2}>
        <Stack spacing={1}>
          <Box display="flex" alignItems="center">
            <Box width={20} height={10} bgcolor="#ff0080" mr={1} />
            <Typography variant="body2" flex={1}>
              α-helisy: {secondaryStats.helix} reszt
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(secondaryStats.helix / totalResidues) * 100}
              sx={{ width: 100, ml: 1 }}
            />
          </Box>
          <Box display="flex" alignItems="center">
            <Box width={20} height={10} bgcolor="#ffc800" mr={1} />
            <Typography variant="body2" flex={1}>
              β-arkusze: {secondaryStats.sheet} reszt
            </Typography>
            <LinearProgress
              variant="determinate"
              value={(secondaryStats.sheet / totalResidues) * 100}
              sx={{ width: 100, ml: 1 }}
              color="warning"
            />
          </Box>
          <Box display="flex" alignItems="center">
            <Box width={20} height={10} bgcolor="#808080" mr={1} />
            <Typography variant="body2" flex={1}>
              Pętle: {secondaryStats.coil + secondaryStats.turn} reszt
            </Typography>
            <LinearProgress
              variant="determinate"
              value={((secondaryStats.coil + secondaryStats.turn) / totalResidues) * 100}
              sx={{ width: 100, ml: 1 }}
              color="inherit"
            />
          </Box>
        </Stack>
      </Box>
      
      {/* Łańcuchy */}
      <Typography variant="subtitle2" gutterBottom>
        Łańcuchy polipeptydowe
      </Typography>
      {proteinData.chains.map((chain, index) => (
        <Accordion key={chain.chainId} defaultExpanded={index === 0}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography>
              Łańcuch {chain.chainId} ({chain.residues.length} reszt)
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" paragraph>
              Sekwencja: {chain.residues.slice(0, 10).map(r => r.residueType).join('')}...
            </Typography>
            <Typography variant="body2">
              Zakres: {chain.residues[0].residueId}-{chain.residues[chain.residues.length - 1].residueId}
            </Typography>
          </AccordionDetails>
        </Accordion>
      ))}
      
      {/* Ligandy */}
      {animation.ligands && animation.ligands.length > 0 && (
        <>
          <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
            Ligandy
          </Typography>
          <List dense>
            {animation.ligands.map(ligand => (
              <ListItem key={ligand.ligandId}>
                <ListItemText
                  primary={ligand.name}
                  secondary={`${ligand.atoms.length} atomów`}
                />
              </ListItem>
            ))}
          </List>
        </>
      )}
      
      {/* Metadane */}
      {animation.metadata.resolution && (
        <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
          Rozdzielczość: {animation.metadata.resolution} Å
        </Typography>
      )}
      
      {animation.metadata.alphafold && (
        <Chip
          label="Struktura AlphaFold"
          color="secondary"
          size="small"
          sx={{ mt: 1 }}
        />
      )}
    </Box>
  );
}
