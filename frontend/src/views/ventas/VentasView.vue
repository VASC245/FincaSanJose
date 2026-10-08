<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { localToday } from '@/lib/dates'
import { useVentasStore } from '@/stores/ventas'
import { useAnimalsStore } from '@/stores/animals'
import { updateAnimal } from '@/services/animalService'
import type { Venta, VentaTipo, VentaFormData } from '@/types'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import StatCard from '@/components/shared/StatCard.vue'
import { PlusCircle, Trash2, Pencil, HandCoins } from 'lucide-vue-next'

const store = useVentasStore()
const animalsStore = useAnimalsStore()

onMounted(() => store.loadVentas())

// ─── Modal ───────────────────────────────────────────────────────────────────
const showModal = ref(false)
const editing = ref<Venta | null>(null)
const saving = ref(false)
const marcarVendido = ref(true)

const form = ref<VentaFormData>({
  fecha: localToday(),
  tipo: 'leche',
  descripcion: '',
  monto: 0,
  cantidad: null,
  unidad: null,
  comprador: null,
  animal_id: null
})

const animalesActivos = computed(() =>
  animalsStore.animals.filter((a) => a.status === 'active')
)

async function openNew() {
  editing.value = null
  marcarVendido.value = true
  form.value = {
    fecha: localToday(), tipo: 'leche', descripcion: '', monto: 0,
    cantidad: null, unidad: 'litros', comprador: null, animal_id: null
  }
  if (!animalsStore.animals.length) animalsStore.loadAnimals()
  showModal.value = true
}

function openEdit(v: Venta) {
  editing.value = v
  marcarVendido.value = false
  form.value = {
    fecha: v.fecha, tipo: v.tipo, descripcion: v.descripcion, monto: v.monto,
    cantidad: v.cantidad, unidad: v.unidad, comprador: v.comprador, animal_id: v.animal_id
  }
  if (!animalsStore.animals.length) animalsStore.loadAnimals()
  showModal.value = true
}

function onTipoChange() {
  if (form.value.tipo === 'leche') {
    form.value.unidad = 'litros'
    form.value.animal_id = null
  } else if (form.value.tipo === 'animal') {
    form.value.unidad = null
    form.value.cantidad = null
  } else {
    form.value.unidad = null
    form.value.animal_id = null
  }
}

async function submit() {
  saving.value = true
  try {
    if (editing.value) {
      await store.editVenta(editing.value.id, form.value)
    } else {
      await store.addVenta(form.value)
      if (form.value.tipo === 'animal' && form.value.animal_id && marcarVendido.value) {
        await updateAnimal(form.value.animal_id, { status: 'sold' })
        animalsStore.loadAnimals()
      }
    }
    showModal.value = false
  } finally {
    saving.value = false
  }
}

async function remove(v: Venta) {
  if (!confirm(`¿Eliminar venta "${v.descripcion}"?`)) return
  await store.removeVenta(v.id)
}

// ─── Filtros ─────────────────────────────────────────────────────────────────
const filtroTipo = ref<VentaTipo | ''>('')
const filtroMes = ref('')

const ventasFiltradas = computed(() => {
  return store.ventas.filter((v) => {
    if (filtroTipo.value && v.tipo !== filtroTipo.value) return false
    if (filtroMes.value && !v.fecha.startsWith(filtroMes.value)) return false
    return true
  })
})

const totalFiltrado = computed(() =>
  ventasFiltradas.value.reduce((sum, v) => sum + Number(v.monto), 0)
)

// ─── Helpers ─────────────────────────────────────────────────────────────────
const TIPOS: Record<VentaTipo, { label: string; color: string }> = {
  leche:  { label: 'Leche',  color: 'bg-blue-100 text-blue-800' },
  animal: { label: 'Animal', color: 'bg-amber-100 text-amber-800' },
  otro:   { label: 'Otro',   color: 'bg-gray-100 text-gray-700' }
}

function animalLabel(id: string | null) {
  if (!id) return null
  const a = animalsStore.animals.find((x) => x.id === id)
  if (!a) return null
  return a.ear_tag ? `${a.ear_tag}${a.name ? ` · ${a.name}` : ''}` : a.name
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtFecha(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Ventas</h1>
        <p class="text-sm text-gray-500 mt-0.5">Ingresos de la finca: leche, animales y otros</p>
      </div>
      <BaseButton variant="primary" @click="openNew">
        <PlusCircle class="w-4 h-4 mr-1.5" />
        Nueva venta
      </BaseButton>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
      <StatCard class="col-span-2 sm:col-span-1" title="Total ingresos" :value="fmt(store.total)" />
      <StatCard title="Registros" :value="String(store.ventas.length)" />
      <StatCard title="Filtrado actual" :value="fmt(totalFiltrado)" />
    </div>

    <!-- Filtros -->
    <div class="card flex flex-wrap gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-gray-600">Tipo</label>
        <select
          v-model="filtroTipo"
          class="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todos</option>
          <option v-for="(info, key) in TIPOS" :key="key" :value="key">{{ info.label }}</option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-gray-600">Mes</label>
        <input
          v-model="filtroMes"
          type="month"
          class="text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div class="flex items-end">
        <button
          class="text-sm text-gray-500 hover:text-gray-800 underline"
          @click="filtroTipo = ''; filtroMes = ''"
        >
          Limpiar
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="text-center py-12 text-gray-500">Cargando...</div>

    <!-- Empty -->
    <div
      v-else-if="ventasFiltradas.length === 0"
      class="card-empty"
    >
      <HandCoins class="w-10 h-10 mx-auto text-gray-300 mb-3" />
      <p class="text-gray-500">No hay ventas registradas</p>
      <BaseButton variant="primary" class="mt-4" @click="openNew">Agregar primera</BaseButton>
    </div>

    <!-- Lista -->
    <div v-else class="grid grid-cols-1 gap-3">
      <div
        v-for="v in ventasFiltradas"
        :key="v.id"
        class="card flex gap-4 items-start"
      >
        <!-- Icono -->
        <div class="shrink-0 w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
          <HandCoins class="w-5 h-5 text-emerald-600" />
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-gray-900 line-clamp-2 leading-snug">{{ v.descripcion }}</p>
            <span class="text-lg font-bold text-emerald-700 whitespace-nowrap">{{ fmt(v.monto) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-1.5">
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="TIPOS[v.tipo].color"
            >
              {{ TIPOS[v.tipo].label }}
            </span>
            <span v-if="v.cantidad" class="text-xs text-gray-500">
              {{ v.cantidad }} {{ v.unidad ?? '' }}
            </span>
            <span v-if="animalLabel(v.animal_id)" class="text-xs text-gray-500">
              {{ animalLabel(v.animal_id) }}
            </span>
            <span v-if="v.comprador" class="text-xs text-gray-500">→ {{ v.comprador }}</span>
            <span class="text-xs text-gray-500">{{ fmtFecha(v.fecha) }}</span>
          </div>
        </div>

        <!-- Acciones -->
        <div class="flex flex-col -my-1 -mr-1 shrink-0">
          <button
            class="icon-btn"
            aria-label="Editar"
            @click="openEdit(v)"
          >
            <Pencil class="w-4 h-4" />
          </button>
          <button
            class="icon-btn hover:text-red-700 hover:bg-red-50"
            aria-label="Eliminar"
            @click="remove(v)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modal -->
    <BaseModal :open="showModal" :title="editing ? 'Editar venta' : 'Nueva venta'" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="submit">
        <!-- Tipo -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de venta *</label>
          <select
            v-model="form.tipo"
            required
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            @change="onTipoChange"
          >
            <option v-for="(info, key) in TIPOS" :key="key" :value="key">{{ info.label }}</option>
          </select>
        </div>

        <!-- Descripción -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Descripción *</label>
          <input
            v-model="form.descripcion"
            required
            type="text"
            placeholder="Ej: Venta de leche semana 32"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <!-- Monto + Fecha -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Monto *</label>
            <input
              v-model.number="form.monto"
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Fecha *</label>
            <input
              v-model="form.fecha"
              required
              type="date"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <!-- Cantidad + Unidad (leche / otro) -->
        <div v-if="form.tipo !== 'animal'" class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
            <input
              v-model.number="form.cantidad"
              type="number"
              min="0"
              step="0.01"
              placeholder="Ej: 120"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Unidad</label>
            <input
              v-model="form.unidad"
              type="text"
              placeholder="Ej: litros, kg"
              class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <!-- Animal vendido -->
        <div v-if="form.tipo === 'animal'" class="space-y-2">
          <label class="block text-sm font-medium text-gray-700 mb-1">Animal</label>
          <select
            v-model="form.animal_id"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option :value="null">— Sin especificar —</option>
            <option v-for="a in animalesActivos" :key="a.id" :value="a.id">
              {{ a.ear_tag ?? 'Sin arete' }}{{ a.name ? ` · ${a.name}` : '' }} ({{ a.species === 'cattle' ? 'bovino' : 'porcino' }})
            </option>
          </select>
          <label v-if="!editing && form.animal_id" class="flex items-center gap-2 text-sm text-gray-600">
            <input v-model="marcarVendido" type="checkbox" class="rounded border-gray-300" />
            Marcar el animal como vendido
          </label>
        </div>

        <!-- Comprador -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Comprador</label>
          <input
            v-model="form.comprador"
            type="text"
            placeholder="Ej: Lácteos El Valle (opcional)"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <!-- Botones -->
        <div class="flex justify-end gap-2 pt-2">
          <BaseButton variant="secondary" type="button" @click="showModal = false">Cancelar</BaseButton>
          <BaseButton variant="primary" type="submit" :disabled="saving">
            {{ saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Registrar venta') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
