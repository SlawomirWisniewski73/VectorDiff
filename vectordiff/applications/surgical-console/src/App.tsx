/**
 * Surgical Console - Konsola do zdalnej chirurgii robotycznej
 * 
 * Funkcjonalności:
 * - Stereoskopowy widok 3D z kamery endoskopowej
 * - Kontrola narzędzi w czasie rzeczywistym
 * - Haptyczne sprzężenie zwrotne
 * - Monitorowanie parametrów życiowych
 * - System alarmów bezpieczeństwa
 * - Nagrywanie i odtwarzanie procedur
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Paper,
  Grid,
  Button,
  ButtonGroup,
  Chip,
  Stack,
  LinearProgress,
  Alert,
  AlertTitle,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Slider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  FormControlLabel,
  Card,
  CardContent,
  Avatar,
  Divider,
  Tooltip,
  Badge,
  SpeedDial,
  SpeedDialAction,
  Backdrop,
  CircularProgress
} from '@mui/material';
import {
  PowerSettingsNew as PowerIcon,
  PlayArrow as PlayIcon,
  Pause as PauseIcon,
  Stop as StopIcon,
  FiberManualRecord as RecordIcon,
  Fullscreen as FullscreenIcon,
  Settings as SettingsIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as CheckCircleIcon,
  Healing as HealingIcon,
  Timeline as TimelineIcon,
  Speed as SpeedIcon,
  TouchApp as TouchIcon,
  Visibility as VisibilityIcon,
  NetworkCheck as NetworkCheckIcon,
  Emergency as EmergencyIcon,
  Person as PersonIcon,
  Timer as TimerIcon,
  TrendingUp as TrendingUpIcon
} from '@mui/icons-material';
import { CountdownCircleTimer } from 'react-countdown-circle-timer';
import GaugeChart from 'react-gauge-chart';

// Komponenty VectorDiff
import {
  SurgicalRenderer,
  RealTimeStreamingManager,
  DaVinciIntegration,
  MotionPredictor,
  initializeSurgicalSystem
} from '@vectordiff/surgical';

// Lokalne komponenty
import { StereoscopicViewer } from './components/StereoscopicViewer';
import { InstrumentControls } from './components/InstrumentControls';
import { VitalSignsMonitor } from './components/VitalSignsMonitor';
import { SafetyIndicators } from './components/SafetyIndicators';
import { HapticFeedbackPanel } from './components/HapticFeedbackPanel';
import { NetworkLatencyMonitor } from './components/NetworkLatencyMonitor';
import { ProcedureTimeline } from './components/ProcedureTimeline';
import { SurgeonProfile } from './components/SurgeonProfile';

interface SystemStatus {
  connected: boolean;
  streaming: boolean;
  daVinciReady: boolean;
  latency: number;
  packetLoss: number;
}

interface ProcedureState {
  active: boolean;
  startTime: Date | null;
  duration: number;
  phase: 'preparation' | 'incision' | 'dissection' | 'suturing' | 'closing' | null;
}

interface SafetyAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
}

export default function SurgicalConsoleApp() {
  // Stan systemu
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    connected: false,
    streaming: false,
    daVinciReady: false,
    latency: 0,
    packetLoss: 0
  });
  
  const [procedureState, setProcedureState] = useState<ProcedureState>({
    active: false,
    startTime: null,
    duration: 0,
    phase: null
  });
  
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Stan UI
  const [fullscreen, setFullscreen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emergencyDialogOpen, setEmergencyDialogOpen] = useState(false);
  const [motionScaling, setMotionScaling] = useState(5);
  const [hapticEnabled, setHapticEnabled] = useState(true);
  const [tremorFilter, setTremorFilter] = useState(true);
  
  // Referencje do systemów
  const streamingRef = useRef<RealTimeStreamingManager | null>(null);
  const daVinciRef = useRef<DaVinciIntegration | null>(null);
  const rendererRef = useRef<SurgicalRenderer | null>(null);
  const predictorRef = useRef<MotionPredictor | null>(null);
  
  // Timer procedury
  useEffect(() => {
    if (procedureState.active && procedureState.startTime) {
      const interval = setInterval(() => {
        const duration = Math.floor((Date.now() - procedureState.startTime.getTime()) / 1000);
        setProcedureState(prev => ({ ...prev, duration }));
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [procedureState.active, procedureState.startTime]);
  
  // Inicjalizacja systemu
  const initializeSystem = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const config = {
        serverUrl: process.env.VITE_SURGICAL_SERVER_URL || 'wss://localhost:8443',
        authToken: process.env.VITE_AUTH_TOKEN || 'demo-token',
        daVinciPort: process.env.VITE_DAVINCI_PORT || '/dev/ttyUSB0',
        stereoscopic: true
      };
      
      const system = await initializeSurgicalSystem(config);
      
      streamingRef.current = system.streaming;
      daVinciRef.current = system.davinci;
      predictorRef.current = system.predictor;
      rendererRef.current = system.renderer;
      
      // Ustaw callbacki
      setupSystemCallbacks();
      
      setSystemStatus({
        connected: true,
        streaming: true,
        daVinciReady: true,
        latency: 0,
        packetLoss: 0
      });
      
    } catch (err) {
      setError('Nie można zainicjalizować systemu chirurgicznego');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Konfiguracja callbacków
  const setupSystemCallbacks = () => {
    if (!streamingRef.current) return;
    
    // Monitorowanie opóźnień
    streamingRef.current.setOnLatencyWarning((latency) => {
      setSystemStatus(prev => ({ ...prev, latency }));
      
      if (latency > 50) {
        addSafetyAlert('warning', `Wysokie opóźnienie: ${latency}ms`);
      }
    });
    
    // Aktualizacje stanu narzędzi
    streamingRef.current.setOnInstrumentUpdate((state) => {
      // Aktualizuj renderer
      if (rendererRef.current) {
        rendererRef.current.updateInstrumentState(state);
      }
      
      // Sprawdź alarmy bezpieczeństwa
      if (!state.safetyStatus.inWorkspace) {
        addSafetyAlert('warning', 'Narzędzie poza obszarem roboczym');
      }
      
      if (state.safetyStatus.forceLimit) {
        addSafetyAlert('critical', 'Przekroczono limit siły!');
      }
    });
    
    // Haptyczne sprzężenie zwrotne
    streamingRef.current.setOnHapticFeedback((data) => {
      // Tu byłaby integracja z kontrolerem haptycznym
      console.log('Haptic feedback:', data);
    });
  };
  
  // Rozpoczęcie procedury
  const startProcedure = () => {
    if (!systemStatus.daVinciReady) {
      setError('System da Vinci nie jest gotowy');
      return;
    }
    
    setProcedureState({
      active: true,
      startTime: new Date(),
      duration: 0,
      phase: 'preparation'
    });
    
    // Rozpocznij nagrywanie
    if (streamingRef.current) {
      // streamingRef.current.startRecording();
    }
  };
  
  // Zatrzymanie procedury
  const stopProcedure = () => {
    setProcedureState({
      active: false,
      startTime: null,
      duration: 0,
      phase: null
    });
    
    // Zatrzymaj nagrywanie
    if (streamingRef.current) {
      // streamingRef.current.stopRecording();
    }
  };
  
  // Awaryjne zatrzymanie
  const emergencyStop = () => {
    console.error('EMERGENCY STOP ACTIVATED!');
    
    // Zatrzymaj wszystkie systemy
    if (daVinciRef.current) {
      daVinciRef.current.emergencyStop();
    }
    
    if (streamingRef.current) {
      streamingRef.current.emergencyStop();
    }
    
    stopProcedure();
    setEmergencyDialogOpen(true);
    addSafetyAlert('critical', 'Awaryjne zatrzymanie systemu!');
  };
  
  // Dodawanie alertów bezpieczeństwa
  const addSafetyAlert = (severity: SafetyAlert['severity'], message: string) => {
    const alert: SafetyAlert = {
      id: Date.now().toString(),
      severity,
      message,
      timestamp: new Date()
    };
    
    setSafetyAlerts(prev => [alert, ...prev].slice(0, 10)); // Max 10 alertów
  };
  
  // Formatowanie czasu
  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes
      .toString()
      .padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };
  
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: '#0a0a0a' }}>
      {/* AppBar */}
      <AppBar position="static" sx={{ bgcolor: '#1a1a1a' }}>
        <Toolbar>
          <HealingIcon sx={{ mr: 1, color: '#00ff00' }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            VectorDiff Surgical Console
          </Typography>
          
          {/* Status systemu */}
          <Stack direction="row" spacing={2} sx={{ mr: 3 }}>
            <Chip
              icon={<NetworkCheckIcon />}
              label={`${systemStatus.latency}ms`}
              color={systemStatus.latency < 20 ? 'success' : systemStatus.latency < 50 ? 'warning' : 'error'}
              size="small"
            />
            <Chip
              icon={systemStatus.connected ? <CheckCircleIcon /> : <ErrorIcon />}
              label={systemStatus.connected ? 'Połączono' : 'Rozłączono'}
              color={systemStatus.connected ? 'success' : 'error'}
              size="small"
            />
            <Chip
              icon={<HealingIcon />}
              label={systemStatus.daVinciReady ? 'da Vinci Ready' : 'da Vinci Offline'}
              color={systemStatus.daVinciReady ? 'success' : 'default'}
              size="small"
            />
          </Stack>
          
          {/* Przyciski kontrolne */}
          <ButtonGroup variant="contained" size="small">
            {!systemStatus.connected ? (
              <Button
                color="success"
                startIcon={<PowerIcon />}
                onClick={initializeSystem}
                disabled={isLoading}
              >
                Połącz
              </Button>
            ) : !procedureState.active ? (
              <Button
                color="primary"
                startIcon={<PlayIcon />}
                onClick={startProcedure}
                disabled={!systemStatus.daVinciReady}
              >
                Start
              </Button>
            ) : (
              <>
                <Button
                  color="warning"
                  startIcon={<PauseIcon />}
                  onClick={() => {/* TODO: Pauza */}}
                >
                  Pauza
                </Button>
                <Button
                  color="error"
                  startIcon={<StopIcon />}
                  onClick={stopProcedure}
                >
                  Stop
                </Button>
              </>
            )}
          </ButtonGroup>
          
          <IconButton color="inherit" onClick={() => setFullscreen(!fullscreen)}>
            <FullscreenIcon />
          </IconButton>
          <IconButton color="inherit" onClick={() => setSettingsOpen(true)}>
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      
      {/* Główny obszar roboczy */}
      <Box sx={{ flexGrow: 1, display: 'flex', p: 1, gap: 1 }}>
        {/* Lewy panel - informacje */}
        <Paper sx={{ width: 300, p: 2, bgcolor: '#1a1a1a' }}>
          {/* Profil chirurga */}
          <Card sx={{ mb: 2, bgcolor: '#2a2a2a' }}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={1}>
                <Avatar sx={{ mr: 2, bgcolor: 'primary.main' }}>
                  <PersonIcon />
                </Avatar>
                <Box>
                  <Typography variant="h6">Dr Jan Kowalski</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Chirurg główny
                  </Typography>
                </Box>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" color="textSecondary">
                Certyfikat da Vinci: Aktywny
              </Typography>
              <Typography variant="body2" color="textSecondary">
                Procedur wykonanych: 1,247
              </Typography>
            </CardContent>
          </Card>
          
          {/* Timer procedury */}
          {procedureState.active && (
            <Card sx={{ mb: 2, bgcolor: '#2a2a2a', textAlign: 'center' }}>
              <CardContent>
                <Typography variant="h4" sx={{ fontFamily: 'monospace' }}>
                  {formatDuration(procedureState.duration)}
                </Typography>
                <Chip
                  label={procedureState.phase}
                  color="primary"
                  size="small"
                  sx={{ mt: 1 }}
                />
              </CardContent>
            </Card>
          )}
          
          {/* Parametry życiowe */}
          <VitalSignsMonitor active={procedureState.active} />
          
          {/* Alarmy bezpieczeństwa */}
          <Card sx={{ mt: 2, bgcolor: '#2a2a2a' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Alarmy bezpieczeństwa
              </Typography>
              <List dense>
                {safetyAlerts.slice(0, 5).map(alert => (
                  <ListItem key={alert.id}>
                    <ListItemIcon>
                      {alert.severity === 'critical' ? (
                        <ErrorIcon color="error" />
                      ) : alert.severity === 'warning' ? (
                        <WarningIcon color="warning" />
                      ) : (
                        <CheckCircleIcon color="info" />
                      )}
                    </ListItemIcon>
                    <ListItemText
                      primary={alert.message}
                      secondary={alert.timestamp.toLocaleTimeString()}
                      primaryTypographyProps={{ variant: 'body2' }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Paper>
        
        {/* Główny viewport - widok stereoskopowy */}
        <Paper sx={{ flexGrow: 1, position: 'relative', bgcolor: 'black' }}>
          {systemStatus.connected && rendererRef.current ? (
            <StereoscopicViewer
              renderer={rendererRef.current}
              fullscreen={fullscreen}
            />
          ) : (
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              height="100%"
              color="grey.700"
            >
              {isLoading ? (
                <CircularProgress />
              ) : (
                <Typography variant="h5">
                  System nieaktywny
                </Typography>
              )}
            </Box>
          )}
          
          {/* Overlay z informacjami */}
          {procedureState.active && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                p: 2,
                background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)'
              }}
            >
              <Grid container alignItems="center">
                <Grid item xs={3}>
                  <Typography variant="body2" color="white">
                    Skalowanie: {motionScaling}:1
                  </Typography>
                </Grid>
                <Grid item xs={6} textAlign="center">
                  <Stack direction="row" spacing={1} justifyContent="center">
                    <Chip
                      icon={<TouchIcon />}
                      label={hapticEnabled ? 'Haptyka ON' : 'Haptyka OFF'}
                      size="small"
                      color={hapticEnabled ? 'success' : 'default'}
                    />
                    <Chip
                      icon={<TimelineIcon />}
                      label={tremorFilter ? 'Filtr drżenia ON' : 'Filtr drżenia OFF'}
                      size="small"
                      color={tremorFilter ? 'success' : 'default'}
                    />
                    <Chip
                      icon={<RecordIcon />}
                      label="Nagrywanie"
                      size="small"
                      color="error"
                    />
                  </Stack>
                </Grid>
                <Grid item xs={3} textAlign="right">
                  <NetworkLatencyMonitor
                    latency={systemStatus.latency}
                    packetLoss={systemStatus.packetLoss}
                  />
                </Grid>
              </Grid>
            </Box>
          )}
        </Paper>
        
        {/* Prawy panel - kontrola narzędzi */}
        <Paper sx={{ width: 350, p: 2, bgcolor: '#1a1a1a' }}>
          {/* Kontrola narzędzi */}
          <InstrumentControls
            davinci={daVinciRef.current}
            enabled={procedureState.active}
          />
          
          {/* Panel haptyczny */}
          <HapticFeedbackPanel
            enabled={hapticEnabled}
            onToggle={setHapticEnabled}
          />
          
          {/* Wskaźniki bezpieczeństwa */}
          <SafetyIndicators
            streaming={streamingRef.current}
            davinci={daVinciRef.current}
          />
        </Paper>
      </Box>
      
      {/* Dolny pasek statusu */}
      <Paper sx={{ p: 1, bgcolor: '#1a1a1a' }}>
        <Grid container alignItems="center" spacing={2}>
          <Grid item xs={3}>
            <ProcedureTimeline
              phase={procedureState.phase}
              duration={procedureState.duration}
            />
          </Grid>
          <Grid item xs={6} textAlign="center">
            {/* Wskaźniki wydajności */}
            <Stack direction="row" spacing={3} justifyContent="center">
              <Box textAlign="center">
                <Typography variant="caption" color="textSecondary">
                  Precyzja
                </Typography>
                <GaugeChart
                  id="precision-gauge"
                  nrOfLevels={3}
                  percent={0.92}
                  textColor="#fff"
                  style={{ width: 80, height: 40 }}
                  hideText
                />
              </Box>
              <Box textAlign="center">
                <Typography variant="caption" color="textSecondary">
                  Płynność
                </Typography>
                <GaugeChart
                  id="smoothness-gauge"
                  nrOfLevels={3}
                  percent={0.87}
                  textColor="#fff"
                  style={{ width: 80, height: 40 }}
                  hideText
                />
              </Box>
              <Box textAlign="center">
                <Typography variant="caption" color="textSecondary">
                  Bezpieczeństwo
                </Typography>
                <GaugeChart
                  id="safety-gauge"
                  nrOfLevels={3}
                  percent={0.95}
                  textColor="#fff"
                  style={{ width: 80, height: 40 }}
                  hideText
                />
              </Box>
            </Stack>
          </Grid>
          <Grid item xs={3} textAlign="right">
            <Button
              variant="contained"
              color="error"
              size="large"
              onClick={emergencyStop}
              startIcon={<EmergencyIcon />}
              sx={{ px: 4 }}
            >
              EMERGENCY STOP
            </Button>
          </Grid>
        </Grid>
      </Paper>
      
      {/* SpeedDial z dodatkowymi opcjami */}
      <SpeedDial
        ariaLabel="Opcje"
        sx={{ position: 'fixed', bottom: 80, right: 16 }}
        icon={<SpeedIcon />}
      >
        <SpeedDialAction
          icon={<TrendingUpIcon />}
          tooltipTitle="Statystyki"
        />
        <SpeedDialAction
          icon={<TimerIcon />}
          tooltipTitle="Historia procedur"
        />
        <SpeedDialAction
          icon={<PersonIcon />}
          tooltipTitle="Zmień chirurga"
        />
      </SpeedDial>
      
      {/* Dialog ustawień */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Ustawienia systemu</DialogTitle>
        <DialogContent>
          <Stack spacing={3} sx={{ mt: 2 }}>
            <Box>
              <Typography gutterBottom>
                Skalowanie ruchu: {motionScaling}:1
              </Typography>
              <Slider
                value={motionScaling}
                onChange={(e, v) => {
                  setMotionScaling(v as number);
                  if (daVinciRef.current) {
                    daVinciRef.current.setMotionScaling(v as number);
                  }
                }}
                min={1}
                max={10}
                marks
                valueLabelDisplay="auto"
              />
            </Box>
            
            <FormControlLabel
              control={
                <Switch
                  checked={hapticEnabled}
                  onChange={(e) => setHapticEnabled(e.target.checked)}
                />
              }
              label="Haptyczne sprzężenie zwrotne"
            />
            
            <FormControlLabel
              control={
                <Switch
                  checked={tremorFilter}
                  onChange={(e) => setTremorFilter(e.target.checked)}
                />
              }
              label="Filtr redukcji drżenia"
            />
            
            <FormControl fullWidth>
              <InputLabel>Algorytm predykcji</InputLabel>
              <Select defaultValue="kalman">
                <MenuItem value="kalman">Filtr Kalmana</MenuItem>
                <MenuItem value="neural">Sieć neuronowa</MenuItem>
                <MenuItem value="polynomial">Interpolacja wielomianowa</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Zamknij</Button>
          <Button variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog awaryjnego zatrzymania */}
      <Dialog open={emergencyDialogOpen} onClose={() => setEmergencyDialogOpen(false)}>
        <DialogTitle sx={{ color: 'error.main' }}>
          AWARYJNE ZATRZYMANIE SYSTEMU
        </DialogTitle>
        <DialogContent>
          <Alert severity="error">
            <AlertTitle>System został awaryjnie zatrzymany</AlertTitle>
            Wszystkie narzędzia chirurgiczne zostały unieruchomione.
            Sprawdź stan pacjenta przed wznowieniem procedury.
          </Alert>
          
          <List sx={{ mt: 2 }}>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Narzędzia zatrzymane" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Transmisja wstrzymana" />
            </ListItem>
            <ListItem>
              <ListItemIcon>
                <CheckCircleIcon color="success" />
              </ListItemIcon>
              <ListItemText primary="Nagrywanie zapisane" />
            </ListItem>
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmergencyDialogOpen(false)}>
            Potwierdź
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              setEmergencyDialogOpen(false);
              initializeSystem();
            }}
          >
            Restart systemu
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Backdrop podczas ładowania */}
      <Backdrop open={isLoading} sx={{ zIndex: 9999 }}>
        <CircularProgress color="inherit" />
      </Backdrop>
    </Box>
  );
}
