/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { isValidMaidenheadLocator } from '../services/dxDistance';
import { Settings, Check, X, Image as ImageIcon, Trash2, Mail, Copy, Trophy, TentTree, ChevronDown, MessageCircle, Camera, Link as LinkIcon, MapPin, Search, LocateFixed, Crosshair } from 'lucide-react';

function gridPointToMaidenhead(latitude: number, longitude: number): string | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  const lon = Math.min(179.999999, Math.max(-180, longitude)) + 180;
  const lat = Math.min(89.999999, Math.max(-90, latitude)) + 90;
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  const remainderLon = lon - fieldLon * 20;
  const remainderLat = lat - fieldLat * 10;
  const squareLon = Math.floor(remainderLon / 2);
  const squareLat = Math.floor(remainderLat);
  const subLon = Math.min(23, Math.floor(((remainderLon - squareLon * 2) / 2) * 24));
  const subLat = Math.min(23, Math.floor((remainderLat - squareLat) * 24));
  return String.fromCharCode(65 + fieldLon, 65 + fieldLat) +
    String(squareLon) + String(squareLat) +
    String.fromCharCode(97 + subLon, 97 + subLat).toUpperCase();
}

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [callsign, setCallsign] = useState('');
  const [gridLocator, setGridLocator] = useState('');
  const gridMapRef = useRef<HTMLDivElement>(null);
  const gridMapInstanceRef = useRef<any>(null);
  const gridMapMarkerRef = useRef<any>(null);
  const [gridPlaceQuery, setGridPlaceQuery] = useState('');
  const [gridPlaceResults, setGridPlaceResults] = useState<Array<{ name: string; lat: number; lon: number }>>([]);
  const [gridSearchBusy, setGridSearchBusy] = useState(false);
  const [gridSearchError, setGridSearchError] = useState('');
  const [gridGpsBusy, setGridGpsBusy] = useState(false);
  const [gridLatitude, setGridLatitude] = useState('');
  const [gridLongitude, setGridLongitude] = useState('');

  const [qraOperator, setQraOperator] = useState('');
  const [qraOperatorSaved, setQraOperatorSaved] = useState(false);
  const [qraOperatorBusy, setQraOperatorBusy] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [isVerifiedCallsign, setIsVerifiedCallsign] = useState(false);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const [defaultEQSLTheme, setDefaultEQSLTheme] = useState('navy');
  const [eqslSoundAlerts, setEqslSoundAlerts] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [gridSaveBusy, setGridSaveBusy] = useState(false);
  const [gridSaveStatus, setGridSaveStatus] = useState('');
  const [callsignSaveBusy, setCallsignSaveBusy] = useState(false);
  const [callsignSaveStatus, setCallsignSaveStatus] = useState('');
  const [communitySection, setCommunitySection] = useState<'competitions' | 'llota' | null>(null);
  const [weeklyHistoryOpen, setWeeklyHistoryOpen] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState<Array<{
    week_start: string;
    callsign: string;
    station_callsign: string;
    qso_date: string;
    qso_time: string;
    band: string;
    frequency: string;
    mode: string;
    votes: number;
    published_at: string;
  }>>([]);
  const [weeklyHistoryLoading, setWeeklyHistoryLoading] = useState(false);
  const [weeklyHistoryError, setWeeklyHistoryError] = useState('');
  const [deviceRecoveryCode, setDeviceRecoveryCode] = useState('');
  const [deviceRecoveryStatus, setDeviceRecoveryStatus] = useState('');
  const [deviceRecoveryBusy, setDeviceRecoveryBusy] = useState(false);
  const [deviceRecoveryOpen, setDeviceRecoveryOpen] = useState(false);
  const [isAdminActor, setIsAdminActor] = useState(false);
  const [adminRecoveryCode, setAdminRecoveryCode] = useState('');
  const [adminRecoveryStatus, setAdminRecoveryStatus] = useState('');
  const [adminRecoveryBusy, setAdminRecoveryBusy] = useState(false);
  const [adminRecoveryTarget, setAdminRecoveryTarget] = useState('');

  const generateAdminRecoveryCode = async () => {
    const token = localStorage.getItem('community_chat_identity_token') || '';
    const currentCall = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const target = adminRecoveryTarget.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (!supabase || !token || currentCall !== 'LU1TSB' || !isAdminActor) {
      setAdminRecoveryStatus('Esta operación requiere la sesión administradora LU1TSB.');
      return;
    }
    if (!target || target.length < 3 || target.length > 24) {
      setAdminRecoveryStatus('Ingresá un indicativo válido para autorizar la recuperación.');
      return;
    }
    setAdminRecoveryBusy(true);
    setAdminRecoveryCode('');
    setAdminRecoveryStatus('');
    try {
      const { data, error } = await supabase.rpc('admin_issue_community_device_recovery', {
        p_admin_token: token,
        p_target_callsign: target,
      });
      if (error || !data?.ok) {
        const reason = String(data?.reason || '');
        setAdminRecoveryStatus(reason === 'not_authorized'
          ? 'La sesión LU1TSB no pudo verificarse como administradora.'
          : reason === 'callsign_not_found'
            ? `No se encontró el indicativo ${target}.`
            : reason === 'rate_limited'
              ? 'El sistema limitó temporalmente la emisión de códigos. Esperá unos minutos y volvé a intentarlo.'
              : 'No se pudo emitir el código. Revisá la conexión e intentá nuevamente.');
        return;
      }
      setAdminRecoveryCode(String(data.code || ''));
      setAdminRecoveryStatus(`Código de un solo uso para ${target}. Vence en 10 minutos; entregalo únicamente al titular.`);
    } finally {
      setAdminRecoveryBusy(false);
    }
  };

  const generateDeviceRecoveryCode = async () => {
    const token = localStorage.getItem('community_chat_identity_token') || '';
    const currentCall = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    if (!supabase || !token || !currentCall) {
      setDeviceRecoveryStatus('Este dispositivo no tiene una identidad verificada disponible.');
      return;
    }
    setDeviceRecoveryBusy(true);
    setDeviceRecoveryCode('');
    setDeviceRecoveryStatus('');
    try {
      const { data, error } = await supabase.rpc('issue_community_device_recovery', {
        p_callsign: currentCall,
        p_authorized_token: token,
      });
      if (error || !data?.ok) {
        const reason = String(data?.reason || '');
        setDeviceRecoveryStatus(reason === 'not_authorized'
          ? 'Solo el teléfono que conserva la autorización principal puede generar el código.'
          : reason === 'rate_limited'
            ? 'El servicio rechazó temporalmente la solicitud. Verificá la conexión y volvé a intentarlo.'
            : 'No se pudo generar el código. Verificá la conexión e intentá nuevamente.');
        return;
      }
      setDeviceRecoveryCode(String(data.code || ''));
      setDeviceRecoveryStatus('Código válido durante 10 minutos. Usalo una sola vez en la PC.');
    } finally {
      setDeviceRecoveryBusy(false);
    }
  };


  useEffect(() => {
    if (isOpen) {
      const verifiedCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      const identityToken = localStorage.getItem('community_chat_identity_token') || '';
      const verifiedOnThisDevice = Boolean(verifiedCallsign && identityToken);
      setIsVerifiedCallsign(verifiedOnThisDevice);
      setIsAdminActor(false);
      setAdminRecoveryCode('');
      setAdminRecoveryStatus('');
      if (supabase && verifiedOnThisDevice) {
        void supabase.rpc('community_actor_role', {
          p_callsign: verifiedCallsign,
          p_token: identityToken,
        }).then(({ data, error }) => {
          setIsAdminActor(!error && verifiedCallsign === 'LU1TSB' && data === 'admin');
        }).catch(() => setIsAdminActor(false));
      }
      setGridLocator((localStorage.getItem('user_grid_locator') || '').trim().toUpperCase());
      setQraOperator('');
      setQraOperatorSaved(false);
      if (supabase && verifiedOnThisDevice) {
        void supabase.rpc('community_profile_qra_status', { p_callsigns: [verifiedCallsign] }).then(({ data, error }) => {
          if (!error && Array.isArray(data)) {
            const qraRow = data.find((row: any) => String(row.callsign || '').trim().toUpperCase() === verifiedCallsign);
            setQraOperator(String(qraRow?.qra_operator || '').trim());
            setQraOperatorSaved(Boolean(qraRow?.accepted));
          }
        }).catch(() => {});
      }
      setProfilePhoto(localStorage.getItem('user_profile_photo') || null);
      setCallsign(verifiedOnThisDevice ? verifiedCallsign : (localStorage.getItem('user_callsign') || ''));
      setCustomBg(localStorage.getItem('eqsl_custom_bg') || null);
      let savedGallery: Array<{ id: string; name: string; dataUrl: string }> = [];
      try {
        savedGallery = JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]');
        setGalleryImages(savedGallery);
      } catch { setGalleryImages([]); }
      setDefaultEQSLTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setEqslSoundAlerts(localStorage.getItem('eqsl_sound_alerts') !== 'false');
      setPushEnabled(false);
      setPushBusy(false);
      setPushStatus('');
      if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => {
          setPushEnabled(Boolean(subscription && Notification.permission === 'granted'));
        }).catch(() => setPushEnabled(false));
      }
      setGridSaveStatus('');
      setCallsignSaveStatus('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !gridMapRef.current) return;
    let cancelled = false;
    const initializeMap = async () => {
      const w = window as any;
      const ensureLeaflet = async () => {
        if (w.L) return w.L;
        if (!document.querySelector('link[data-grid-leaflet]')) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
          link.dataset.gridLeaflet = 'true';
          document.head.appendChild(link);
        }
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector('script[data-grid-leaflet]') as HTMLScriptElement | null;
          if (existing) {
            if (w.L) return resolve();
            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar el mapa.')), { once: true });
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
          script.async = true;
          script.dataset.gridLeaflet = 'true';
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('No se pudo cargar el mapa.'));
          document.head.appendChild(script);
        });
        return w.L;
      };
      try {
        const L = await ensureLeaflet();
        if (cancelled || !gridMapRef.current || gridMapInstanceRef.current) return;
        const currentPoint = maidenheadToPoint(gridLocator);
        const center: [number, number] = currentPoint ? [currentPoint.lat, currentPoint.lon] : [-34.6037, -58.3816];
        const map = L.map(gridMapRef.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true }).setView(center, currentPoint ? 8 : 4);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
        gridMapInstanceRef.current = map;
        const placeMarker = (lat: number, lon: number) => {
          if (!gridMapInstanceRef.current) return;
          if (gridMapMarkerRef.current) gridMapMarkerRef.current.setLatLng([lat, lon]);
          else gridMapMarkerRef.current = L.marker([lat, lon]).addTo(map);
        };
        if (currentPoint) placeMarker(currentPoint.lat, currentPoint.lon);
        map.on('click', (event: any) => {
          const lat = Number(event.latlng.lat);
          const lon = Number(event.latlng.lng);
          const locator = gridPointToMaidenhead(lat, lon);
          if (!locator) return;
          setGridLocator(locator);
          setGridLatitude(lat.toFixed(6));
          setGridLongitude(lon.toFixed(6));
          placeMarker(lat, lon);
          setGridSearchError('');
        });
        window.setTimeout(() => { if (!cancelled && gridMapInstanceRef.current) map.invalidateSize(); }, 120);
      } catch (error) {
        if (!cancelled) setGridSearchError(error instanceof Error ? error.message : 'No se pudo abrir el mapa.');
      }
    };
    void initializeMap();
    return () => {
      cancelled = true;
      if (gridMapInstanceRef.current) gridMapInstanceRef.current.remove();
      gridMapInstanceRef.current = null;
      gridMapMarkerRef.current = null;
    };
  }, [isOpen]);

  const applyGridCoordinates = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      setGridSearchError('Coordenadas inválidas. Latitud: −90 a 90; longitud: −180 a 180.');
      return;
    }
    const locator = gridPointToMaidenhead(lat, lon);
    if (!locator) return;
    setGridLocator(locator);
    setGridLatitude(lat.toFixed(6));
    setGridLongitude(lon.toFixed(6));
    setGridSearchError('');
    const map = gridMapInstanceRef.current;
    const L = (window as any).L;
    if (map && L) {
      map.setView([lat, lon], Math.max(map.getZoom(), 8));
      if (gridMapMarkerRef.current) gridMapMarkerRef.current.setLatLng([lat, lon]);
      else gridMapMarkerRef.current = L.marker([lat, lon]).addTo(map);
    }
  };

  const detectGridGps = () => {
    if (!navigator.geolocation) {
      setGridSearchError('Este dispositivo no ofrece geolocalización.');
      return;
    }
    setGridGpsBusy(true);
    setGridSearchError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        applyGridCoordinates(position.coords.latitude, position.coords.longitude);
        setGridGpsBusy(false);
      },
      (error) => {
        setGridSearchError(error.code === error.PERMISSION_DENIED
          ? 'No se concedió permiso de ubicación. Podés buscar el lugar en el mapa o introducir coordenadas.'
          : 'No se pudo obtener la ubicación GPS. Comprobá que esté activada e intentá nuevamente.');
        setGridGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  };

  const searchGridPlaces = async () => {
    const term = gridPlaceQuery.trim();
    if (term.length < 2) {
      setGridSearchError('Escribí una localidad o dirección para buscar.');
      return;
    }
    setGridSearchBusy(true);
    setGridSearchError('');
    setGridPlaceResults([]);
    try {
      const params = new URLSearchParams({ q: term, format: 'jsonv2', limit: '6', addressdetails: '1', 'accept-language': 'es' });
      const response = await fetch('https://nominatim.openstreetmap.org/search?' + params.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error('El buscador de localidades no está disponible. Intentá nuevamente.');
      const rows = await response.json();
      const places = (Array.isArray(rows) ? rows : []).map((row: any) => ({
        name: String(row.display_name || '').split(',').slice(0, 4).join(', '),
        lat: Number(row.lat),
        lon: Number(row.lon),
      })).filter((place: { name: string; lat: number; lon: number }) => place.name && Number.isFinite(place.lat) && Number.isFinite(place.lon));
      setGridPlaceResults(places);
      if (!places.length) setGridSearchError('No se encontraron lugares. Probá agregando ciudad y país.');
    } catch (error) {
      setGridSearchError(error instanceof Error ? error.message : 'No se pudo buscar la localidad.');
    } finally {
      setGridSearchBusy(false);
    }
  };

  useEffect(() => {
    if (!isOpen || localStorage.getItem('focus_user_grid_locator') !== '1') return;
    const timer = window.setTimeout(() => {
      const field = document.getElementById('user-grid-locator');
      field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      (field as HTMLInputElement | null)?.focus();
      localStorage.removeItem('focus_user_grid_locator');
    }, 180);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadWeeklyHistory = async () => {
      setWeeklyHistoryLoading(true);
      setWeeklyHistoryError('');
      if (!supabase) {
        setWeeklyHistory([]);
        setWeeklyHistoryError('El histórico compartido no está disponible en este momento.');
        setWeeklyHistoryLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('live_qso_spot_weekly_winners')
        .select('week_start, callsign, station_callsign, qso_date, qso_time, band, frequency, mode, votes, published_at')
        .order('week_start', { ascending: false })
        .limit(52);
      if (cancelled) return;
      if (error) {
        setWeeklyHistory([]);
        setWeeklyHistoryError('No se pudo cargar el histórico. Verificá que la configuración compartida de DX semanal esté aplicada en Supabase.');
      } else {
        setWeeklyHistory((data || []) as typeof weeklyHistory);
      }
      setWeeklyHistoryLoading(false);
    };
    void loadWeeklyHistory();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // La galería y los fondos eQSL no deben modificar la imagen del encabezado.
  const preserveHeaderImage = () => {
    const explicitHeader = localStorage.getItem('app_header_image');
    if (explicitHeader) localStorage.setItem('app_header_image_locked', explicitHeader);
  };

  // Importa varias fotos a la galería sin activar ninguna automáticamente.
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;

    const compressImage = (file: File) => new Promise<{ id: string; name: string; dataUrl: string } | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = (event) => {
        const source = event.target?.result as string;
        if (!source) return resolve(null);
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          const scale = Math.min(1, 900 / image.width, 560 / image.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`, name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.62) });
        };
        image.src = source;
      };
      reader.readAsDataURL(file);
    });

    const imported = [];
    for (const file of files) {
      const item = await compressImage(file);
      if (item) imported.push(item);
    }
    if (!imported.length) {
      window.alert('No se pudieron leer las imágenes seleccionadas. Probá con archivos JPG o PNG.');
      return;
    }
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]') as Array<{ id: string; name: string; dataUrl: string }>; }
      catch { return []; }
    })();
    const next = [...existing, ...imported];
    try {
      localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
      setGalleryImages(next);
      window.dispatchEvent(new Event('user-branding-updated'));
    } catch {
      window.alert('No hay espacio suficiente para guardar todas las fotos. Elegí menos imágenes o archivos más pequeños. Las fotos anteriores no se han reemplazado.');
    }
  };

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files || []).find((item) => item.type.startsWith('image/'));
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => window.alert('No se pudo leer la foto seleccionada.');
    reader.onload = (event) => {
      const source = event.target?.result as string;
      if (!source) return;
      const image = new Image();
      image.onerror = () => window.alert('No se pudo abrir la imagen seleccionada.');
      image.onload = () => {
        const size = 512;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        try {
          localStorage.setItem('user_profile_photo', dataUrl);
          setProfilePhoto(dataUrl);
          window.dispatchEvent(new Event('user-profile-updated'));
          void (async () => {
            const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
            const token = localStorage.getItem('community_chat_identity_token') || '';
            if (!supabase || !callsign || !token) {
              window.alert('La foto quedó guardada en este dispositivo, pero para que aparezca a los demás primero tenés que registrar tu SD en el chat.');
              return;
            }
            const { data, error } = await supabase.rpc('save_community_profile_photo', {
              p_callsign: callsign,
              p_token: token,
              p_photo_data_url: dataUrl,
            });
            if (error || !data?.ok) {
              window.alert('La foto quedó guardada en este dispositivo, pero no se pudo publicar para los demás. Hay que aplicar la migración de fotos de perfil en Supabase.');
            } else {
              window.alert('Foto de perfil guardada. Ya puede mostrarse junto a tu SD en el chat comunitario.');
            }
          })();
        } catch {
          window.alert('No hay espacio suficiente para guardar esta foto. Elegí una imagen más pequeña.');
        }
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfilePhoto = () => {
    localStorage.removeItem('user_profile_photo');
    setProfilePhoto(null);
    window.dispatchEvent(new Event('user-profile-updated'));
    const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const token = localStorage.getItem('community_chat_identity_token') || '';
    if (supabase && callsign && token) {
      void supabase.rpc('save_community_profile_photo', {
        p_callsign: callsign,
        p_token: token,
        p_photo_data_url: null,
      }).then(({ data, error }) => {
        if (error || !data?.ok) window.alert('Se quitó la foto de este dispositivo, pero no se pudo quitar la foto compartida del chat.');
      });
    }
  };

  const handleAnchorImage = (dataUrl: string) => {
    preserveHeaderImage();
    setCustomBg(dataUrl);
    localStorage.setItem('eqsl_custom_bg', dataUrl);
  };

  const handleDeleteGalleryImage = (id: string) => {
    const removedImage = galleryImages.find((item) => item.id === id);
    preserveHeaderImage();
    const next = galleryImages.filter((item) => item.id !== id);
    setGalleryImages(next);
    localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
    const removed = removedImage;
    window.dispatchEvent(new Event('user-branding-updated'));
    if (removed?.dataUrl === customBg) {
      setCustomBg(null);
      localStorage.removeItem('eqsl_custom_bg');
    }
  };

  const togglePushNotifications = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones push.');
      }
      const identityToken = localStorage.getItem('community_chat_identity_token') || '';
      const verifiedCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (!identityToken || !verifiedCallsign) {
        throw new Error('Primero verificá tu señal distintiva en este dispositivo.');
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (pushEnabled) {
        if (existing) {
          const response = await fetch('/api/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe', token: identityToken, callsign: verifiedCallsign, endpoint: existing.endpoint }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'No se pudo desactivar el aviso push.');
          await existing.unsubscribe();
        }
        setPushEnabled(false);
        setEqslSoundAlerts(false);
        localStorage.setItem('eqsl_sound_alerts', 'false');
        window.dispatchEvent(new Event('eqsl-sound-setting-updated'));
        setPushStatus('Notificaciones desactivadas.');
        return;
      }
      const publicKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!publicKey) throw new Error('Falta configurar la clave pública de notificaciones.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se autorizó el permiso de notificaciones. Revisá los permisos de Android/Chrome.');
      const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(publicKey.length / 4) * 4, '=')), ch => ch.charCodeAt(0));
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', token: identityToken, callsign: verifiedCallsign, subscription: subscription.toJSON(), alertsEnabled: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar este dispositivo.');
      setPushEnabled(true);
      setEqslSoundAlerts(true);
      localStorage.setItem('eqsl_sound_alerts', 'true');
      window.dispatchEvent(new Event('eqsl-sound-setting-updated'));
      setPushStatus('Notificaciones activadas.');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'No se pudo cambiar la configuración de notificaciones.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleAcceptQraOperator = async () => {
    const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const token = localStorage.getItem('community_chat_identity_token') || '';
    const value = qraOperator.trim().replace(/\s+/g, ' ');
    if (!callsign || !token || !supabase) {
      window.alert('Primero necesitás tener tu SD o indicativo verificado.');
      return;
    }
    if (!value) {
      window.alert('Ingresá el nombre del operador antes de aceptar.');
      return;
    }
    if (value.length > 80) {
      window.alert('El QRA OPERADOR admite hasta 80 caracteres.');
      return;
    }
    setQraOperatorBusy(true);
    try {
      const { data, error } = await supabase.rpc('save_community_profile_qra_operator', {
        p_callsign: callsign, p_token: token, p_qra_operator: value,
      });
      if (error || !data?.ok) {
        if (data?.reason === 'already_set') {
          setQraOperator(String(data.qra_operator || value));
          setQraOperatorSaved(true);
          window.alert('El QRA OPERADOR ya fue aceptado y no se puede modificar.');
        } else {
          window.alert('No se pudo aceptar el QRA OPERADOR. Verificá tu conexión e intentá nuevamente.');
        }
        return;
      }
      setQraOperator(value);
      setQraOperatorSaved(true);
      window.dispatchEvent(new Event('user-profile-updated'));
    } finally {
      setQraOperatorBusy(false);
    }
  };

  const handleSaveCallsign = async () => {
    const finalCall = callsign.trim().toUpperCase();
    if (isVerifiedCallsign) return;
    if (!finalCall) { setCallsignSaveStatus('Ingresá tu indicativo antes de guardar.'); return; }
    setCallsignSaveBusy(true); setCallsignSaveStatus('Guardando…');
    try {
      localStorage.setItem('user_callsign', finalCall);
      setCallsign(finalCall);
      window.dispatchEvent(new Event('user-profile-updated'));
      onUpdate();
      setCallsignSaveStatus('Indicativo guardado correctamente en este dispositivo.');
    } catch {
      setCallsignSaveStatus('No se pudo guardar el indicativo. Revisá el espacio disponible e intentá nuevamente.');
    } finally { setCallsignSaveBusy(false); }
  };

  const handleSaveGridLocator = async () => {
    const normalizedGrid = gridLocator.trim().toUpperCase();
    if (normalizedGrid && !isValidMaidenheadLocator(normalizedGrid)) {
      setGridSearchError('Grid Locator inválido. Usá 4, 6, 8 o 10 caracteres Maidenhead.');
      setGridSaveStatus('Corregí el formato antes de guardar.');
      return;
    }
    setGridSaveBusy(true); setGridSaveStatus('Guardando…'); setGridSearchError('');
    try {
      const gridToken = localStorage.getItem('community_chat_identity_token') || '';
      const gridCallsign = (localStorage.getItem('community_chat_sd') || callsign.trim().toUpperCase() || '').trim().toUpperCase();
      if (supabase && gridToken && gridCallsign) {
        const { data, error } = await supabase.rpc('save_live_spot_grid_locator', {
          p_callsign: gridCallsign, p_token: gridToken, p_grid_locator: normalizedGrid || null,
        });
        if (error || !data?.ok) throw new Error('No se pudo compartir el Grid Locator con el directorio. El valor sigue en el formulario; intentá nuevamente.');
        if (normalizedGrid) localStorage.setItem('user_grid_locator', normalizedGrid);
        else localStorage.removeItem('user_grid_locator');
        setGridSaveStatus('Grid Locator guardado y compartido en el directorio.');
      } else {
        if (normalizedGrid) localStorage.setItem('user_grid_locator', normalizedGrid);
        else localStorage.removeItem('user_grid_locator');
        setGridSaveStatus('Grid Locator guardado en este dispositivo. Para compartirlo en el directorio necesitás una SD verificada.');
      }
      setGridLocator(normalizedGrid);
      window.dispatchEvent(new Event('user-profile-updated'));
      onUpdate();
    } catch (error) {
      setGridSaveStatus(error instanceof Error ? error.message : 'No se pudo guardar el Grid Locator. Intentá nuevamente.');
    } finally { setGridSaveBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl text-slate-100 my-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Perfil del usuario</h2>
              <p className="text-xs text-slate-400">Tu identidad de radio y preferencias de eQSL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 pt-4">
          {/* Los usuarios con SD verificada usan la identidad registrada automáticamente. */}
          {!isVerifiedCallsign && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mi Indicativo (Callsign) *
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="Ingresá tu señal distintiva"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-amber-300 font-bold focus:border-amber-400 focus:outline-hidden"
                />
                <button type="button" onClick={() => void handleSaveCallsign()} disabled={callsignSaveBusy || !callsign.trim()} className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">{callsignSaveBusy ? 'Guardando…' : 'GUARDAR INDICATIVO'}</button>
                {callsignSaveStatus && <p role="status" className="mt-1 text-xs text-emerald-300">{callsignSaveStatus}</p>}
              </div>
            </div>
          )}




          

          {isVerifiedCallsign && (
            <section className="overflow-hidden rounded-xl border border-emerald-500/35 bg-emerald-950/25" aria-labelledby="device-recovery-title">
              <button
                type="button"
                onClick={() => setDeviceRecoveryOpen((open) => !open)}
                aria-expanded={deviceRecoveryOpen}
                aria-controls="device-recovery-panel"
                className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-emerald-900/25"
              >
                <span className="flex-1 text-xs font-bold uppercase tracking-wider text-emerald-300">Recuperar acceso en otra PC</span>
                <ChevronDown className={`h-4 w-4 shrink-0 text-emerald-300 transition-transform ${deviceRecoveryOpen ? 'rotate-180' : ''}`} />
              </button>
              {deviceRecoveryOpen && (
                <div id="device-recovery-panel" className="space-y-3 border-t border-emerald-500/20 p-3.5">
                  <p className="text-xs leading-relaxed text-slate-300">Desde tu teléfono con la autorización principal, generá un código temporal para recuperar una computadora que perdió sus datos de acceso. El teléfono seguirá autorizado.</p>
                  <button type="button" onClick={() => { void generateDeviceRecoveryCode(); }} disabled={deviceRecoveryBusy} className="w-full rounded-lg bg-emerald-500 px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">
                    {deviceRecoveryBusy ? 'Generando código…' : 'Generar código para recuperar PC'}
                  </button>
                  {deviceRecoveryCode && (
                    <div className="rounded-lg border border-emerald-400/40 bg-slate-950 p-3 text-center">
                      <p className="text-[11px] font-semibold text-emerald-200">CÓDIGO TEMPORAL</p>
                      <p className="my-2 font-mono text-2xl font-black tracking-[0.2em] text-white">{deviceRecoveryCode}</p>
                      <button type="button" onClick={() => { void navigator.clipboard?.writeText(deviceRecoveryCode).then(() => setDeviceRecoveryStatus('Código copiado.')).catch(() => setDeviceRecoveryStatus('Seleccioná el código y copialo manualmente.')); }} className="rounded-lg border border-emerald-400/50 px-3 py-1.5 text-xs font-bold text-emerald-200">Copiar código</button>
                    </div>
                  )}
                  {deviceRecoveryStatus && <p role="status" className="text-xs leading-relaxed text-emerald-100">{deviceRecoveryStatus}</p>}
                </div>
              )}
            </section>
          )}

          {isVerifiedCallsign && isAdminActor && (
            <section className="space-y-3 rounded-xl border border-amber-400/40 bg-amber-950/20 p-3.5" aria-labelledby="admin-device-recovery-title">
              <h3 id="admin-device-recovery-title" className="text-xs font-black uppercase tracking-wider text-amber-300">Recuperación administrativa de dispositivo</h3>
              <p className="text-xs leading-relaxed text-slate-200">Emití un código temporal para el titular del indicativo que necesite recuperar el acceso. No cambia ni elimina el indicativo registrado.</p>
              <label htmlFor="admin-recovery-target" className="block text-xs font-semibold text-amber-100">Indicativo del usuario</label>
              <input id="admin-recovery-target" value={adminRecoveryTarget} onChange={(event) => { setAdminRecoveryTarget(event.target.value.toUpperCase()); setAdminRecoveryCode(''); }} maxLength={24} autoComplete="off" placeholder="Ej.: LU6EAE" className="w-full rounded-lg border border-amber-400/40 bg-slate-950 px-3 py-2 font-mono text-sm uppercase text-white" />
              <button type="button" onClick={() => { void generateAdminRecoveryCode(); }} disabled={adminRecoveryBusy || !adminRecoveryTarget.trim()} className="w-full rounded-lg bg-amber-400 px-3 py-2.5 text-sm font-black text-slate-950 disabled:opacity-50">
                {adminRecoveryBusy ? 'Autorizando…' : 'Autorizar recuperación'}
              </button>
              {adminRecoveryCode && (
                <div className="rounded-lg border border-amber-400/40 bg-slate-950 p-3 text-center">
                  <p className="text-[11px] font-bold text-amber-200">CÓDIGO TEMPORAL · {adminRecoveryTarget.trim().toUpperCase()}</p>
                  <p className="my-2 font-mono text-2xl font-black tracking-[0.2em] text-white">{adminRecoveryCode}</p>
                  <button type="button" onClick={() => { void navigator.clipboard?.writeText(adminRecoveryCode).then(() => setAdminRecoveryStatus('Código copiado.')).catch(() => setAdminRecoveryStatus('Seleccioná el código y copialo manualmente.')); }} className="rounded-lg border border-amber-400/50 px-3 py-1.5 text-xs font-bold text-amber-200">Copiar código</button>
                </div>
              )}
              {adminRecoveryStatus && <p role="status" className="text-xs leading-relaxed text-amber-100">{adminRecoveryStatus}</p>}
            </section>
          )}

          <section className="rounded-xl border border-cyan-500/25 bg-slate-950/70 p-3.5 space-y-3" aria-labelledby="grid-locator-title">
            <div>
              <h3 id="grid-locator-title" className="text-xs font-bold uppercase tracking-wider text-cyan-300">Grid Locator para distancia DX</h3>
              <label htmlFor="user-grid-locator" className="mt-2 block text-xs text-slate-300">Tu locator Maidenhead actual o nuevo</label>
              <input id="user-grid-locator" type="text" maxLength={10} value={gridLocator} onChange={(e) => setGridLocator(e.target.value.toUpperCase().replace(/\s+/g, ''))} placeholder="Ej.: IN83ka" autoCapitalize="characters" spellCheck={false} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm font-bold text-cyan-200 focus:border-cyan-400 focus:outline-none" />
              <p className={gridLocator.trim() && !isValidMaidenheadLocator(gridLocator) ? 'text-xs text-rose-300' : 'text-xs text-slate-400'}>{gridLocator.trim() && !isValidMaidenheadLocator(gridLocator) ? 'Formato no válido. Usá 4, 6, 8 o 10 caracteres Maidenhead.' : 'Podés conservarlo o reemplazarlo cuando operes desde otra ubicación. Guardalo aquí después de elegir tu ubicación. Podés cambiarlo cuando operes desde otro lugar.'}</p>
            </div>
            <button type="button" onClick={detectGridGps} disabled={gridGpsBusy} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">
              <LocateFixed size={17} /> {gridGpsBusy ? 'Detectando ubicación…' : 'DETECTAR MI UBICACIÓN GPS'}
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input value={gridPlaceQuery} onChange={(event) => setGridPlaceQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchGridPlaces(); } }} placeholder="Buscar ciudad, localidad o dirección…" className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder:text-slate-500" />
              <button type="button" onClick={() => { void searchGridPlaces(); }} disabled={gridSearchBusy} className="flex min-h-[42px] items-center justify-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
                <Search size={16} /> {gridSearchBusy ? 'Buscando…' : 'BUSCAR LUGAR'}
              </button>
            </div>
            {gridPlaceResults.length > 0 && <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-700 bg-slate-900 p-2">
              {gridPlaceResults.map((place, index) => <button key={place.name + index} type="button" onClick={() => { applyGridCoordinates(place.lat, place.lon); setGridPlaceResults([]); }} className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"><MapPin size={15} className="mt-0.5 shrink-0 text-cyan-300" /><span>{place.name}</span></button>)}
            </div>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-300">Latitud
                <input inputMode="decimal" value={gridLatitude} onChange={(event) => setGridLatitude(event.target.value)} placeholder="-34.603700" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white" />
              </label>
              <label className="text-xs text-slate-300">Longitud
                <input inputMode="decimal" value={gridLongitude} onChange={(event) => setGridLongitude(event.target.value)} placeholder="-58.381600" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white" />
              </label>
            </div>
            <button type="button" onClick={() => { if (!gridLatitude.trim() || !gridLongitude.trim()) { setGridSearchError('Completá latitud y longitud antes de calcular.'); return; } applyGridCoordinates(Number(gridLatitude.replace(',', '.')), Number(gridLongitude.replace(',', '.'))); }} className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-lg border border-cyan-500/50 bg-slate-900 px-3 py-2 text-sm font-bold text-cyan-200 hover:bg-slate-800">
              <Crosshair size={16} /> CALCULAR GRID DESDE COORDENADAS
            </button>
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-300">Mapa: tocá el punto exacto donde estás para calcular el locator.</p>
              <div ref={gridMapRef} className="h-[250px] w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-800" />
            </div>
            {gridSearchError && <p role="status" className="text-xs text-amber-300">{gridSearchError}</p>}
            <button type="button" onClick={() => void handleSaveGridLocator()} disabled={gridSaveBusy || Boolean(gridLocator.trim() && !isValidMaidenheadLocator(gridLocator))} className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2.5 text-sm font-black text-slate-950 hover:bg-cyan-500 disabled:opacity-50">{gridSaveBusy ? 'Guardando Grid Locator…' : 'GUARDAR GRID LOCATOR'}</button>
            {gridSaveStatus && <p role="status" className={`text-xs ${gridSaveStatus.startsWith('Grid Locator guardado') ? 'text-emerald-300' : 'text-amber-300'}`}>{gridSaveStatus}</p>}
            {gridLocator.trim() && isValidMaidenheadLocator(gridLocator) && <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 px-3 py-2 text-sm font-bold text-emerald-200">Grid Locator calculado: {gridLocator.toUpperCase()}</p>}
          </section>

          {!qraOperatorSaved && isVerifiedCallsign && (
            <section className="rounded-xl border border-emerald-500/25 bg-slate-950/70 p-3.5 space-y-2" aria-labelledby="qra-operator-title">
              <h3 id="qra-operator-title" className="text-xs font-bold uppercase tracking-wider text-emerald-300">QRA OPERADOR</h3>
              <label htmlFor="qra-operator" className="block text-xs text-slate-300">Ingresá tu nombre de operador. Solo podrás aceptarlo una vez y quedará vinculado a tu SD/indicativo verificado.</label>
              <input id="qra-operator" type="text" maxLength={80} value={qraOperator} onChange={(event) => setQraOperator(event.target.value)} placeholder="Nombre del operador" autoComplete="name" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-400 focus:outline-none" />
              <button type="button" onClick={() => void handleAcceptQraOperator()} disabled={qraOperatorBusy || !qraOperator.trim()} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50">{qraOperatorBusy ? 'Aceptando…' : 'ACEPTAR QRA OPERADOR'}</button>
              <p className="text-xs text-slate-400">Una vez aceptado, el campo desaparecerá y el QRA quedará visible en tu perfil público. No podrá editarse.</p>
            </section>
          )}
          {qraOperatorSaved && (
            <section className="rounded-xl border border-emerald-500/25 bg-slate-950/70 p-3.5 space-y-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-300">QRA OPERADOR ACEPTADO</h3>
              <p className="text-sm font-semibold text-white">{qraOperator}</p>
              <p className="text-xs text-slate-400">Vinculado permanentemente a tu SD/indicativo.</p>
            </section>
          )}

          <section className="rounded-xl border border-sky-500/25 bg-slate-950/70 p-3.5 space-y-3" aria-labelledby="profile-photo-title">
            <div>
              <h3 id="profile-photo-title" className="text-xs font-bold uppercase tracking-wider text-sky-300">Foto de perfil</h3>
              <p className="mt-1 text-[11px] text-slate-400">Elegí una imagen de la galería de tu dispositivo. La foto se guarda en este dispositivo.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-sky-500/40 bg-slate-800 flex items-center justify-center">
                {profilePhoto ? <img src={profilePhoto} alt="Foto de perfil" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-slate-500" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />
                <button type="button" onClick={() => profilePhotoInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20">
                  <ImageIcon className="h-3.5 w-3.5" /> {profilePhoto ? 'Cambiar foto' : 'Subir foto de galería'}
                </button>
                {profilePhoto && <button type="button" onClick={handleRemoveProfilePhoto} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40"><Trash2 className="h-3.5 w-3.5" /> Quitar</button>}
              </div>
            </div>
          </section>

          <section className="py-3 border-y border-slate-800" aria-labelledby="weekly-history-title">
            <div className="overflow-hidden rounded-xl border border-violet-500/40 bg-slate-950/60">
              <button
                type="button"
                id="weekly-history-title"
                onClick={() => setWeeklyHistoryOpen((open) => !open)}
                aria-expanded={weeklyHistoryOpen}
                aria-controls="weekly-history-panel"
                className="flex w-full items-center gap-3 bg-violet-700 px-3.5 py-3 text-left text-white transition-colors hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <Trophy className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-sm font-extrabold uppercase tracking-wide">DX SEMANAL HISTORICO</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${weeklyHistoryOpen ? 'rotate-180' : ''}`} />
              </button>
              {weeklyHistoryOpen && (
                <div id="weekly-history-panel" className="space-y-3 p-3.5">
                  {weeklyHistoryLoading && <p className="text-xs text-slate-400">Cargando histórico…</p>}
                  {!weeklyHistoryLoading && weeklyHistoryError && <p role="status" className="text-xs text-amber-300">{weeklyHistoryError}</p>}
                  {!weeklyHistoryLoading && !weeklyHistoryError && weeklyHistory.length === 0 && <p className="text-xs text-slate-400">Sin datos verificados disponibles por el momento.</p>}
                  {!weeklyHistoryLoading && weeklyHistory.length > 0 && (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {weeklyHistory.map((entry) => (
                        <article key={entry.week_start} className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-violet-300">Semana del {entry.week_start}</span>
                            <span className="text-xs font-bold text-amber-300">♥ {entry.votes} votos</span>
                          </div>
                          <p className="mt-1 break-words font-mono text-sm font-bold text-white">{entry.callsign} ↔ {entry.station_callsign}</p>
                          <p className="mt-1 text-xs text-slate-300">{entry.frequency} MHz · {entry.band} · {entry.mode || 'Modo no indicado'}</p>
                          <p className="mt-1 text-[11px] text-slate-400">QSO: {entry.qso_date} · {String(entry.qso_time || '').slice(0, 5)} UTC</p>
                        </article>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setWeeklyHistoryOpen(false)}
                    className="w-full rounded-lg border border-violet-400/50 bg-slate-800 px-3 py-2 text-sm font-bold text-violet-200 transition-colors hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </section>
          <section className="py-2 border-y border-slate-800" aria-labelledby="eqsl-alert-settings">
            <div className="flex items-center justify-between gap-3 min-h-10">
              <label htmlFor="eqsl-push-toggle" className="text-sm font-semibold text-white">Notificaciones push de eQSL</label>
              <button
                id="eqsl-push-toggle"
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                aria-label="Activar o desactivar notificaciones push de eQSL"
                disabled={pushBusy}
                onClick={togglePushNotifications}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60 ${pushEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {pushStatus && <p role="status" className="mt-1 text-[11px] text-slate-400 break-words">{pushStatus}</p>}
          </section>

          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">2. Galería de diseños eQSL predeterminados</h3>
            <p className="text-[11px] text-slate-500 mt-1">Las imágenes quedan en la galería. Podés elegir Fondo eQSL o eliminar una foto.</p>
          </div>
          {/* Galería única: las fotos cargadas quedan aquí y solo se activan al tocar Anclar. */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-sky-500/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-sky-300">Diseños eQSL predeterminados</span>
              </div>
              <span className="text-[10px] text-slate-500">{galleryImages.length} fotos</span>
            </div>
            <p className="text-[11px] text-slate-400">Cargá tus imágenes. Para cada foto podés elegir Fondo eQSL o eliminarla de la galería.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Añadir fotos de galería (selección múltiple)
            </button>
            {galleryImages.length === 0 ? (
              <p className="text-xs text-slate-400">Todavía no hay fotos guardadas. Cargá una o varias para verlas aquí.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {galleryImages.map((item) => {
                  const selected = customBg === item.dataUrl;
                  return (
                    <div key={item.id} className={`overflow-hidden rounded-lg border ${selected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-700'}`}>
                      <img src={item.dataUrl} alt={item.name} className="h-24 w-full object-cover" />
                      <p className="truncate px-2 pt-1 text-[10px] text-slate-200" title={item.name}>{item.name}</p>
                      <div className="grid grid-cols-2 gap-1 p-1.5">
                        <button type="button" onClick={() => handleAnchorImage(item.dataUrl)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'}`}>{selected ? '✓ Fondo eQSL' : 'Fondo eQSL'}</button>
                        <button type="button" onClick={() => handleDeleteGalleryImage(item.id)} className="rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-950/50" aria-label={`Eliminar ${item.name}`}><Trash2 className="inline h-3 w-3" /> Eliminar</button>
                      </div>
                      {selected && <p className="bg-slate-800 px-2 pb-1.5 text-[10px] font-semibold text-slate-200">✓ Fondo activo para eQSL</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Foto de fondo para tu tarjeta eQSL</span>
              {customBg && <span className="text-[11px] text-emerald-400 font-semibold">✓ Foto activa</span>}
            </div>
            <p className="text-[11px] text-slate-400">La foto activa se elige con “Fondo eQSL”. Agregar fotos no cambia el fondo activo.</p>
            {customBg && (
              <button
                type="button"
                onClick={() => {
                  preserveHeaderImage();
                  setCustomBg(null);
                  localStorage.removeItem('eqsl_custom_bg');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desactivar foto activa
              </button>
            )}
          </div>
          <section className="pt-3 border-t border-slate-800 space-y-3" aria-labelledby="community-areas-title">
            <div>
              <h3 id="community-areas-title" className="text-xs font-bold uppercase tracking-wider text-emerald-300">Comunidad</h3>
              <p className="text-[11px] text-slate-500 mt-1">Accesos previstos para las actividades de la comunidad. La publicación compartida y la moderación deben habilitarse con el backend correspondiente.</p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-slate-950/60 overflow-hidden">
              <button type="button" onClick={() => setCommunitySection(communitySection === 'competitions' ? null : 'competitions')} aria-expanded={communitySection === 'competitions'} className="w-full flex items-center gap-3 p-3.5 text-left">
                <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-amber-200">Competiciones</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">Bases y concursos zonales, regionales, nacionales e internacionales.</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${communitySection === 'competitions' ? 'rotate-180' : ''}`} />
              </button>
              {communitySection === 'competitions' && <div className="px-3.5 pb-3.5 space-y-2 text-xs text-slate-300">
                <p>El apartado reunirá las bases de las competiciones y publicaciones de los radioaficionados.</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-800 px-2 py-1">Zonales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Regionales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Nacionales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Internacionales</span>
                </div>
                <p className="text-amber-300">Publicación compartida y borrado exclusivo del administrador: pendientes de implementar y probar.</p>
              </div>}
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-slate-950/60 overflow-hidden">
              <button type="button" onClick={() => setCommunitySection(communitySection === 'llota' ? null : 'llota')} aria-expanded={communitySection === 'llota'} className="w-full flex items-center gap-3 p-3.5 text-left">
                <TentTree className="w-5 h-5 text-emerald-300 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-emerald-200">LLOTA</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">Actividades de radio al aire libre: playas, parques, lagunas, lagos y montañas.</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${communitySection === 'llota' ? 'rotate-180' : ''}`} />
              </button>
              {communitySection === 'llota' && <div className="px-3.5 pb-3.5 space-y-2 text-xs text-slate-300">
                <p>El espacio LLOTA permitirá anunciar activaciones y compartir fotografías, vídeos, enlaces, fecha y lugar de la actividad.</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><Camera className="w-3 h-3" /> Fotos y vídeos</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><LinkIcon className="w-3 h-3" /> Enlaces</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><MessageCircle className="w-3 h-3" /> WhatsApp voluntario</span>
                </div>
                <p>La participación en WhatsApp será voluntaria. El enlace real de invitación deberá configurarlo el administrador.</p>
                <p className="text-emerald-300">Publicaciones compartidas y moderación exclusiva del administrador: pendientes de implementar y probar.</p>
              </div>}
            </div>
          </section>

          <section className="px-1 py-2 border-t border-slate-700" aria-label="Contacto">
            <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-400">
              <span>Contacto:</span>
              <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Contacto%20con%20LogBook%20eQSL%20EXPRESS" className="font-medium text-sky-300 underline underline-offset-2">lu1tsb.4rc978@gmail.com</a>
            </p>
          </section>
          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button type="button" onClick={onClose} className="px-4 py-2 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  );
};
