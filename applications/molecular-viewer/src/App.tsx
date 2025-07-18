/**
 * Molecular Viewer - Główna aplikacja do wizualizacji struktur molekularnych
 * 
 * Funkcjonalności:
 * - Ładowanie struktur z PDB lub AlphaFold
 * - Interaktywna wizualizacja 3D
 * - Analiza zmian konformacyjnych
 * - Animacje przejść między stanami
 * - Eksport do różnych formatów
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Slider,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  Snackbar,
  Chip,
  Tooltip,
  SpeedDial,
  SpeedDialIcon,
  SpeedDialAction
} from '@mui/material';
import {
  Menu as MenuIcon,
  FileUpload as FileUploadIcon,
  Download as DownloadIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  Settings as SettingsIcon,
  Biotech as BiotechIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon,
  CloudDownload as CloudDownloadIcon,
  CompareArrows as CompareArrowsIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
  ColorLens as ColorLensIcon,
  ThreeDRotation as ThreeDRotationIcon
} from '@mui/icons-material';
import { useDropzone } from 'react-dropzone';

// Komponenty VectorDiff
import { VectorDiffPlayer } from '@vectordiff/visualization';
import {
  MolecularAnimation,
  parsePDB,
  fetchPDBStructure,
  fetchAlphaFoldStructure,
  ConformationalAnalyzer,
  analyzeConformationalChanges,
  MolecularRenderer,
  MolecularRendererOptions
} from '@vectordiff/molecular';

// Lokalne komponenty
import { StructurePanel } from './components/StructurePanel';
import { AnalysisPanel } from './components/AnalysisPanel';
import { SequenceViewer } from './components/SequenceViewer';
import { InteractionMap } from './components/InteractionMap';
import { ConformationTimeline } from './components/ConformationTimeline';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

export default function MolecularViewerApp() {
  // Stan główny
  const [animation, setAnimation] = useState<MolecularAnimation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [tabValue, setTabValue] = useState(0);
  
  // Stan wizualizacji
  const [renderStyle, setRenderStyle] = useState<'cartoon' | 'ball-stick' | 'stick' | 'surface' | 'ribbon'>('cartoon');
  const [colorScheme, setColorScheme] = useState<'chain' | 'secondary' | 'bfactor' | 'hydrophobicity' | 'element'>('chain');
  const [showHydrogenBonds, setShowHydrogenBonds] = useState(true);
  const [showWater, setShowWater] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#000000');
  
  // Stan animacji
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Referencje
  const playerRef = useRef<any>(null);
  const rendererRef = useRef<MolecularRenderer | null>(null);
  
  // Dropzone do uploadowania plików
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    setIsLoading(true);
    setError(null);
    
    try {
      const content = await file.text();
      
      if (file.name.endsWith('.pdb')) {
        const animation = parsePDB(content);
        setAnimation(animation);
      } else if (file.name.endsWith('.json')) {
        const animation = JSON.parse(content) as MolecularAnimation;
        setAnimation(animation);
      } else {
        throw new Error('Nieobsługiwany format pliku. Użyj .pdb lub .json');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd ładowania pliku');
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'chemical/x-pdb': ['.pdb'],
      'application/json': ['.json']
    }
  });
  
  // Ładowanie z bazy danych
  const loadFromPDB = async (pdbId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const animation = await fetchPDBStructure(pdbId);
      setAnimation(animation);
    } catch (err) {
      setError(`Nie można pobrać struktury ${pdbId}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  const loadFromAlphaFold = async (uniprotId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const animation = await fetchAlphaFoldStructure(uniprotId);
      setAnimation(animation);
    } catch (err) {
      setError(`Nie można pobrać struktury AlphaFold ${uniprotId}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Analiza konformacyjna
  const analyzeConformations = async () => {
    if (!animation) return;
    
    setIsLoading(true);
    try {
      // Tu byłaby logika analizy
      console.log('Analiza konformacji...');
    } catch (err) {
      setError('Błąd analizy konformacyjnej');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Eksport
  const exportAnimation = () => {
    if (!animation) return;
    
    const json = JSON.stringify(animation, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${animation.metadata.title || 'molecule'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  // Aktualizacja renderera
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.setRenderStyle(renderStyle);
      rendererRef.current.setColorScheme(colorScheme);
    }
  }, [renderStyle, colorScheme]);
  
  // Przykładowe struktury
  const exampleStructures = [
    { id: '1CRN', name: 'Crambin', type: 'pdb' },
    { id: '6M0J', name: 'SARS-CoV-2 Spike', type: 'pdb' },
    { id: 'P00533', name: 'EGFR (AlphaFold)', type: 'alphafold' },
    { id: '7NMJ', name: 'DNA Polymerase', type: 'pdb' }
  ];
  
  return (
    <Box sx={{ display: 'flex', height: '100vh' }}>
      {/* AppBar */}
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton
            color="inherit"
            edge="start"
            onClick={() => setDrawerOpen(!drawerOpen)}
            sx={{ mr: 2 }}
          >
            <MenuIcon />
          </IconButton>
          <BiotechIcon sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            VectorDiff Molecular Viewer
          </Typography>
          {animation && (
            <Chip
              label={animation.metadata.title || 'Bez nazwy'}
              color="primary"
              sx={{ mr: 2 }}
            />
          )}
        </Toolbar>
      </AppBar>
      
      {/* Drawer z opcjami */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: 300,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 300,
            boxSizing: 'border-box',
            mt: 8
          }
        }}
      >
        <List>
          <ListItem>
            <ListItemIcon>
              <FileUploadIcon />
            </ListItemIcon>
            <ListItemText primary="Załaduj strukturę" />
          </ListItem>
          
          {/* Dropzone */}
          <ListItem>
            <Box
              {...getRootProps()}
              sx={{
                width: '100%',
                p: 2,
                border: '2px dashed',
                borderColor: isDragActive ? 'primary.main' : 'grey.500',
                borderRadius: 1,
                textAlign: 'center',
                cursor: 'pointer',
                bgcolor: isDragActive ? 'action.hover' : 'background.paper'
              }}
            >
              <input {...getInputProps()} />
              <CloudDownloadIcon sx={{ fontSize: 40, color: 'grey.500' }} />
              <Typography variant="body2" color="textSecondary">
                Przeciągnij plik PDB lub kliknij
              </Typography>
            </Box>
          </ListItem>
          
          <Divider />
          
          {/* Przykładowe struktury */}
          <ListItem>
            <ListItemText primary="Przykładowe struktury" />
          </ListItem>
          {exampleStructures.map((struct) => (
            <ListItem
              key={struct.id}
              button
              onClick={() => {
                if (struct.type === 'pdb') {
                  loadFromPDB(struct.id);
                } else {
                  loadFromAlphaFold(struct.id);
                }
              }}
            >
              <ListItemText
                primary={struct.name}
                secondary={struct.id}
              />
            </ListItem>
          ))}
          
          <Divider />
          
          {/* Opcje wizualizacji */}
          <ListItem>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Opcje wizualizacji" />
          </ListItem>
          
          <ListItem>
            <FormControl fullWidth size="small">
              <InputLabel>Styl renderowania</InputLabel>
              <Select
                value={renderStyle}
                onChange={(e) => setRenderStyle(e.target.value as any)}
              >
                <MenuItem value="cartoon">Cartoon</MenuItem>
                <MenuItem value="ball-stick">Ball & Stick</MenuItem>
                <MenuItem value="stick">Stick</MenuItem>
                <MenuItem value="surface">Surface</MenuItem>
                <MenuItem value="ribbon">Ribbon</MenuItem>
              </Select>
            </FormControl>
          </ListItem>
          
          <ListItem>
            <FormControl fullWidth size="small">
              <InputLabel>Schemat kolorów</InputLabel>
              <Select
                value={colorScheme}
                onChange={(e) => setColorScheme(e.target.value as any)}
              >
                <MenuItem value="chain">Łańcuch</MenuItem>
                <MenuItem value="secondary">Struktura 2°</MenuItem>
                <MenuItem value="bfactor">B-factor</MenuItem>
                <MenuItem value="hydrophobicity">Hydrofobowość</MenuItem>
                <MenuItem value="element">Pierwiastek</MenuItem>
              </Select>
            </FormControl>
          </ListItem>
          
          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  checked={showHydrogenBonds}
                  onChange={(e) => setShowHydrogenBonds(e.target.checked)}
                />
              }
              label="Wiązania wodorowe"
            />
          </ListItem>
          
          <ListItem>
            <FormControlLabel
              control={
                <Switch
                  checked={showWater}
                  onChange={(e) => setShowWater(e.target.checked)}
                />
              }
              label="Cząsteczki wody"
            />
          </ListItem>
        </List>
      </Drawer>
      
      {/* Główna zawartość */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          mt: 8,
          ml: drawerOpen ? '300px' : 0,
          transition: 'margin 0.3s'
        }}
      >
        <Grid container spacing={3}>
          {/* Viewer 3D */}
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 2, height: '70vh' }}>
              {isLoading && (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                  <CircularProgress />
                </Box>
              )}
              
              {!isLoading && !animation && (
                <Box display="flex" justifyContent="center" alignItems="center" height="100%">
                  <Typography variant="h6" color="textSecondary">
                    Załaduj strukturę molekularną
                  </Typography>
                </Box>
              )}
              
              {!isLoading && animation && (
                <VectorDiffPlayer
                  animation={animation}
                  renderer="webgl"
                  controls={true}
                  medicalMode="molecular"
                  onTimeUpdate={setCurrentTime}
                />
              )}
            </Paper>
          </Grid>
          
          {/* Panel informacji */}
          <Grid item xs={12} lg={4}>
            <Paper sx={{ height: '70vh' }}>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
                <Tab label="Struktura" />
                <Tab label="Sekwencja" />
                <Tab label="Analiza" />
              </Tabs>
              
              <TabPanel value={tabValue} index={0}>
                {animation && <StructurePanel animation={animation} />}
              </TabPanel>
              
              <TabPanel value={tabValue} index={1}>
                {animation && <SequenceViewer animation={animation} />}
              </TabPanel>
              
              <TabPanel value={tabValue} index={2}>
                {animation && <AnalysisPanel animation={animation} />}
              </TabPanel>
            </Paper>
          </Grid>
          
          {/* Timeline konformacji */}
          {animation && animation.timeline.length > 1 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <ConformationTimeline
                  animation={animation}
                  currentTime={currentTime}
                  onSeek={(time) => {
                    // Seek w playerze
                  }}
                />
              </Paper>
            </Grid>
          )}
        </Grid>
        
        {/* SpeedDial z akcjami */}
        <SpeedDial
          ariaLabel="Akcje"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          icon={<SpeedDialIcon />}
        >
          <SpeedDialAction
            icon={<DownloadIcon />}
            tooltipTitle="Eksportuj"
            onClick={exportAnimation}
          />
          <SpeedDialAction
            icon={<CompareArrowsIcon />}
            tooltipTitle="Porównaj struktury"
            onClick={() => {/* TODO */}}
          />
          <SpeedDialAction
            icon={<TimelineIcon />}
            tooltipTitle="Analiza konformacji"
            onClick={analyzeConformations}
          />
          <SpeedDialAction
            icon={<AssessmentIcon />}
            tooltipTitle="Statystyki"
            onClick={() => {/* TODO */}}
          />
        </SpeedDial>
      </Box>
      
      {/* Snackbar z błędami */}
      <Snackbar
        open={!!error}
        autoHideDuration={6000}
        onClose={() => setError(null)}
      >
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
