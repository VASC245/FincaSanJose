<script setup lang="ts">
import { reactive, ref, computed, nextTick, onMounted } from 'vue'
import { Lock, Trash2 } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { offlineState } from '@/offline/state'
import { correctMilkEntry, deleteMilkEntry, type MilkSource } from '@/services/milkService'
import type { MilkRecord, MilkSession } from '@/types'

// Corrección de un registro de leche: pide motivo y la clave de corrección.
// La clave se verifica en el servidor; aquí nunca se guarda.
const props = defineProps<{
  source: MilkSource
  entry: Pick<MilkSession, 'id' | 'recorded_date' | 'liters' | 'notes'>
  /** Qué se está corrigiendo, ej. "Ordeño del jue 2 oct" */
  title: string
}>()

const emit = defineEmits<{
  saved: [row: MilkSession | MilkRecord]
  deleted: [id: string]
  cancel: []
}>()

const form = reactive({
  recorded_date: props.entry.recorded_date,
  liters: String(props.entry.liters) as string | number,
  notes: props.entry.notes ?? '',
  reason: '',
  password: ''
})
const mode = ref<'edit' | 'delete'>('edit')
const saving = ref(false)
const error = ref('')
const root = ref<HTMLElement | null>(null)

const changed = computed(
  () =>
    form.recorded_date !== props.entry.recorded_date ||
    Number(form.liters) !== Number(props.entry.liters) ||
    (form.notes.trim() || null) !== (props.entry.notes ?? null)
)

const canSubmit = computed(() => {
  if (form.reason.trim().length < 3 || !form.password) return false
  if (mode.value === 'delete') return true
  return changed.value && form.liters !== '' && Number(form.liters) >= 0 && !!form.recorded_date
})

onMounted(async () => {
  await nextTick()
  root.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})

async function submit() {
  if (!canSubmit.value || saving.value) return
  if (!offlineState.online) {
    error.value = 'Necesitas señal para corregir registros de leche.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    if (mode.value === 'delete') {
      await deleteMilkEntry(props.source, props.entry.id, form.reason.trim(), form.password)
      emit('deleted', props.entry.id)
    } else {
      const row = await correctMilkEntry(
        props.source,
        props.entry.id,
        {
          recorded_date: form.recorded_date,
          liters: Number(form.liters),
          notes: form.notes.trim() || null
        },
        form.reason.trim(),
        form.password
      )
      emit('saved', row)
    }
  } catch (e) {
    error.value = (e as Error).message
    form.password = ''
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <form
    ref="root"
    autocomplete="off"
    class="inset space-y-3 ring-1 ring-gray-200"
    :aria-label="title"
    @submit.prevent="submit"
  >
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
          <Lock class="w-4 h-4 text-gray-600" aria-hidden="true" />
          {{ mode === 'delete' ? 'Borrar registro' : 'Corregir registro' }}
        </p>
        <p class="text-xs text-gray-600 mt-0.5">{{ title }} · {{ Number(entry.liters).toFixed(1) }} L</p>
      </div>
      <button
        v-if="mode === 'edit'"
        type="button"
        class="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:underline min-h-[32px]"
        @click="mode = 'delete'; error = ''"
      >
        <Trash2 class="w-3.5 h-3.5" aria-hidden="true" /> Borrar
      </button>
      <button
        v-else
        type="button"
        class="text-xs font-medium text-gray-700 hover:underline min-h-[32px]"
        @click="mode = 'edit'; error = ''"
      >
        Volver a corregir
      </button>
    </div>

    <div v-if="mode === 'edit'" class="grid grid-cols-2 gap-3">
      <BaseInput v-model="form.recorded_date" label="Fecha" type="date" required />
      <BaseInput v-model="form.liters" label="Litros" type="number" required />
      <div class="col-span-2">
        <BaseInput v-model="form.notes" label="Notas" placeholder="Opcional" />
      </div>
    </div>
    <p v-else class="text-sm text-red-800">
      Se borrará este registro. Quedará anotado en el historial de correcciones con el motivo.
    </p>

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label :for="`milk-reason-${entry.id}`" class="block text-sm font-medium text-gray-700 mb-1">
          Motivo <span class="text-red-500 ml-0.5">*</span>
        </label>
        <!-- autocomplete apagado: que el navegador no meta aquí un usuario guardado -->
        <input
          :id="`milk-reason-${entry.id}`"
          v-model="form.reason"
          type="text"
          name="milk-correction-reason"
          autocomplete="off"
          placeholder="ej. se anotó mal en el ordeño"
          class="form-input"
          required
        />
      </div>
      <div>
        <label :for="`milk-pw-${entry.id}`" class="block text-sm font-medium text-gray-700 mb-1">
          Clave de corrección <span class="text-red-500 ml-0.5">*</span>
        </label>
        <input
          :id="`milk-pw-${entry.id}`"
          v-model="form.password"
          type="password"
          name="milk-correction-key"
          autocomplete="new-password"
          class="form-input"
          required
        />
      </div>
    </div>

    <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>
    <p v-else-if="mode === 'edit' && !changed" class="text-xs text-gray-600">Cambia la fecha, los litros o las notas para guardar.</p>

    <div class="flex justify-end gap-2">
      <BaseButton variant="secondary" size="sm" @click="emit('cancel')">Cancelar</BaseButton>
      <BaseButton
        type="submit"
        size="sm"
        :variant="mode === 'delete' ? 'danger' : 'primary'"
        :loading="saving"
        :disabled="!canSubmit"
      >
        {{ mode === 'delete' ? 'Borrar registro' : 'Guardar corrección' }}
      </BaseButton>
    </div>
  </form>
</template>
