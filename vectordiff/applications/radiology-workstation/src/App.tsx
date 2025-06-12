/**
 * Radiology Workstation - Zaawansowana stacja robocza dla radiologów
 * 
 * Funkcjonalności:
 * - Multi-planar reconstruction (MPR)
 * - Porównywanie badań w czasie
 * - Automatyczna detekcja i śledzenie zmian
 * - Pomiary i adnotacje
 * - Generowanie raportów progresji
 * - Integracja z PACS
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Paper,
  Grid,
  Button,
  ButtonGroup,
  ToggleButton,
  ToggleButtonGroup,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Chip,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
  Alert,
  Snackbar,
  Tabs,
  Tab,
  Badge,
  Tooltip,
  SpeedDial,
  SpeedDialAction,
  Card,
  CardContent,
  CardMedia,
  CardActions
} from '@mui/material';
import {
  Menu as MenuIcon,
  Folder as FolderIcon,
  Compare as CompareIcon,
  Timeline as TimelineIcon,
  Assessment as AssessmentIcon,
  LocalHospital as LocalHospitalIcon,
  Straighten as StraightenIcon,
  Draw as DrawIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Brightness4 as BrightnessIcon,
  Contrast as ContrastIcon,
  ViewInAr as ViewInArIcon,
  GridOn as GridOnIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Description as DescriptionIcon,
  Print as PrintIcon,
  Share as ShareIcon
} from '@mui/icons-material';
import { format, differenceInDays } from 'date-fns';
import { Line } from 'react-chartjs-2';

// Komponenty VectorDiff
import {
  RadiologyAnimation,
  MedicalImageRenderer,
  DiseaseProgressionAnalyzer,
  parseDICOMSeries,
  analyzeProgression,
  calculateRECIST
} from '@vectordiff/radiology';

// Lokalne komponenty
import { ViewportGrid } from './components/ViewportGrid';
import { MeasurementTools } from './components/MeasurementTools';
import { SegmentationPanel } from './components/SegmentationPanel';
import { ProgressionChart } from './components/ProgressionChart';
import { ReportGenerator } from './components/ReportGenerator';
import { PACSBrowser } from './components/PACSBrowser';

interface Study {
  id: string;
  patientName: string;
  patientId: string;
  studyDate: Date;
  modality: string;
  description: string;
  animation?: RadiologyAnimation;
}

interface ComparisonResult {
  baseline: Study;
  followup: Study;
  findings: any[];
  volumeChanges: any[];
  summary: any;
}

export default function RadiologyWorkstationApp() {
  // Stan główny
  const [studies, setStudies] = useState<Study[]>([]);
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [comparisonMode, setComparisonMode] = useState(false);
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stan UI
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'axial' | 'sagittal' | 'coronal' | '3d'>('axial');
  const [windowingPreset, setWindowingPreset] = useState('soft-tissue');
  const [measurementTool, setMeasurementTool] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  
  // Referencje
  const rendererRef = useRef<MedicalImageRenderer | null>(null);
  
  // Przykładowe badania (w praktyce z PACS)
  useEffect(() => {
    const mockStudies: Study[] = [
      {
        id: 'ST001',
        patientName: 'Jan Kowalski',
        patientId: 'P12345',
        studyDate: new Date('2024-01-15'),
        modality: 'CT',
        description: 'CT klatki piersiowej - badanie wyjściowe'
      },
      {
        id: 'ST002',
        patientName: 'Jan Kowalski',
        patientId: 'P12345',
        studyDate: new Date('2024-04-15'),
        modality: 'CT',
        description: 'CT klatki piersiowej - kontrola 3 mies.'
      },
      {
        id: 'ST003',
        patientName: 'Jan Kowalski',
        patientId: 'P12345',
        studyDate: new Date('2024-07-15'),
        modality: 'CT',
        description: 'CT klatki piersiowej - kontrola 6 mies.'
      }
    ];
    setStudies(mockStudies);
  }, []);
  
  // Ładowanie badania
  const loadStudy = async (study: Study) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // W praktyce ładowanie z PACS
      // Symulacja ładowania
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Tworzenie przykładowej animacji
      const animation: RadiologyAnimation = {
        version: '0.2',
        metadata: {
          author: 'PACS System',
          creationDate: study.studyDate.toISOString(),
          duration: 0,
          patientId: study.patientId,
          studyId: study.id
        },
        baseScene: {
          canvas: { width: 512, height: 512, depth: 200 },
          objects: []
        },
        timeline: [],
        imagingData: {
          modality: study.modality as any,
          studyDate: study.studyDate.toISOString(),
          studyDescription: study.description,
          acquisitionParameters: {
            pixelSpacing: [0.7, 0.7],
            sliceThickness: 3.0
          }
        },
        segmentations: [
          {
            segmentationId: 'lung_tumor_1',
            anatomicalStructure: {
              name: 'Guzek płuca',
              category: 'lesion'
            },
            segmentationType: 'semi-automatic',
            volume: 12.5, // cm³
            boundingBox: {
              min: [100, 150, 50],
              max: [150, 200, 80]
            },
            representation: {
              type: 'mesh',
              vertices: [],
              faces: []
            }
          }
        ]
      };
      
      study.animation = animation;
      setSelectedStudy(study);
      
    } catch (err) {
      setError('Błąd ładowania badania');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Porównywanie badań
  const compareStudies = async (baseline: Study, followup: Study) => {
    if (!baseline.animation || !followup.animation) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const analyzer = new DiseaseProgressionAnalyzer();
      const result = analyzer.analyzeProgression(
        baseline.animation,
        followup.animation,
        { animationDuration: 3000 }
      );
      
      setComparisonResult({
        baseline,
        followup,
        findings: result.findings,
        volumeChanges: result.volumeChanges,
        summary: result.summary
      });
      
      setComparisonMode(true);
      
    } catch (err) {
      setError('Błąd analizy porównawczej');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Zmiana okna
  const applyWindowingPreset = (preset: string) => {
    if (!rendererRef.current) return;
    
    const presets: { [key: string]: { center: number, width: number } } = {
      'bone': { center: 300, width: 1500 },
      'lung': { center: -600, width: 1500 },
      'soft-tissue': { center: 40, width: 400 },
      'brain': { center: 40, width: 80 },
      'liver': { center: 60, width: 150 }
    };
    
    const settings = presets[preset];
    if (settings) {
      rendererRef.current.setWindowing(settings.center, settings.width);
    }
  };
  
  // Generowanie raportu
  const generateReport = () => {
    setReportDialogOpen(true);
  };
  
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
          <LocalHospitalIcon sx={{ mr: 1 }} />
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            VectorDiff Radiology Workstation
          </Typography>
          {selectedStudy && (
            <Stack direction="row" spacing={1}>
              <Chip
                label={selectedStudy.patientName}
                color="primary"
                size="small"
              />
              <Chip
                label={format(selectedStudy.studyDate, 'dd.MM.yyyy')}
                size="small"
              />
              {comparisonMode && (
                <Chip
                  label="Tryb porównawczy"
                  color="secondary"
                  size="small"
                  icon={<CompareIcon />}
                />
              )}
            </Stack>
          )}
        </Toolbar>
      </AppBar>
      
      {/* Drawer z listą badań */}
      <Drawer
        variant="persistent"
        anchor="left"
        open={drawerOpen}
        sx={{
          width: 350,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 350,
            boxSizing: 'border-box',
            mt: 8
          }
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Lista badań
          </Typography>
          
          {/* Filtrowanie/sortowanie */}
          <Stack direction="row" spacing={1} mb={2}>
            <FormControl size="small" fullWidth>
              <InputLabel>Modalność</InputLabel>
              <Select defaultValue="all">
                <MenuItem value="all">Wszystkie</MenuItem>
                <MenuItem value="CT">CT</MenuItem>
                <MenuItem value="MR">MR</MenuItem>
                <MenuItem value="XR">RTG</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" startIcon={<FolderIcon />}>
              PACS
            </Button>
          </Stack>
          
          {/* Lista badań pogrupowana po pacjentach */}
          <List>
            {studies.map((study, index) => (
              <React.Fragment key={study.id}>
                {index === 0 || studies[index - 1].patientId !== study.patientId ? (
                  <>
                    <Divider />
                    <ListItem>
                      <ListItemText
                        primary={study.patientName}
                        secondary={`ID: ${study.patientId}`}
                        primaryTypographyProps={{ fontWeight: 'bold' }}
                      />
                    </ListItem>
                  </>
                ) : null}
                
                <Card sx={{ mx: 1, mb: 1 }}>
                  <CardContent sx={{ pb: 1 }}>
                    <Typography variant="body2" color="textSecondary">
                      {format(study.studyDate, 'dd.MM.yyyy HH:mm')}
                    </Typography>
                    <Typography variant="body1">
                      {study.description}
                    </Typography>
                    <Stack direction="row" spacing={1} mt={1}>
                      <Chip label={study.modality} size="small" />
                      {study.animation && (
                        <Chip
                          label="Załadowane"
                          color="success"
                          size="small"
                          icon={<CheckCircleIcon />}
                        />
                      )}
                    </Stack>
                  </CardContent>
                  <CardActions>
                    <Button
                      size="small"
                      onClick={() => loadStudy(study)}
                      disabled={isLoading}
                    >
                      Otwórz
                    </Button>
                    {index > 0 && study.animation && studies[index - 1].animation && (
                      <Button
                        size="small"
                        color="secondary"
                        onClick={() => compareStudies(studies[index - 1], study)}
                        startIcon={<CompareIcon />}
                      >
                        Porównaj
                      </Button>
                    )}
                  </CardActions>
                </Card>
              </React.Fragment>
            ))}
          </List>
        </Box>
      </Drawer>
      
      {/* Główna zawartość */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 2,
          mt: 8,
          ml: drawerOpen ? '350px' : 0,
          transition: 'margin 0.3s'
        }}
      >
        <Grid container spacing={2} sx={{ height: 'calc(100vh - 80px)' }}>
          {/* Viewports */}
          <Grid item xs={12} lg={comparisonMode ? 6 : 8}>
            <Paper sx={{ height: '100%', p: 1 }}>
              {/* Toolbar viewportu */}
              <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <ToggleButtonGroup
                  value={viewMode}
                  exclusive
                  onChange={(e, v) => v && setViewMode(v)}
                  size="small"
                >
                  <ToggleButton value="axial">Axial</ToggleButton>
                  <ToggleButton value="sagittal">Sagittal</ToggleButton>
                  <ToggleButton value="coronal">Coronal</ToggleButton>
                  <ToggleButton value="3d">3D</ToggleButton>
                </ToggleButtonGroup>
                
                <Divider orientation="vertical" flexItem />
                
                <ButtonGroup size="small">
                  <Button startIcon={<ZoomInIcon />}>Zoom</Button>
                  <Button startIcon={<BrightnessIcon />}>Window</Button>
                  <Button startIcon={<GridOnIcon />}>Grid</Button>
                </ButtonGroup>
                
                <Box sx={{ flexGrow: 1 }} />
                
                <FormControl size="small" sx={{ minWidth: 120 }}>
                  <Select
                    value={windowingPreset}
                    onChange={(e) => {
                      setWindowingPreset(e.target.value);
                      applyWindowingPreset(e.target.value);
                    }}
                  >
                    <MenuItem value="bone">Kość</MenuItem>
                    <MenuItem value="lung">Płuca</MenuItem>
                    <MenuItem value="soft-tissue">Tkanki miękkie</MenuItem>
                    <MenuItem value="brain">Mózg</MenuItem>
                    <MenuItem value="liver">Wątroba</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              
              {/* Viewport */}
              <Box sx={{ height: 'calc(100% - 50px)', bgcolor: 'black' }}>
                {selectedStudy?.animation && (
                  <MedicalImageRenderer
                    ref={rendererRef}
                    animation={selectedStudy.animation}
                    defaultView={viewMode}
                    enableMeasurementTools={true}
                    enableSegmentationOverlay={true}
                  />
                )}
                
                {!selectedStudy && (
                  <Box
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                    height="100%"
                    color="grey.500"
                  >
                    <Typography variant="h6">
                      Wybierz badanie z listy
                    </Typography>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>
          
          {/* Panel porównawczy */}
          {comparisonMode && comparisonResult && (
            <Grid item xs={12} lg={6}>
              <Paper sx={{ height: '100%', p: 1 }}>
                <Typography variant="h6" gutterBottom>
                  Analiza porównawcza
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="textSecondary">
                    Baseline: {format(comparisonResult.baseline.studyDate, 'dd.MM.yyyy')}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Follow-up: {format(comparisonResult.followup.studyDate, 'dd.MM.yyyy')}
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Odstęp: {differenceInDays(
                      comparisonResult.followup.studyDate,
                      comparisonResult.baseline.studyDate
                    )} dni
                  </Typography>
                </Box>
                
                {/* Podsumowanie zmian */}
                <Stack direction="row" spacing={1} mb={2}>
                  <Chip
                    label={`${comparisonResult.summary.newFindings} nowych`}
                    color="error"
                    icon={<WarningIcon />}
                  />
                  <Chip
                    label={`${comparisonResult.summary.progressingFindings} progresja`}
                    color="warning"
                    icon={<TrendingUpIcon />}
                  />
                  <Chip
                    label={`${comparisonResult.summary.regressingFindings} regresja`}
                    color="success"
                    icon={<TrendingDownIcon />}
                  />
                  <Chip
                    label={`${comparisonResult.summary.stableFindings} stabilne`}
                    color="default"
                  />
                </Stack>
                
                {/* Tabela zmian */}
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Zmiana</TableCell>
                        <TableCell>Baseline</TableCell>
                        <TableCell>Follow-up</TableCell>
                        <TableCell>Zmiana %</TableCell>
                        <TableCell>RECIST</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {comparisonResult.volumeChanges.map((change: any) => (
                        <TableRow key={change.segmentationId}>
                          <TableCell>{change.structureName}</TableCell>
                          <TableCell>{change.baselineVolume.toFixed(1)} cm³</TableCell>
                          <TableCell>{change.followupVolume.toFixed(1)} cm³</TableCell>
                          <TableCell>
                            <Box display="flex" alignItems="center">
                              {change.percentageChange > 0 ? (
                                <TrendingUpIcon color="error" fontSize="small" />
                              ) : (
                                <TrendingDownIcon color="success" fontSize="small" />
                              )}
                              {Math.abs(change.percentageChange).toFixed(1)}%
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={calculateRECIST(
                                change.baselineVolume,
                                change.followupVolume
                              )}
                              size="small"
                              color={
                                calculateRECIST(change.baselineVolume, change.followupVolume) === 'PD'
                                  ? 'error'
                                  : calculateRECIST(change.baselineVolume, change.followupVolume) === 'PR'
                                  ? 'success'
                                  : 'default'
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                {/* Wykres progresji */}
                <Box sx={{ mt: 2, height: 200 }}>
                  <ProgressionChart data={comparisonResult} />
                </Box>
              </Paper>
            </Grid>
          )}
          
          {/* Panel narzędzi/informacji */}
          <Grid item xs={12} lg={comparisonMode ? 12 : 4}>
            <Paper sx={{ height: comparisonMode ? 'auto' : '100%' }}>
              <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
                <Tab label="Pomiary" icon={<StraightenIcon />} />
                <Tab label="Segmentacja" icon={<DrawIcon />} />
                <Tab label="Analiza" icon={<AssessmentIcon />} />
                <Tab label="Raport" icon={<DescriptionIcon />} />
              </Tabs>
              
              <Box sx={{ p: 2 }}>
                {tabValue === 0 && <MeasurementTools />}
                {tabValue === 1 && selectedStudy?.animation && (
                  <SegmentationPanel animation={selectedStudy.animation} />
                )}
                {tabValue === 2 && comparisonResult && (
                  <Box>
                    <Typography variant="h6" gutterBottom>
                      Rekomendacje
                    </Typography>
                    <List>
                      {comparisonResult.summary.recommendations.map((rec: string, idx: number) => (
                        <ListItem key={idx}>
                          <ListItemIcon>
                            <CheckCircleIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText primary={rec} />
                        </ListItem>
                      ))}
                    </List>
                  </Box>
                )}
                {tabValue === 3 && (
                  <Box>
                    <Button
                      variant="contained"
                      fullWidth
                      startIcon={<DescriptionIcon />}
                      onClick={generateReport}
                      sx={{ mb: 2 }}
                    >
                      Generuj raport
                    </Button>
                    <Button
                      variant="outlined"
                      fullWidth
                      startIcon={<PrintIcon />}
                    >
                      Drukuj
                    </Button>
                  </Box>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
        
        {/* SpeedDial z szybkimi akcjami */}
        <SpeedDial
          ariaLabel="Szybkie akcje"
          sx={{ position: 'fixed', bottom: 16, right: 16 }}
          icon={<ViewInArIcon />}
        >
          <SpeedDialAction
            icon={<CompareIcon />}
            tooltipTitle="Porównaj badania"
          />
          <SpeedDialAction
            icon={<TimelineIcon />}
            tooltipTitle="Timeline"
          />
          <SpeedDialAction
            icon={<ShareIcon />}
            tooltipTitle="Udostępnij"
          />
        </SpeedDial>
      </Box>
      
      {/* Dialog raportu */}
      <Dialog
        open={reportDialogOpen}
        onClose={() => setReportDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Generowanie raportu</DialogTitle>
        <DialogContent>
          {comparisonResult && (
            <ReportGenerator
              comparisonResult={comparisonResult}
              onComplete={() => setReportDialogOpen(false)}
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReportDialogOpen(false)}>Anuluj</Button>
        </DialogActions>
      </Dialog>
      
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
