<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { QrCode, Printer, Download, Nfc, Pencil } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import { useAnimalsStore } from '@/stores/animals'
import { animalQrSvg, animalQrPng, normalizeRfid } from '@/services/scanService'
import type { Animal } from '@/types'

// Identificación del animal: su QR (para imprimir y pegar en el arete o el
// corral) y el número de su chip RFID, si tiene.
const props = defineProps<{ animal: Animal }>()
const emit = defineEmits<{ updated: [animal: Animal] }>()

const animalsStore = useAnimalsStore()
const svg = ref('')

watch(
  () => props.animal.id,
  async (id) => { svg.value = await animalQrSvg(id) },
  { immediate: true }
)

const tagName = () => props.animal.ear_tag ?? props.animal.name ?? 'animal'

async function download() {
  const url = await animalQrPng(props.animal.id)
  const a = document.createElement('a')
  a.href = url
  a.download = `QR-${tagName()}.png`
  a.click()
}

// ─── Chip RFID ────────────────────────────────────────────────────────────────

const editingChip = ref(false)
const chip = ref('')
const savingChip = ref(false)
const chipError = ref('')
const chipInput = ref<HTMLInputElement | null>(null)

async function startChip() {
  chip.value = props.animal.rfid_tag ?? ''
  chipError.value = ''
  editingChip.value = true
  // con el campo activo, un lector RFID Bluetooth escribe el número solo
  await nextTick()
  chipInput.value?.focus()
}

async function saveChip() {
  savingChip.value = true
  chipError.value = ''
  try {
    const value = chip.value.trim() ? normalizeRfid(chip.value) : null
    const updated = await animalsStore.editAnimal(props.animal.id, { rfid_tag: value })
    emit('updated', { ...props.animal, ...updated })
    editingChip.value = false
  } catch (e) {
    const msg = (e as Error).message
    chipError.value = /duplicate|unique/i.test(msg)
      ? 'Ese chip ya está asignado a otro animal.'
      : 'No se pudo guardar: ' + msg
  } finally {
    savingChip.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="ident-title">
    <h3 id="ident-title" class="card-title mb-3"><QrCode class="text-gray-600" aria-hidden="true" /> Identificación</h3>

    <div class="flex gap-4 items-start">
      <!-- QR generado por la app: el contenido es fijo, no viene del usuario -->
      <div
        class="w-28 h-28 shrink-0 rounded-lg border border-gray-200 bg-white p-1 [&>svg]:w-full [&>svg]:h-full"
        role="img"
        :aria-label="`Código QR de ${tagName()}`"
        v-html="svg"
      />
      <div class="min-w-0 flex-1 space-y-2">
        <p class="text-sm text-gray-700">
          Escanéalo con la app (botón <span class="font-medium">Escanear</span>) para abrir esta ficha.
        </p>
        <div class="flex flex-wrap gap-2">
          <RouterLink
            :to="{ path: '/etiquetas', query: { ids: animal.id } }"
            class="btn-secondary px-3 py-1.5 text-xs min-h-[36px]"
          >
            <Printer class="w-4 h-4" aria-hidden="true" /> Imprimir
          </RouterLink>
          <BaseButton variant="secondary" size="sm" class="min-h-[36px]" @click="download">
            <Download class="w-4 h-4" /> Descargar
          </BaseButton>
        </div>
      </div>
    </div>

    <!-- Chip RFID -->
    <div class="mt-4 pt-4 border-t border-gray-100">
      <div v-if="!editingChip" class="flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="field-label flex items-center gap-1"><Nfc class="w-3.5 h-3.5" aria-hidden="true" /> Chip RFID</p>
          <p v-if="animal.rfid_tag" class="field-value tabular-nums break-all">{{ animal.rfid_tag }}</p>
          <p v-else class="text-sm text-gray-500 mt-0.5">Sin chip</p>
        </div>
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline min-h-[40px] px-1 shrink-0"
          @click="startChip"
        >
          <Pencil class="w-4 h-4" aria-hidden="true" /> {{ animal.rfid_tag ? 'Cambiar' : 'Asignar chip' }}
        </button>
      </div>

      <form v-else class="space-y-2" @submit.prevent="saveChip">
        <label for="chip-input" class="block text-sm font-medium text-gray-700">Número del chip</label>
        <input
          id="chip-input"
          ref="chipInput"
          v-model="chip"
          type="text"
          autocomplete="off"
          autocapitalize="characters"
          placeholder="ej. 982000123456789"
          class="form-input tabular-nums"
        />
        <p class="text-xs text-gray-600">Escríbelo o léelo con el lector RFID. Déjalo vacío para quitar el chip.</p>
        <p v-if="chipError" role="alert" class="text-sm font-medium text-red-700">{{ chipError }}</p>
        <div class="flex justify-end gap-2">
          <BaseButton variant="secondary" size="sm" @click="editingChip = false">Cancelar</BaseButton>
          <BaseButton type="submit" size="sm" :loading="savingChip">Guardar chip</BaseButton>
        </div>
      </form>
    </div>
  </section>
</template>
