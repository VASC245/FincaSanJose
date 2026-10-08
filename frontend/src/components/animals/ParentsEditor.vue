<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Pencil, GitFork } from 'lucide-vue-next'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseInput from '@/components/shared/BaseInput.vue'
import { useAnimalsStore } from '@/stores/animals'
import type { Animal } from '@/types'

// Madre y padre de un animal, con edición en el mismo lugar.
// Cada padre puede ser un animal registrado o solo un nombre
// (ej. el toro de la pajuela o una cerda comprada).
const props = defineProps<{
  animal: Animal
  mother: Animal | null
  father: Animal | null
}>()

const emit = defineEmits<{ updated: [animal: Animal] }>()

const animalsStore = useAnimalsStore()
onMounted(() => {
  if (!animalsStore.animals.some((a) => a.species === props.animal.species && a.id !== props.animal.id)) {
    animalsStore.loadAnimals()
  }
})

const base = computed(() => (props.animal.species === 'cattle' ? '/cattle' : '/pigs'))

const editing = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive({ mother_id: '', father_id: '', mother_name: '', father_name: '' })

function startEdit() {
  form.mother_id = props.animal.mother_id ?? ''
  form.father_id = props.animal.father_id ?? ''
  form.mother_name = props.animal.mother_name ?? ''
  form.father_name = props.animal.father_name ?? ''
  error.value = ''
  editing.value = true
}

function label(a: Pick<Animal, 'ear_tag' | 'name'>) {
  return a.ear_tag && a.name ? `${a.ear_tag} · ${a.name}` : (a.ear_tag ?? a.name ?? 'Sin arete')
}

const statusText: Record<string, string> = { sold: 'vendido', deceased: 'fallecido', culled: 'descartado' }

function optionLabel(a: Animal) {
  return statusText[a.status] ? `${label(a)} (${statusText[a.status]})` : label(a)
}

// Candidatos: misma especie y sexo; nunca el propio animal ni sus crías directas
function candidates(sex: 'female' | 'male') {
  const self = props.animal.id
  return animalsStore.animals
    .filter((a) => a.species === props.animal.species && a.sex === sex && a.id !== self &&
      a.mother_id !== self && a.father_id !== self)
    .sort((a, b) => label(a).localeCompare(label(b), 'es', { numeric: true }))
}
const motherOptions = computed(() => candidates('female'))
const fatherOptions = computed(() => candidates('male'))

const fatherHint = computed(() =>
  props.animal.species === 'cattle' ? 'ej. toro de la pajuela' : 'ej. verraco comprado'
)

async function save() {
  saving.value = true
  error.value = ''
  try {
    const updated = await animalsStore.editAnimal(props.animal.id, {
      mother_id: form.mother_id || null,
      father_id: form.father_id || null,
      // el nombre libre solo aplica si no se eligió un animal registrado
      mother_name: form.mother_id ? null : form.mother_name.trim() || null,
      father_name: form.father_id ? null : form.father_name.trim() || null
    })
    emit('updated', { ...props.animal, ...updated })
    editing.value = false
  } catch (e) {
    error.value = 'No se pudo guardar: ' + (e as Error).message
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="padres-title">
    <div class="card-header mb-3">
      <h3 id="padres-title" class="card-title"><GitFork class="text-gray-600" aria-hidden="true" /> Padres</h3>
      <button
        v-if="!editing"
        type="button"
        class="inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 hover:underline min-h-[40px] px-1"
        @click="startEdit"
      >
        <Pencil class="w-4 h-4" aria-hidden="true" /> Editar padres
      </button>
    </div>

    <!-- Vista -->
    <dl v-if="!editing" class="grid grid-cols-2 gap-4">
      <div>
        <dt class="field-label">Madre</dt>
        <dd class="field-value">
          <RouterLink v-if="mother" :to="`${base}/${mother.id}`" class="text-primary-700 hover:underline">
            {{ label(mother) }}
          </RouterLink>
          <span v-else-if="animal.mother_name">{{ animal.mother_name }}</span>
          <span v-else class="text-gray-500 font-normal">Sin registrar</span>
        </dd>
      </div>
      <div>
        <dt class="field-label">Padre</dt>
        <dd class="field-value">
          <RouterLink v-if="father" :to="`${base}/${father.id}`" class="text-primary-700 hover:underline">
            {{ label(father) }}
          </RouterLink>
          <span v-else-if="animal.father_name">{{ animal.father_name }}</span>
          <span v-else class="text-gray-500 font-normal">Sin registrar</span>
        </dd>
      </div>
    </dl>

    <!-- Edición -->
    <form v-else class="space-y-4" @submit.prevent="save">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="space-y-2">
          <label for="parent-mother" class="block text-sm font-medium text-gray-700">Madre</label>
          <select id="parent-mother" v-model="form.mother_id" class="form-select">
            <option value="">No está registrada</option>
            <option v-for="m in motherOptions" :key="m.id" :value="m.id">{{ optionLabel(m) }}</option>
          </select>
          <BaseInput
            v-if="!form.mother_id"
            v-model="form.mother_name"
            label="Nombre de la madre"
            placeholder="Opcional"
          />
        </div>
        <div class="space-y-2">
          <label for="parent-father" class="block text-sm font-medium text-gray-700">Padre</label>
          <select id="parent-father" v-model="form.father_id" class="form-select">
            <option value="">No está registrado</option>
            <option v-for="p in fatherOptions" :key="p.id" :value="p.id">{{ optionLabel(p) }}</option>
          </select>
          <BaseInput
            v-if="!form.father_id"
            v-model="form.father_name"
            label="Nombre del padre"
            :placeholder="fatherHint"
          />
        </div>
      </div>

      <p v-if="error" role="alert" class="text-sm font-medium text-red-700">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" size="sm" @click="editing = false">Cancelar</BaseButton>
        <BaseButton type="submit" size="sm" :loading="saving">Guardar padres</BaseButton>
      </div>
    </form>
  </section>
</template>
