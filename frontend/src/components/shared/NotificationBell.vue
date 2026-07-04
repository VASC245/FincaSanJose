<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Bell, BellRing, BellOff } from 'lucide-vue-next'
import {
  pushSupported,
  isSubscribed,
  enablePushNotifications,
  disablePushNotifications,
  sendTestNotification
} from '@/services/pushService'

const supported = ref(true)
const subscribed = ref(false)
const busy = ref(false)
const showMenu = ref(false)

onMounted(async () => {
  supported.value = pushSupported()
  if (supported.value) subscribed.value = await isSubscribed()
})

async function toggle() {
  if (!supported.value) {
    alert('Este navegador no soporta notificaciones.\n\nEn iPhone: agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde ahí (requiere iOS 16.4+).')
    return
  }
  busy.value = true
  try {
    if (subscribed.value) {
      await disablePushNotifications()
      subscribed.value = false
    } else {
      await enablePushNotifications()
      subscribed.value = true
      showMenu.value = true
    }
  } catch (e) {
    alert((e as Error).message)
  } finally {
    busy.value = false
  }
}

async function sendTest() {
  busy.value = true
  try {
    const msg = await sendTestNotification()
    showMenu.value = false
    console.info('[push]', msg)
  } catch (e) {
    alert('Error enviando prueba: ' + (e as Error).message)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="relative">
    <button
      class="p-2 rounded-lg hover:bg-gray-100 transition-colors"
      :class="{ 'opacity-50': busy }"
      :disabled="busy"
      :title="subscribed ? 'Notificaciones activadas — toca para desactivar' : 'Activar notificaciones en este teléfono'"
      @click="toggle"
    >
      <BellRing v-if="subscribed" class="w-5 h-5 text-emerald-600" />
      <BellOff v-else-if="!supported" class="w-5 h-5 text-gray-300" />
      <Bell v-else class="w-5 h-5 text-gray-500" />
    </button>

    <!-- Confirmación tras activar -->
    <div
      v-if="showMenu"
      class="absolute right-0 top-11 z-30 w-64 rounded-xl border border-gray-200 bg-white shadow-lg p-3 space-y-2"
    >
      <p class="text-sm text-gray-700 font-medium">✓ Notificaciones activadas</p>
      <p class="text-xs text-gray-500">
        Recibirás un aviso diario a las 6 a.m. con tareas por vencer, partos próximos y stock bajo.
      </p>
      <div class="flex gap-2">
        <button
          class="flex-1 text-xs font-medium rounded-lg bg-emerald-600 text-white py-1.5 hover:bg-emerald-700 disabled:opacity-50"
          :disabled="busy"
          @click="sendTest"
        >
          Enviar prueba
        </button>
        <button
          class="flex-1 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 py-1.5 hover:bg-gray-50"
          @click="showMenu = false"
        >
          Cerrar
        </button>
      </div>
    </div>
  </div>
</template>
