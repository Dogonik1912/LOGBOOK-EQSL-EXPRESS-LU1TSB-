/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Settings, MessageCircle, Download, Smartphone, Share2, Copy, ChevronDown, Thermometer, Droplets, CloudSun, CloudRain, Sun, Cloud, CloudLightning, Snowflake, LoaderCircle, Compass, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { getInitialAppLanguage, getLocalizedShareText } from '../services/appLanguage';
import { LanguageSelector } from './LanguageSelector';

interface HeaderProps {
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [compassHeading, setCompassHeading] = useState<number | null>(null);
  const [compassOpen, setCompassOpen] = useState(false);
  const isFixedDevice = typeof navigator !== 'undefined' && !/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent);
  const [compassStatus, setCompassStatus] = useState(() => isFixedDevice
    ? 'Norte de referencia fijo: N arriba. Este equipo no informa su orientación física.'
    : 'Tocá para activar la brújula');
  const compassHandlerRef = useRef<((event: DeviceOrientationEvent) => void) | null>(null);

  const activateCompass = async () => {
    try {
      if (!('DeviceOrientationEvent' in window)) {
        setCompassHeading(null);
        setCompassStatus('Norte de referencia fijo: N arriba. Este equipo no dispone de sensor para conocer hacia dónde está orientada físicamente la pantalla.');
        return;
      }
      const orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> };
      // Safari/iOS exige que requestPermission se invoque directamente desde una acción del usuario.
      if (typeof orientation.requestPermission === 'function') {
        const permission = await orientation.requestPermission();
        if (permission !== 'granted') {
          setCompassStatus('Permiso denegado. Revisá los permisos de movimiento y orientación del navegador.');
          return;
        }
      } else {
        setCompassStatus('Activando sensor… Si no aparece el rumbo, habilitá sensores de movimiento para este sitio en los ajustes de Chrome.');
      }

      // Evitar listeners duplicados si se vuelve a tocar el botón.
      if (compassHandlerRef.current) {
        window.removeEventListener('deviceorientation', compassHandlerRef.current as EventListener);
        window.removeEventListener('deviceorientationabsolute', compassHandlerRef.current as EventListener);
      }
      setCompassHeading(null);
      let receivedHeading = false;
      const handleOrientation = (event: DeviceOrientationEvent) => {
        const sensorEvent = event as DeviceOrientationEvent & { webkitCompassHeading?: number; absolute?: boolean };
        let heading: number | null = null;

        let isAbsoluteHeading = false;
        // Safari/iOS entrega directamente el rumbo magnético.
        if (typeof sensorEvent.webkitCompassHeading === 'number' && Number.isFinite(sensorEvent.webkitCompassHeading)) {
          heading = sensorEvent.webkitCompassHeading;
          isAbsoluteHeading = true;
        } else if (
          (sensorEvent.absolute === true || event.type === 'deviceorientationabsolute') &&
          typeof event.alpha === 'number' &&
          Number.isFinite(event.alpha)
        ) {
          // Los eventos absolutos permiten orientar respecto al norte.
          heading = (360 - event.alpha + 360) % 360;
          isAbsoluteHeading = true;
        } else if (typeof event.alpha === 'number' && Number.isFinite(event.alpha)) {
          // Algunos navegadores solo exponen orientación relativa. Mostrarla como aproximada
          // y no afirmar que representa el norte magnético.
          heading = (360 - event.alpha + 360) % 360;
        }

        if (heading !== null) {
          receivedHeading = true;
          setCompassHeading(((heading % 360) + 360) % 360);
          setCompassStatus(isAbsoluteHeading
            ? 'Brújula activa · rumbo respecto al norte'
            : 'Orientación aproximada · este navegador no confirma el norte magnético');
        }
      };
      compassHandlerRef.current = handleOrientation;
      window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener);
      window.addEventListener('deviceorientation', handleOrientation as EventListener);
      setCompassStatus('Buscando el norte magnético… mantené el teléfono horizontal y giralo lentamente');
      window.setTimeout(() => {
        if (!receivedHeading) {
          setCompassStatus('Este navegador no entregó datos de orientación. Comprobá que el sitio use HTTPS, revisá los permisos de sensores y volvé a intentarlo. Si el dispositivo no tiene sensor, no se puede obtener el rumbo.');
        }
      }, 7000);
    } catch (error) {
      setCompassStatus(error instanceof Error ? error.message : 'No se pudo activar el sensor de brújula');
    }
  };

  useEffect(() => () => {
    if (compassHandlerRef.current) {
      window.removeEventListener('deviceorientation', compassHandlerRef.current as EventListener);
      window.removeEventListener('deviceorientationabsolute', compassHandlerRef.current as EventListener);
    }
  }, []);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 16));
  const formatLocalDate = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  };
  const [localDate, setLocalDate] = useState(() => formatLocalDate());
  const [localWeather, setLocalWeather] = useState<{ temperature: number; humidity: number } | null>(null);
  const [weatherStatus, setWeatherStatus] = useState('Cargando clima...');
  const [ipCoordinates, setIpCoordinates] = useState<{ latitude: number; longitude: number } | null>(null);
  const [forecastOpen, setForecastOpen] = useState(false);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastStatus, setForecastStatus] = useState('');
  const [weeklyForecast, setWeeklyForecast] = useState<Array<{ date: string; code: number; max: number; min: number; rain: number; wind: number }>>([]);
  const describeWeatherCode = (code: number) => {
    if (code === 0) return 'Despejado';
    if ([1, 2].includes(code)) return 'Poco nuboso';
    if (code === 3) return 'Nublado';
    if ([45, 48].includes(code)) return 'Niebla';
    if ([51, 53, 55, 56, 57].includes(code)) return 'Llovizna';
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Lluvia';
    if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Nieve';
    if ([95, 96, 99].includes(code)) return 'Tormentas';
    return 'Variable';
  };
  const WeatherIcon = ({ code }: { code: number }) => {
    if (code === 0) return <Sun className="h-5 w-5 text-amber-400" />;
    if ([1, 2, 3, 45, 48].includes(code)) return <Cloud className="h-5 w-5 text-slate-300" />;
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return <CloudRain className="h-5 w-5 text-sky-400" />;
    if ([95, 96, 99].includes(code)) return <CloudLightning className="h-5 w-5 text-yellow-300" />;
    if ([71, 73, 75, 77, 85, 86].includes(code)) return <Snowflake className="h-5 w-5 text-cyan-200" />;
    return <CloudSun className="h-5 w-5 text-slate-300" />;
  };
  const loadWeeklyForecast = async (latitude: number, longitude: number) => {
    setForecastLoading(true);
    setForecastStatus('Consultando pronóstico semanal…');
    try {
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(String(latitude)) +
        '&longitude=' + encodeURIComponent(String(longitude)) +
        '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max&forecast_days=7&timezone=auto';
      const response = await fetch(url);
      if (!response.ok) throw new Error('Forecast unavailable');
      const data = await response.json();
      const daily = data?.daily;
      if (!Array.isArray(daily?.time) || !Array.isArray(daily?.weather_code)) throw new Error('Forecast data missing');
      const entries = daily.time.map((date: string, index: number) => ({
        date,
        code: Number(daily.weather_code[index]),
        max: Number(daily.temperature_2m_max[index]),
        min: Number(daily.temperature_2m_min[index]),
        rain: Number(daily.precipitation_probability_max[index]),
        wind: Number(daily.wind_speed_10m_max[index]),
      })).filter((day: { date: string; code: number; max: number; min: number; rain: number; wind: number }) =>
        day.date && Number.isFinite(day.code) && Number.isFinite(day.max) && Number.isFinite(day.min));
      setWeeklyForecast(entries);
      setForecastStatus(entries.length ? 'Pronóstico actualizado · fuente: Open-Meteo' : 'No hay datos semanales disponibles.');
    } catch {
      setForecastStatus('No se pudo obtener el pronóstico. Intentá nuevamente.');
    } finally {
      setForecastLoading(false);
    }
  };
  const toggleForecast = () => {
    const willOpen = !forecastOpen;
    setForecastOpen(willOpen);
    if (!willOpen || weeklyForecast.length || forecastLoading) return;
    setForecastStatus('Buscando la ubicación de este dispositivo…');
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => { void loadWeeklyForecast(position.coords.latitude, position.coords.longitude); },
        () => {
          if (ipCoordinates) void loadWeeklyForecast(ipCoordinates.latitude, ipCoordinates.longitude);
          else setForecastStatus('No se pudo obtener la ubicación. Revisá el permiso de ubicación e intentá nuevamente.');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 30 * 60 * 1000 },
      );
    } else if (ipCoordinates) {
      void loadWeeklyForecast(ipCoordinates.latitude, ipCoordinates.longitude);
    } else {
      setForecastStatus('Ubicación no disponible en este dispositivo.');
    }
  };
  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        // Ubicación aproximada por IP: no solicita permiso de geolocalización al navegador.
        const locationResponse = await fetch('https://ipapi.co/json/');
        if (!locationResponse.ok) throw new Error('Location unavailable');
        const location = await locationResponse.json();
        // Si el operador no configuró un país, usar el código aproximado por IP
        // para elegir los colores de la bandera. No se solicita GPS ni permiso.
        if (!localStorage.getItem('user_country') && typeof location?.country_code === 'string' && location.country_code.trim()) {
          const detectedCountry = location.country_code.trim().toLowerCase();
          localStorage.setItem('user_country', detectedCountry);
          setCountry(detectedCountry);
        }
        const latitude = Number(location?.latitude);
        const longitude = Number(location?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Location unavailable');
        if (!cancelled) setIpCoordinates({ latitude, longitude });
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(String(latitude)) +
          '&longitude=' + encodeURIComponent(String(longitude)) +
          '&current=temperature_2m,relative_humidity_2m&timezone=auto';
        const weatherResponse = await fetch(url);
        if (!weatherResponse.ok) throw new Error('Weather unavailable');
        const data = await weatherResponse.json();
        if (cancelled) return;
        const temperature = Number(data?.current?.temperature_2m);
        const humidity = Number(data?.current?.relative_humidity_2m);
        if (Number.isFinite(temperature) && Number.isFinite(humidity)) {
          setLocalWeather({ temperature: Math.round(temperature), humidity: Math.round(humidity) });
          setWeatherStatus('Datos meteorológicos actualizados');
        }
      } catch {
        // Si los servicios no responden, ocultamos los valores en vez de inventarlos.
        if (!cancelled) { setLocalWeather(null); setWeatherStatus('Clima no disponible'); }
      }
    };
    void loadWeather();
    const refreshTimer = window.setInterval(() => { void loadWeather(); }, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setUtcClock(now.toISOString().slice(11, 16));
      setLocalDate(formatLocalDate());
    };
    updateClocks();
    const timer = window.setInterval(updateClocks, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [isInstalled, setIsInstalled] = useState(false);
  const [appUserCount, setAppUserCount] = useState<number | null>(null);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareLanguage, setShareLanguage] = useState(() => getInitialAppLanguage());
  const shareUrl = 'https://logbook-eqsl-express-lu-1-tsb.vercel.app/';
  const shareText = getLocalizedShareText(shareLanguage);
  const shareOptions = [
    { name: 'WhatsApp', mark: 'wa', color: 'bg-green-600', url: () => 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + shareUrl) },
    { name: 'Telegram', mark: 'tg', color: 'bg-sky-500', url: () => 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText) },
    { name: 'Instagram', mark: 'ig', color: 'bg-pink-600', url: () => 'https://www.instagram.com/' },
    { name: 'X', mark: 'X', color: 'bg-black', url: () => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(shareUrl) },
    { name: 'Facebook', mark: 'f', color: 'bg-blue-700', url: () => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) },
    { name: 'TikTok', mark: '♪', color: 'bg-black', url: () => 'https://www.tiktok.com/' },
    { name: 'Messenger', mark: 'm', color: 'bg-blue-600', url: () => 'https://www.facebook.com/dialog/send?link=' + encodeURIComponent(shareUrl) },
    { name: 'Gmail', mark: 'M', color: 'bg-red-600', url: () => 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent('LogBook eQSL EXPRESS') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
    { name: 'Outlook', mark: 'O', color: 'bg-sky-700', url: () => 'https://outlook.live.com/mail/0/deeplink/compose?subject=' + encodeURIComponent('LogBook eQSL Express') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
  ];
  const handleShareChoice = async (name: string, url: string) => {
    setShareMenuOpen(false);
    if (name === 'Facebook' || name === 'Messenger') {
      // En móviles, el menú nativo permite compartir y volver a la app sin
      // navegar la pestaña actual hacia el diálogo externo de Facebook.
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'LogBook eQSL Express', text: shareText, url: shareUrl });
          return;
        } catch (error) {
          // Cancelar el menú de compartir no debe sacar al usuario de LogBook.
          if ((error as Error)?.name === 'AbortError') return;
        }
      }
      try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); } catch { /* Se ofrece copiar manualmente abajo. */ }
      window.alert('No se abrió el menú para compartir. El enlace está copiado si tu navegador lo permite; seguís en LogBook.');
      return;
    }
    if (name === 'Instagram' || name === 'TikTok') {
      try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); } catch { /* El usuario puede copiar el enlace manualmente si el navegador lo permite. */ }
      window.open(url, '_blank', 'noopener,noreferrer');
      window.alert('Copiá el enlace de LogBook eQSL Express y pegalo en tu publicación.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Colores del indicativo inspirados en la bandera del país seleccionado.
  // Se admiten nombres habituales y códigos de país guardados por la app.
  const getCallsignCharacterClass = (character: string, countryValue: string) => {
    const key = (countryValue || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const palettes: Record<string, { letters: string; digits: string }> = {
      argentina: { letters: 'text-sky-500', digits: 'text-yellow-500' }, ar: { letters: 'text-sky-500', digits: 'text-yellow-500' }, arg: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      brasil: { letters: 'text-green-600', digits: 'text-yellow-500' }, brazil: { letters: 'text-green-600', digits: 'text-yellow-500' }, br: { letters: 'text-green-600', digits: 'text-yellow-500' },
      espana: { letters: 'text-red-600', digits: 'text-yellow-500' }, spain: { letters: 'text-red-600', digits: 'text-yellow-500' }, es: { letters: 'text-red-600', digits: 'text-yellow-500' },
      uruguay: { letters: 'text-sky-500', digits: 'text-yellow-500' }, uy: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      colombia: { letters: 'text-blue-600', digits: 'text-yellow-500' }, co: { letters: 'text-blue-600', digits: 'text-yellow-500' },
      venezuela: { letters: 'text-blue-600', digits: 'text-yellow-500' }, ve: { letters: 'text-blue-600', digits: 'text-yellow-500' },
      ecuador: { letters: 'text-blue-700', digits: 'text-yellow-500' }, ec: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      chile: { letters: 'text-red-600', digits: 'text-blue-600' }, cl: { letters: 'text-red-600', digits: 'text-blue-600' },
      mexico: { letters: 'text-green-600', digits: 'text-red-600' }, mx: { letters: 'text-green-600', digits: 'text-red-600' },
      portugal: { letters: 'text-green-600', digits: 'text-red-600' }, pt: { letters: 'text-green-600', digits: 'text-red-600' },
      italia: { letters: 'text-green-600', digits: 'text-red-600' }, italy: { letters: 'text-green-600', digits: 'text-red-600' }, it: { letters: 'text-green-600', digits: 'text-red-600' },
      francia: { letters: 'text-blue-700', digits: 'text-red-600' }, france: { letters: 'text-blue-700', digits: 'text-red-600' }, fr: { letters: 'text-blue-700', digits: 'text-red-600' },
      alemania: { letters: 'text-red-600', digits: 'text-yellow-500' }, germany: { letters: 'text-red-600', digits: 'text-yellow-500' }, de: { letters: 'text-red-600', digits: 'text-yellow-500' },
      'estados unidos': { letters: 'text-blue-700', digits: 'text-red-600' }, usa: { letters: 'text-blue-700', digits: 'text-red-600' }, us: { letters: 'text-blue-700', digits: 'text-red-600' },
      'reino unido': { letters: 'text-blue-700', digits: 'text-red-600' }, uk: { letters: 'text-blue-700', digits: 'text-red-600' }, gb: { letters: 'text-blue-700', digits: 'text-red-600' },
      canada: { letters: 'text-red-600', digits: 'text-red-600' }, ca: { letters: 'text-red-600', digits: 'text-red-600' },
      japon: { letters: 'text-red-600', digits: 'text-slate-950' }, japan: { letters: 'text-red-600', digits: 'text-slate-950' }, jp: { letters: 'text-red-600', digits: 'text-slate-950' },
      australia: { letters: 'text-blue-700', digits: 'text-red-600' }, au: { letters: 'text-blue-700', digits: 'text-red-600' },
      'nueva zelanda': { letters: 'text-blue-700', digits: 'text-red-600' }, 'new zealand': { letters: 'text-blue-700', digits: 'text-red-600' }, nz: { letters: 'text-blue-700', digits: 'text-red-600' },
      paraguay: { letters: 'text-red-600', digits: 'text-blue-700' }, py: { letters: 'text-red-600', digits: 'text-blue-700' },
      bolivia: { letters: 'text-green-600', digits: 'text-red-600' }, bo: { letters: 'text-green-600', digits: 'text-red-600' },
      peru: { letters: 'text-red-600', digits: 'text-red-600' }, pe: { letters: 'text-red-600', digits: 'text-red-600' },
      // Países adicionales (códigos ISO y nombres comunes); los tonos representan colores de sus banderas.
      af: { letters: 'text-green-600', digits: 'text-red-600' }, al: { letters: 'text-red-600', digits: 'text-slate-950' },
      dz: { letters: 'text-green-600', digits: 'text-red-600' }, ad: { letters: 'text-red-600', digits: 'text-yellow-500' },
      ao: { letters: 'text-red-600', digits: 'text-yellow-500' }, ag: { letters: 'text-red-600', digits: 'text-blue-700' },
      am: { letters: 'text-red-600', digits: 'text-blue-700' }, az: { letters: 'text-blue-700', digits: 'text-red-600' },
      bs: { letters: 'text-blue-700', digits: 'text-yellow-500' }, bh: { letters: 'text-red-600', digits: 'text-slate-950' },
      bd: { letters: 'text-green-600', digits: 'text-red-600' }, bb: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      by: { letters: 'text-red-600', digits: 'text-green-600' }, bz: { letters: 'text-blue-700', digits: 'text-red-600' },
      bj: { letters: 'text-green-600', digits: 'text-yellow-500' }, bt: { letters: 'text-yellow-500', digits: 'text-orange-600' },
      ba: { letters: 'text-blue-700', digits: 'text-yellow-500' }, bw: { letters: 'text-sky-500', digits: 'text-slate-950' },
      bn: { letters: 'text-yellow-500', digits: 'text-slate-950' }, bg: { letters: 'text-red-600', digits: 'text-green-600' },
      bf: { letters: 'text-red-600', digits: 'text-green-600' }, bi: { letters: 'text-red-600', digits: 'text-green-600' },
      kh: { letters: 'text-blue-700', digits: 'text-red-600' }, cm: { letters: 'text-green-600', digits: 'text-red-600' },
      cv: { letters: 'text-blue-700', digits: 'text-red-600' }, cf: { letters: 'text-blue-700', digits: 'text-green-600' },
      td: { letters: 'text-blue-700', digits: 'text-red-600' }, cn: { letters: 'text-red-600', digits: 'text-yellow-500' },
      km: { letters: 'text-green-600', digits: 'text-yellow-500' }, cg: { letters: 'text-green-600', digits: 'text-red-600' },
      cd: { letters: 'text-blue-700', digits: 'text-red-600' }, ci: { letters: 'text-orange-600', digits: 'text-green-600' },
      hr: { letters: 'text-red-600', digits: 'text-blue-700' }, cy: { letters: 'text-orange-500', digits: 'text-green-600' },
      dj: { letters: 'text-sky-500', digits: 'text-green-600' }, dm: { letters: 'text-green-600', digits: 'text-yellow-500' },
      eg: { letters: 'text-red-600', digits: 'text-slate-950' }, sv: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      er: { letters: 'text-red-600', digits: 'text-green-600' }, ee: { letters: 'text-blue-700', digits: 'text-slate-950' },
      et: { letters: 'text-blue-700', digits: 'text-slate-950' }, fj: { letters: 'text-sky-500', digits: 'text-red-600' },
      ga: { letters: 'text-green-600', digits: 'text-yellow-500' }, gm: { letters: 'text-red-600', digits: 'text-green-600' },
      ge: { letters: 'text-red-600', digits: 'text-slate-950' }, gh: { letters: 'text-green-600', digits: 'text-yellow-500' },
      gd: { letters: 'text-red-600', digits: 'text-yellow-500' }, gt: { letters: 'text-sky-500', digits: 'text-slate-950' },
      gn: { letters: 'text-green-600', digits: 'text-yellow-500' }, gw: { letters: 'text-red-600', digits: 'text-green-600' },
      gy: { letters: 'text-green-600', digits: 'text-yellow-500' }, ht: { letters: 'text-blue-700', digits: 'text-red-600' },
      hn: { letters: 'text-sky-500', digits: 'text-slate-950' }, is: { letters: 'text-blue-700', digits: 'text-red-600' },
      ir: { letters: 'text-green-600', digits: 'text-red-600' }, iq: { letters: 'text-red-600', digits: 'text-green-600' },
      il: { letters: 'text-blue-700', digits: 'text-slate-950' }, jm: { letters: 'text-green-600', digits: 'text-yellow-500' },
      jo: { letters: 'text-red-600', digits: 'text-green-600' }, kz: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      ke: { letters: 'text-red-600', digits: 'text-green-600' }, kw: { letters: 'text-green-600', digits: 'text-red-600' },
      kg: { letters: 'text-red-600', digits: 'text-yellow-500' }, la: { letters: 'text-red-600', digits: 'text-blue-700' },
      lv: { letters: 'text-red-600', digits: 'text-slate-950' }, lb: { letters: 'text-red-600', digits: 'text-green-600' },
      ls: { letters: 'text-blue-700', digits: 'text-green-600' }, lr: { letters: 'text-red-600', digits: 'text-blue-700' },
      ly: { letters: 'text-green-600', digits: 'text-red-600' }, li: { letters: 'text-red-600', digits: 'text-blue-700' },
      lt: { letters: 'text-yellow-500', digits: 'text-green-600' }, lu: { letters: 'text-sky-500', digits: 'text-red-600' },
      mg: { letters: 'text-red-600', digits: 'text-green-600' }, mw: { letters: 'text-red-600', digits: 'text-slate-950' },
      my: { letters: 'text-blue-700', digits: 'text-red-600' }, mv: { letters: 'text-red-600', digits: 'text-green-600' },
      ml: { letters: 'text-green-600', digits: 'text-yellow-500' }, mt: { letters: 'text-red-600', digits: 'text-slate-950' },
      mr: { letters: 'text-green-600', digits: 'text-yellow-500' }, mu: { letters: 'text-red-600', digits: 'text-green-600' },
      md: { letters: 'text-blue-700', digits: 'text-red-600' }, mc: { letters: 'text-red-600', digits: 'text-slate-950' },
      mn: { letters: 'text-red-600', digits: 'text-blue-700' }, me: { letters: 'text-red-600', digits: 'text-yellow-500' },
      ma: { letters: 'text-red-600', digits: 'text-green-600' }, mz: { letters: 'text-green-600', digits: 'text-red-600' },
      mm: { letters: 'text-yellow-500', digits: 'text-green-600' }, na: { letters: 'text-blue-700', digits: 'text-red-600' },
      np: { letters: 'text-red-600', digits: 'text-blue-700' }, ne: { letters: 'text-orange-600', digits: 'text-green-600' },
      ng: { letters: 'text-green-600', digits: 'text-slate-950' }, kp: { letters: 'text-red-600', digits: 'text-blue-700' },
      mk: { letters: 'text-red-600', digits: 'text-yellow-500' }, om: { letters: 'text-red-600', digits: 'text-green-600' },
      pk: { letters: 'text-green-600', digits: 'text-slate-950' }, ps: { letters: 'text-red-600', digits: 'text-green-600' },
      ph: { letters: 'text-blue-700', digits: 'text-red-600' }, qa: { letters: 'text-purple-800', digits: 'text-slate-950' },
      rw: { letters: 'text-sky-500', digits: 'text-yellow-500' }, kn: { letters: 'text-green-600', digits: 'text-red-600' },
      lc: { letters: 'text-sky-500', digits: 'text-yellow-500' }, vc: { letters: 'text-blue-700', digits: 'text-green-600' },
      ws: { letters: 'text-red-600', digits: 'text-blue-700' }, sm: { letters: 'text-blue-700', digits: 'text-red-600' },
      st: { letters: 'text-green-600', digits: 'text-yellow-500' }, sa: { letters: 'text-green-600', digits: 'text-slate-950' },
      sn: { letters: 'text-green-600', digits: 'text-yellow-500' }, rs: { letters: 'text-red-600', digits: 'text-blue-700' },
      sc: { letters: 'text-sky-500', digits: 'text-yellow-500' }, sl: { letters: 'text-green-600', digits: 'text-blue-700' },
      sg: { letters: 'text-red-600', digits: 'text-slate-950' }, sk: { letters: 'text-blue-700', digits: 'text-red-600' },
      si: { letters: 'text-blue-700', digits: 'text-red-600' }, so: { letters: 'text-sky-500', digits: 'text-slate-950' },
      za: { letters: 'text-green-600', digits: 'text-yellow-500' }, ss: { letters: 'text-red-600', digits: 'text-green-600' },
      lk: { letters: 'text-orange-600', digits: 'text-green-600' }, sd: { letters: 'text-red-600', digits: 'text-green-600' },
      sr: { letters: 'text-green-600', digits: 'text-red-600' }, sz: { letters: 'text-blue-700', digits: 'text-red-600' },
      sy: { letters: 'text-red-600', digits: 'text-green-600' }, tj: { letters: 'text-red-600', digits: 'text-green-600' },
      tz: { letters: 'text-green-600', digits: 'text-yellow-500' }, th: { letters: 'text-red-600', digits: 'text-blue-700' },
      tl: { letters: 'text-red-600', digits: 'text-yellow-500' }, tg: { letters: 'text-green-600', digits: 'text-yellow-500' },
      to: { letters: 'text-red-600', digits: 'text-slate-950' }, tt: { letters: 'text-red-600', digits: 'text-slate-950' },
      tn: { letters: 'text-red-600', digits: 'text-slate-950' }, tm: { letters: 'text-green-600', digits: 'text-slate-950' },
      ug: { letters: 'text-yellow-500', digits: 'text-black' }, ae: { letters: 'text-green-600', digits: 'text-red-600' },
      uz: { letters: 'text-sky-500', digits: 'text-green-600' }, vu: { letters: 'text-green-600', digits: 'text-red-600' },
      ye: { letters: 'text-red-600', digits: 'text-slate-950' }, zm: { letters: 'text-green-600', digits: 'text-orange-600' },
      zw: { letters: 'text-green-600', digits: 'text-yellow-500' }
    };
    const palette = palettes[key] || { letters: 'text-slate-950', digits: 'text-slate-950' };
    return /\d/.test(character) ? palette.digits : palette.letters;
  };
  const readCallsign = () => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
  const [callsign, setCallsign] = useState(() => readCallsign());
  const [country, setCountry] = useState(() => localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
  // El encabezado queda bloqueado en la imagen que ya estaba mostrándose.
  // La galería de eQSL es independiente y nunca debe reemplazar esta imagen.
  const readHeaderImage = () => {
    // El encabezamiento usa exclusivamente su propia imagen, no la imagen anclada
    // como fondo eQSL. La selección explícita tiene prioridad sobre copias antiguas.
    const explicitlyChosen = localStorage.getItem('app_header_image');
    if (explicitlyChosen) {
      if (localStorage.getItem('app_header_image_locked') !== explicitlyChosen) {
        localStorage.setItem('app_header_image_locked', explicitlyChosen);
      }
      return explicitlyChosen;
    }
    return localStorage.getItem('app_header_image_locked') || '';
  };
  const [headerImage, setHeaderImage] = useState(() => readHeaderImage());
  const [appIcon, setAppIcon] = useState(() => localStorage.getItem('app_icon_image') || '');

  useEffect(() => {
    const syncCallsign = async () => {
      const savedCallsign = readCallsign();
      setCallsign(savedCallsign);
      // If the local label was lost but this device still has its identity token,
      // recover the callsign associated with that token from the public-chat RPC.
      if (!savedCallsign && supabase) {
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (token) {
          const { data, error } = await supabase.rpc('resolve_community_callsign', { p_token: token });
          const recovered = !error && typeof data === 'string' ? data.trim().toUpperCase() : '';
          if (recovered) {
            localStorage.setItem('community_chat_sd', recovered);
            setCallsign(recovered);
            window.dispatchEvent(new Event('user-profile-updated'));
          }
        }
      }
      setCountry(localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
      setShareLanguage(getInitialAppLanguage());
      setHeaderImage(readHeaderImage());
      const nextIcon = localStorage.getItem('app_icon_image') || '';
      setAppIcon(nextIcon);
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => { link.href = nextIcon || '/icon.svg'; });
    };
    syncCallsign();
    window.addEventListener('user-profile-updated', syncCallsign);
    window.addEventListener('storage', syncCallsign);
    window.addEventListener('user-branding-updated', syncCallsign);
    return () => {
      window.removeEventListener('user-profile-updated', syncCallsign);
      window.removeEventListener('storage', syncCallsign);
      window.removeEventListener('user-branding-updated', syncCallsign);
    };
  }, []);

  useEffect(() => {
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = appIcon || '/icon.svg';
    });
  }, [appIcon]);

  useEffect(() => {
    const checkInstalled = () => {
      const runningStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      const previouslyInstalled = localStorage.getItem('logbook_pwa_installed') === '1';
      if (runningStandalone || previouslyInstalled) setIsInstalled(true);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onAppInstalled = () => {
      localStorage.setItem('logbook_pwa_installed', '1');
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const registerInstallation = async () => {
      if (!supabase) return;
      try {
        let installId = localStorage.getItem('logbook_installation_id');
        if (!installId) {
          installId = crypto.randomUUID();
          localStorage.setItem('logbook_installation_id', installId);
        }
        const { data, error } = await supabase.rpc('register_app_installation', { p_install_id: installId });
        if (error) throw error;
        const count = Number(data);
        if (!cancelled && Number.isFinite(count) && count >= 0) setAppUserCount(count);
      } catch (error) {
        console.warn('No se pudo actualizar el contador de usuarios de LogBook.', error);
      }
    };
    void registerInstallation();
    return () => { cancelled = true; };
  }, []);

  const handleInstall = () => {
    if (isInstalled) {
      window.alert('LogBook eQSL Express ya está instalada en este equipo.');
      return;
    }
    if (installPrompt) {
      void (async () => {
        try {
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice?.outcome === 'accepted') setIsInstalled(true);
        } finally {
          setInstallPrompt(null);
        }
      })();
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(isIOS
      ? 'Para instalar en iPhone/iPad: tocá Compartir en Safari y elegí “Agregar a pantalla de inicio”.'
      : 'No hace falta ingresar correo ni teléfono. Para instalar, abrí el menú del navegador (⋮) y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”. Si esa opción no aparece, la app puede seguir usándose desde el navegador.');
  };

  return (
    <>
    <header className="bg-slate-900/90 border-b border-slate-800">
      <div className="relative w-full px-2 sm:px-4 pt-3.5 pb-3.5 flex flex-col gap-0">
        {/* Fila superior reservada para reloj, clima e indicativo; no se superpone con el logo. */}
        <div className="w-full flex items-center justify-between gap-3 rounded-t-xl border-b border-sky-500/70 bg-black px-3 py-2 sm:px-5 sm:py-3 shadow-[0_4px_18px_rgba(0,170,255,0.18)]">
          <div className="min-w-0 flex-1 flex flex-row items-center gap-2">
            {callsign && (
              <span data-no-translate="true" translate="no" className="inline-flex min-h-9 sm:min-h-12 min-w-0 shrink items-center justify-center rounded-lg border border-sky-400/70 bg-slate-950 px-2 sm:px-4 py-1.5 sm:py-2 font-mono text-sm sm:text-2xl font-black shadow-[0_0_14px_rgba(0,170,255,0.16)] break-all" title={`Señal distintiva: ${callsign}`}>
                {callsign.split('').map((character, index) => (
                  <span key={index} className={getCallsignCharacterClass(character, country)}>{character}</span>
                ))}
              </span>
            )}
            <LanguageSelector
              value={shareLanguage}
              className="min-w-0 max-w-[8.5rem] flex-none sm:max-w-[12rem]"
              onChange={(nextLanguage) => {
                localStorage.setItem('app_language', nextLanguage);
                setShareLanguage(nextLanguage);
                document.documentElement.lang = nextLanguage;
                window.dispatchEvent(new Event('user-profile-updated'));
              }}
            />
            <button type="button" onClick={() => {
              // En contenedores nativos, usar el puente si está disponible.
              const nativeApp = (window as Window & { LogBookApp?: { closeApp?: () => void } }).LogBookApp;
              if (nativeApp?.closeApp) {
                try {
                  nativeApp.closeApp();
                  return;
                } catch (error) {
                  console.warn('No se pudo cerrar desde el contenedor nativo; se usará la navegación web.', error);
                }
              }

              // Los navegadores no permiten cerrar por código una pestaña abierta
              // manualmente. Intentamos cerrar cuando esté permitido y, si no,
              // volvemos a la página anterior sin que la app intercepte Atrás.
              const hasPreviousPage = window.history.length > 1;
              window.close();
              if (hasPreviousPage) {
                window.history.back();
              } else {
                window.alert('Para salir de LogBook eQSL EXPRESS, cerrá esta pestaña del navegador. Si la instalaste como aplicación, usá el gesto o botón Inicio del dispositivo y cerrala desde las aplicaciones recientes. Los navegadores no permiten que una página cierre por la fuerza una pestaña abierta manualmente.');
              }
            }} aria-label="Cerrar app" title="Cerrar" className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-700 bg-red-600 px-2.5 text-black hover:bg-red-500">
              <X className="h-4 w-4 stroke-[3]" />
              <span className="text-xs font-bold">Cerrar</span>
            </button>
          </div>
        </div>
        {/* Encabezamiento panorámico; la brújula se abre en un panel independiente */}
        <div className="-mt-3 flex w-full min-w-0 items-center overflow-hidden rounded-b-xl border-b border-sky-500/60 bg-black">
          <div className="min-w-0 flex-1 overflow-hidden">
            <img src="/logbook-header.svg?v=20261029b" alt="LogBook eQSL EXPRESS" className="block w-full h-auto max-h-none object-contain object-center mx-auto" />
          </div>
        </div>
        <div className="mt-1 flex min-h-5 w-full items-center justify-center gap-2 bg-slate-700/80 py-0.5 text-[11px] leading-tight">
          <span className="font-semibold tracking-wide text-sky-300">USUARIOS</span>
          <span className="font-bold tabular-nums text-white" aria-live="polite">{appUserCount === null ? '—' : appUserCount.toLocaleString('es-ES')}</span>
        </div>
      </div>
    </header>
      {/* Controles esenciales: permanecen accesibles al desplazarse por la página. */}
      <div className="relative z-40 border-b border-slate-800 bg-slate-900 shadow-md">
        <div className="relative w-full px-2 sm:px-4 py-0.5 sm:py-1 flex flex-col gap-0.5">
        {/* Zona de instalación, compartir app, brújula y ajustes */}
        <div className="flex w-full flex-wrap sm:flex-nowrap items-center justify-center gap-1 sm:gap-1.5">
          {!isInstalled && <button
            type="button"
            onClick={() => { void handleInstall(); }}
            className="inline-flex min-h-9 items-center gap-1.5 px-2 sm:px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 text-[11px] sm:text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
            title="Instalar LB EQSL EXPRESS en este equipo"
          >
            {isInstalled ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span className="flex flex-col items-start leading-tight">
              <span>{isInstalled ? 'App instalada' : 'Instalar app'}</span>
              <span className="hidden sm:inline text-[10px] font-medium opacity-90">Muy liviana: ocupa muy poco espacio</span>
            </span>
          </button>}

          {/* Compartir app y sus accesos meteorológicos en una columna alineada */}
          <div className="flex min-w-0 flex-col items-stretch gap-0">
            <div className="relative">
              <button
                type="button"
                onClick={() => setShareMenuOpen((open) => !open)}
                aria-expanded={shareMenuOpen}
                aria-haspopup="menu"
                className="inline-flex min-h-9 w-full min-w-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-500 bg-emerald-600 px-2 sm:px-3 py-1.5 text-[11px] sm:text-xs font-semibold text-white shadow-sm transition-all cursor-pointer hover:bg-emerald-500"
                title="Compartir LogBook eQSL Express en tus redes"
              >
                <Share2 className="w-4 h-4" />
                <span>Compartir app</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
              {shareMenuOpen && (
                <div role="menu" className="fixed left-1/2 top-auto z-[100] mt-2 w-[min(15rem,calc(100vw-2rem))] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl sm:absolute sm:left-1/2 sm:top-full sm:w-60 sm:-translate-x-1/2">
                  <p className="px-2 py-1.5 text-[11px] text-slate-400">Elegí dónde compartir</p>
                  <div className="grid grid-cols-2 gap-1">
                    {shareOptions.map((option) => (
                      <button key={option.name} type="button" role="menuitem"
                        onClick={() => handleShareChoice(option.name, option.url())}
                        className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-100 hover:bg-slate-800">
                        <span className={option.color + " flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"}>{option.mark}</span>
                        <span>{option.name}</span>
                      </button>
                    ))}
                  </div>
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); window.alert('Enlace copiado.'); } catch { window.prompt('Copiá el enlace de la app:', shareUrl); } setShareMenuOpen(false); }}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
                    <Copy className="h-4 w-4" /> Copiar enlace de la app
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Botón para desplegar la brújula */}
          <button
            type="button"
            onClick={() => {
              const nextOpen = !compassOpen;
              setCompassOpen(nextOpen);
              if (nextOpen && compassHeading === null) void activateCompass();
            }}
            aria-expanded={compassOpen}
            className="inline-flex min-h-9 min-w-0 shrink items-center justify-center gap-1 rounded-lg border border-slate-500 bg-amber-500 px-2 sm:px-2.5 py-1.5 text-[11px] sm:text-xs font-bold text-slate-950 shadow-sm hover:bg-amber-400"
            title="Abrir brújula del dispositivo"
          >
            <Compass className="h-4 w-4" /> Brújula
          </button>

        {/* Botón Ajustes */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="inline-flex min-h-9 min-w-9 items-center justify-center p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg border border-slate-500 transition-colors cursor-pointer"
            title="Ajustes de estación"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      <div className="mt-0.5 flex w-full flex-wrap items-center justify-center gap-1 sm:gap-1.5">
        {/* Información UTC y meteorológica debajo de la fila principal de accesos */}
            <div className="flex flex-row items-center justify-start gap-0 whitespace-nowrap">
        <div className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-500 bg-black px-2 sm:px-3 py-1.5 font-mono text-[11px] sm:text-sm font-bold shadow-sm" title={`Hora UTC: ${localDate}`}>
          <span className="rounded-sm bg-white px-1.5 py-0.5 text-black">UTC</span>
          <span className="whitespace-nowrap text-white">{utcClock}</span>
        </div>
        <div className="flex min-h-9 shrink-0 flex-nowrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/95 px-2 sm:px-2.5 py-1 text-[11px] sm:text-sm font-bold text-white shadow-sm" title="Temperatura y humedad actuales estimadas para la ubicación detectada por Internet"><span className="inline-flex items-center gap-1" title={localWeather ? `Temperatura: ${localWeather.temperature}°C` : weatherStatus}><Thermometer className="h-4 w-4 text-red-400" />{localWeather ? `${localWeather.temperature}°C` : '— °C'}</span><span className="inline-flex items-center gap-1" title={localWeather ? `Humedad: ${localWeather.humidity}%` : weatherStatus}><Droplets className="h-4 w-4 text-sky-400" />{localWeather ? `${localWeather.humidity}%` : '— %'}</span>{!localWeather && <span className="text-[10px] font-normal text-slate-300">{weatherStatus}</span>}</div>
        <button type="button" onClick={toggleForecast} aria-expanded={forecastOpen} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1 rounded-lg border border-cyan-500 bg-cyan-950 px-2 sm:px-3 py-1 text-[11px] sm:text-xs font-bold text-cyan-100 shadow-sm hover:bg-cyan-900">
          <span className="inline-flex items-center gap-1"><CloudSun className="h-4 w-4" /> Clima</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${forecastOpen ? 'rotate-180' : ''}`} />
        </button>
        {forecastOpen && <div className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] max-w-[calc(100vw-1.5rem)] rounded-lg border border-slate-600 bg-slate-900 p-2.5 text-white shadow-lg">
          <div className="mb-2 flex items-center justify-between gap-2">
            <strong className="text-xs">Pronóstico para 7 días</strong>
            <button type="button" onClick={() => { setWeeklyForecast([]); setForecastStatus(''); setForecastOpen(false); window.setTimeout(() => { setForecastOpen(true); if (navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { void loadWeeklyForecast(p.coords.latitude, p.coords.longitude); }, () => { if (ipCoordinates) void loadWeeklyForecast(ipCoordinates.latitude, ipCoordinates.longitude); else setForecastStatus('No se pudo obtener la ubicación.'); }, { timeout: 8000, maximumAge: 1800000 }); else if (ipCoordinates) void loadWeeklyForecast(ipCoordinates.latitude, ipCoordinates.longitude); }, 0); }} className="text-[10px] text-cyan-300 underline">Actualizar</button>
          </div>
          {forecastLoading && <p className="flex items-center gap-2 py-2 text-xs text-slate-300"><LoaderCircle className="h-4 w-4 animate-spin" /> Cargando pronóstico…</p>}
          {!forecastLoading && weeklyForecast.length > 0 && <div className="space-y-1.5">
            {weeklyForecast.map((day) => <div key={day.date} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-t border-slate-700 py-1.5 text-xs">
              <div className="flex min-w-0 items-center gap-2"><WeatherIcon code={day.code} /><span className="truncate">{new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: '2-digit' })}<span className="block text-[10px] text-slate-400">{describeWeatherCode(day.code)}</span></span></div>
              <span className="whitespace-nowrap font-mono"><span className="text-red-300">{Math.round(day.max)}°</span> / <span className="text-sky-300">{Math.round(day.min)}°</span></span>
              <span className="whitespace-nowrap text-sky-200" title="Probabilidad máxima de precipitación">{Number.isFinite(day.rain) ? Math.round(day.rain) + '%' : '—'}</span>
            </div>)}
          </div>}
          {!forecastLoading && forecastStatus && <p className="mt-2 text-[10px] text-slate-300">{forecastStatus}</p>}
          <p className="mt-2 border-t border-slate-700 pt-2 text-[10px] text-slate-400">Datos meteorológicos por ubicación del dispositivo. Si no autorizás la ubicación, se intentará usar la ubicación aproximada por Internet. Fuente: Open-Meteo.</p>
        </div>}
            </div>
        </div>
          </div>
      </div>

      {compassOpen && (
        <section aria-label="Brújula del dispositivo" className="mx-auto mt-3 w-full max-w-sm rounded-2xl border border-amber-400 bg-slate-950 p-4 text-white shadow-xl">
          <div className="flex flex-col items-center gap-3">
            <h2 className="text-sm font-bold">Brújula del dispositivo</h2>
            <button type="button" onClick={() => { void activateCompass(); }} title="Activar o reintentar el sensor"
              className="relative flex h-48 w-48 items-center justify-center rounded-full border-4 border-slate-300 bg-white text-slate-900 shadow-inner"
              style={{ touchAction: 'manipulation' }}>
              <span className="absolute top-3 text-lg font-black text-red-600">N</span>
              <span className="absolute bottom-3 text-lg font-black">S</span>
              <span className="absolute left-3 text-lg font-black">O</span>
              <span className="absolute right-3 text-lg font-black">E</span>
              <span className="absolute inset-7 rounded-full border border-slate-300" />
              <svg aria-label="Aguja: punta roja hacia el norte" viewBox="0 0 100 100" className="h-24 w-24 transition-transform duration-150" style={{ transform: `rotate(${compassHeading === null ? 0 : -compassHeading}deg)` }}>
                <circle cx="50" cy="50" r="4" fill="#334155" />
                <path d="M50 8 L62 51 L50 45 L38 51 Z" fill="#dc2626" stroke="#991b1b" strokeWidth="1.5" />
                <path d="M50 92 L38 49 L50 55 L62 49 Z" fill="#334155" stroke="#0f172a" strokeWidth="1.5" />
                <circle cx="50" cy="50" r="3" fill="#f8fafc" stroke="#334155" strokeWidth="1.5" />
              </svg>
            </button>
            <p className="text-2xl font-black tabular-nums">{compassHeading === null ? (isFixedDevice ? 'N ↑' : '—°') : `${Math.round(compassHeading)}°`}</p>
            <p role="status" className="text-center text-xs text-slate-300">{compassStatus}</p>
            {compassHeading === null && !isFixedDevice && (
              <button type="button" onClick={() => { void activateCompass(); }}
                className="w-full rounded-xl border border-cyan-400 bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-600">
                Activar / conceder permiso de brújula
              </button>
            )}
            <button type="button" onClick={() => setCompassOpen(false)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
              Cerrar brújula
            </button>
          </div>
        </section>
      )}
    </>
  );
};
