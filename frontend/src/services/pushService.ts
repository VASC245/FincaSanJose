import { supabase } from '@/lib/supabase'

// Clave pública VAPID — es pública por diseño (la privada vive como
// secreto de la Edge Function send-push)
const VAPID_PUBLIC_KEY =
  'BEG8nAcY7ESpeXVKoAAnBrrn-513RAwmpGq0c3GSZeKigqgdBo01OMf9l95LqTBhp3FZMzICwGokL9bFHm0JLd8'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function permissionState(): NotificationPermission | 'unsupported' {
  return pushSupported() ? Notification.permission : 'unsupported'
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** Pide permiso, se suscribe y guarda la suscripción en Supabase. */
export async function enablePushNotifications(): Promise<void> {
  if (!pushSupported()) {
    throw new Error(
      'Este navegador no soporta notificaciones. En iPhone: agrega la app a la pantalla de inicio (iOS 16.4+) y ábrela desde ahí.'
    )
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Permiso de notificaciones denegado. Actívalo en la configuración del navegador.')
  }

  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  }

  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('No se pudo obtener la suscripción push.')
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
      device_name: navigator.userAgent.slice(0, 120)
    },
    { onConflict: 'endpoint' }
  )
  if (error) throw error
}

export async function disablePushNotifications(): Promise<void> {
  const sub = await getCurrentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** true si este dispositivo ya está suscrito y guardado. */
export async function isSubscribed(): Promise<boolean> {
  const sub = await getCurrentSubscription()
  return !!sub && Notification.permission === 'granted'
}

/** Dispara un envío de prueba inmediato vía la Edge Function. */
export async function sendTestNotification(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('send-push', {
    body: { kind: 'test' }
  })
  if (error) throw error
  return (data as { message?: string })?.message ?? 'Enviado'
}
