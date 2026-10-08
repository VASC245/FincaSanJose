<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import QrScanner from 'qr-scanner'
import { ScanLine, Flashlight, FlashlightOff, Search, CameraOff, Link2, ChevronRight } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import { useAnimalsStore } from '@/stores/animals'
import { parseScan, findByCode, animalPath, normalizeRfid } from '@/services/scanService'
import type { Animal } from '@/types'

const router = useRouter()
const animalsStore = useAnimalsStore()

// ─── Cámara (QR) ──────────────────────────────────────────────────────────────

const video = ref<HTMLVideoElement | null>(null)
let scanner: QrScanner | null = null
const cameraState = ref<'starting' | 'on' | 'denied' | 'none' | 'off'>('starting')
const hasFlash = ref(false)
const flashOn = ref(false)
const busy = ref(false)

async function startCamera() {
  if (!video.value) return
  cameraState.value = 'starting'
  try {
    if (!(await QrScanner.hasCamera())) {
      cameraState.value = 'none'
      return
    }
    scanner = new QrScanner(video.value, (r) => handleCode(r.data), {
      preferredCamera: 'environment',
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 8,
      returnDetailedScanResult: true
    })
    await scanner.start()
    cameraState.value = 'on'
    hasFlash.value = await scanner.hasFlash().catch(() => false)
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    cameraState.value = /denied|permission|NotAllowed/i.test(msg) ? 'denied' : 'none'
  }
}

async function toggleFlash() {
  if (!scanner) return
  await scanner.toggleFlash().catch(() => {})
  flashOn.value = scanner.isFlashOn()
}

function stopCamera() {
  scanner?.stop()
  scanner?.destroy()
  scanner = null
}

// ─── Resolver lo leído ────────────────────────────────────────────────────────

const lastCode = ref('')
const matches = ref<Animal[]>([])
const notFound = ref('')

function label(a: Animal) {
  return a.ear_tag && a.name ? `${a.ear_tag} · ${a.name}` : (a.ear_tag ?? a.name ?? 'Sin arete')
}

async function ensureAnimals() {
  if (!animalsStore.animals.length) await animalsStore.loadAnimals()
}

async function handleCode(raw: string) {
  if (busy.value) return
  const parsed = parseScan(raw)
  if (parsed.kind === 'empty') return
  busy.value = true
  notFound.value = ''
  matches.value = []
  try {
    if (parsed.kind === 'id') {
      // QR de la app: va directo, la ficha carga el animal
      navigator.vibrate?.(40)
      await ensureAnimals()
      const a = animalsStore.animals.find((x) => x.id === parsed.id)
      router.push(a ? animalPath(a) : `/a/${parsed.id}`)
      return
    }
    await ensureAnimals()
    lastCode.value = parsed.code
    const found = findByCode(animalsStore.animals, parsed.code)
    if (found.length === 1) {
      navigator.vibrate?.(40)
      router.push(animalPath(found[0]))
      return
    }
    if (found.length > 1) {
      matches.value = found
    } else {
      notFound.value = parsed.code
      navigator.vibrate?.([60, 60, 60])
    }
  } finally {
    // pausa corta para no leer el mismo código diez veces seguidas
    setTimeout(() => { busy.value = false }, 1200)
  }
}

// ─── Escribir a mano / lector RFID ────────────────────────────────────────────

const manual = ref('')

function submitManual() {
  const code = manual.value
  manual.value = ''
  busy.value = false
  handleCode(code)
}

// Los lectores RFID Bluetooth/USB funcionan como teclado: "escriben" el número
// muy rápido y terminan con Enter. Se capturan aunque ningún campo esté activo.
let buffer = ''
let lastKeyAt = 0
function onKeydown(e: KeyboardEvent) {
  const target = e.target as HTMLElement | null
  if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
  const now = Date.now()
  if (now - lastKeyAt > 80) buffer = ''
  lastKeyAt = now
  if (e.key === 'Enter') {
    if (buffer.length >= 4) {
      busy.value = false
      handleCode(buffer)
    }
    buffer = ''
  } else if (e.key.length === 1) {
    buffer += e.key
  }
}

// ─── Vincular un chip nuevo a un animal ───────────────────────────────────────

const linkAnimalId = ref('')
const linking = ref(false)
const linkError = ref('')

const linkCandidates = computed(() =>
  animalsStore.animals
    .filter((a) => a.status === 'active' && !a.rfid_tag)
    .sort((a, b) => label(a).localeCompare(label(b), 'es', { numeric: true }))
)

async function linkChip() {
  if (!linkAnimalId.value || !notFound.value) return
  linking.value = true
  linkError.value = ''
  try {
    const updated = await animalsStore.editAnimal(linkAnimalId.value, { rfid_tag: normalizeRfid(notFound.value) })
    router.push(animalPath(updated))
  } catch (e) {
    const msg = (e as Error).message
    linkError.value = /duplicate|unique/i.test(msg)
      ? 'Ese chip ya está asignado a otro animal.'
      : 'No se pudo guardar: ' + msg
  } finally {
    linking.value = false
  }
}

watch(notFound, () => { linkAnimalId.value = ''; linkError.value = '' })

onMounted(() => {
  startCamera()
  ensureAnimals()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  stopCamera()
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="max-w-lg mx-auto space-y-4">
    <h1 class="text-xl font-bold text-gray-900 flex items-center gap-2">
      <ScanLine class="w-5 h-5 text-primary-700" aria-hidden="true" /> Escanear animal
    </h1>

    <!-- Cámara -->
    <section class="relative overflow-hidden rounded-xl bg-gray-900 aspect-square sm:aspect-[4/3]">
      <video ref="video" class="w-full h-full object-cover" muted playsinline />

      <div
        v-if="cameraState !== 'on'"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-gray-100"
      >
        <template v-if="cameraState === 'starting'">
          <ScanLine class="w-8 h-8 animate-pulse" aria-hidden="true" />
          <p class="text-sm">Abriendo la cámara...</p>
        </template>
        <template v-else-if="cameraState === 'denied'">
          <CameraOff class="w-8 h-8" aria-hidden="true" />
          <p class="text-sm font-medium">La app no tiene permiso para usar la cámara.</p>
          <p class="text-sm text-gray-300">Actívalo en los ajustes del teléfono (Cámara → permitir para la app o el navegador) y vuelve a intentar.</p>
          <BaseButton variant="secondary" size="sm" @click="startCamera">Intentar de nuevo</BaseButton>
        </template>
        <template v-else>
          <CameraOff class="w-8 h-8" aria-hidden="true" />
          <p class="text-sm">No hay cámara disponible. Escribe el número abajo.</p>
        </template>
      </div>

      <button
        v-if="cameraState === 'on' && hasFlash"
        type="button"
        class="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 min-h-[40px] text-sm font-medium text-white"
        :aria-pressed="flashOn"
        @click="toggleFlash"
      >
        <component :is="flashOn ? FlashlightOff : Flashlight" class="w-4 h-4" aria-hidden="true" />
        {{ flashOn ? 'Apagar luz' : 'Linterna' }}
      </button>
    </section>

    <p v-if="cameraState === 'on'" class="text-sm text-gray-600 text-center">
      Apunta al código QR del arete o del corral.
    </p>

    <!-- Varios animales con el mismo arete -->
    <section v-if="matches.length" class="card" aria-live="polite">
      <h2 class="card-title mb-2">Hay {{ matches.length }} animales con “{{ lastCode }}”</h2>
      <ul class="-mx-2 divide-y divide-gray-100">
        <li v-for="a in matches" :key="a.id">
          <RouterLink
            :to="animalPath(a)"
            class="flex items-center justify-between gap-3 px-2 py-3 rounded-lg hover:bg-gray-50"
          >
            <span class="text-sm font-medium text-gray-900">{{ label(a) }}</span>
            <span class="flex items-center gap-1 text-sm text-gray-600">
              {{ a.species === 'cattle' ? 'Bovino' : 'Porcino' }}
              <ChevronRight class="w-4 h-4" aria-hidden="true" />
            </span>
          </RouterLink>
        </li>
      </ul>
    </section>

    <!-- No encontrado: ofrecer vincular el chip -->
    <section v-if="notFound" class="notice-warning space-y-3" aria-live="polite">
      <p class="text-sm font-semibold">No encontré ningún animal con “{{ notFound }}”.</p>
      <p class="text-sm">Si es un chip nuevo, asígnalo a su animal y la próxima vez abrirá su ficha.</p>
      <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="linkChip">
        <label for="link-animal" class="sr-only">Animal</label>
        <select id="link-animal" v-model="linkAnimalId" class="form-select flex-1" required>
          <option value="">Elegir animal sin chip...</option>
          <option v-for="a in linkCandidates" :key="a.id" :value="a.id">
            {{ label(a) }} ({{ a.species === 'cattle' ? 'bovino' : 'porcino' }})
          </option>
        </select>
        <BaseButton type="submit" :loading="linking" :disabled="!linkAnimalId">
          <Link2 class="w-4 h-4" /> Asignar chip
        </BaseButton>
      </form>
      <p v-if="linkError" role="alert" class="text-sm font-medium text-red-700">{{ linkError }}</p>
    </section>

    <!-- A mano o con lector RFID -->
    <form class="card space-y-2" @submit.prevent="submitManual">
      <label for="scan-manual" class="card-title">Número de chip o arete</label>
      <div class="flex gap-2">
        <input
          id="scan-manual"
          v-model="manual"
          type="text"
          inputmode="text"
          autocomplete="off"
          autocapitalize="characters"
          placeholder="ej. 3337 o 982000123456789"
          class="form-input flex-1"
        />
        <BaseButton type="submit" :disabled="!manual.trim()">
          <Search class="w-4 h-4" /> Buscar
        </BaseButton>
      </div>
      <p class="text-xs text-gray-600">
        Con un lector RFID Bluetooth conectado, solo lee el arete: el número entra solo y abre la ficha.
      </p>
    </form>
  </div>
</template>

<style scoped>
/* Marco de lectura del escáner en el color de la app */
:deep(.scan-region-highlight-svg),
:deep(.code-outline-highlight) {
  stroke: #4ade80 !important;
}
</style>
