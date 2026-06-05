<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { localToday } from '@/lib/dates'
import { useGastosStore } from '@/stores/gastos'
import { fetchItems, createMovement } from '@/services/inventoryService'
import type { Gasto, GastoCategoria, GastoFormData, InventoryItem } from '@/types'
import BaseButton from '@/components/shared/BaseButton.vue'
import BaseModal from '@/components/shared/BaseModal.vue'
import StatCard from '@/components/shared/StatCard.vue'
import { PlusCircle, Trash2, Pencil, Receipt, ImageOff, Plus, X } from 'lucide-vue-next'

const store = useGastosStore()

const inventoryItems = ref<InventoryItem[]>([])
const inventoryLoaded = ref(false)
async function ensureInventory() {
  if (!inventoryLoaded.value) { inventoryItems.value = await fetchItems(); inventoryLoaded.value = true }
}

onMounted(() => store.loadGastos())

// ─── Modal ───────────────────────────────────────────────────────────────────
const showModal = ref(false)
const editing = ref<Gasto | null>(null)
const saving = ref(false)
const fotoPreview = ref<string | null>(null)
const fotoFile = ref<File | null>(null)

// ─── Inventario multi-línea ───────────────────────────────────────────────────

interface InvLine { item_id: string; name: string; unit: string; quantity: number }
const invLines = ref<InvLine[]>([])
const invSearch = ref('')
const showDropdown = ref(false)

const invFiltered = computed(() => {
  const q = invSearch.value.trim().toLowerCase()
  const all = q ? inventoryItems.value.filter(i => i.name.toLowerCase().includes(q)) : inventoryItems.value
  return all.slice(0, 8)
})

function addInvItem(item: InventoryItem) {
  const existing = invLines.value.find(l => l.item_id === item.id)
  if (existing) {
    existing.quantity += 1
  } else {
    invLines.value.push({ item_id: item.id, name: item.name, unit: item.unit, quantity: 1 })
  }
  invSearch.value = ''
  showDropdown.value = false
}

function removeInvLine(idx: number) {
  invLines.value.splice(idx, 1)
}

const form = ref<GastoFormData>({
  fecha: localToday(),
  monto: 0,
  descripcion: '',
  categoria: 'otro',
  foto_url: null
})

async function openNew() {
  editing.value = null
  fotoPreview.value = null
  fotoFile.value = null
  invLines.value = []
  invSearch.value = ''
  showDropdown.value = false
  form.value = { fecha: localToday(), monto: 0, descripcion: '', categoria: 'otro', foto_url: null }
  await ensureInventory()
  showModal.value = true
}

function openEdit(g: Gasto) {
  editing.value = g
  fotoPreview.value = g.foto_url
  fotoFile.value = null
  form.value = { fecha: g.fecha, monto: g.monto, descripcion: g.descripcion, categoria: g.categoria, foto_url: g.foto_url }
  showModal.value = true
}

function onFotoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  fotoFile.value = file
  fotoPreview.value = URL.createObjectURL(file)
}

async function submit() {
  saving.value = true
  try {
    if (editing.value) {
      await store.editGasto(editing.value.id, form.value, fotoFile.value ?? undefined)
    } else {
      await store.addGasto(form.value, fotoFile.value ?? undefined)
      // Registrar movimiento de entrada por cada producto seleccionado
      await Promise.all(
        invLines.value
          .filter(l => l.quantity > 0)
          .map(l => createMovement({
            item_id: l.item_id,
            type: 'in',
            quantity: l.quantity,
            date: form.value.fecha,
            notes: `Compra: ${form.value.descripcion}`
          }))
      )
    }
    showModal.value = false
  } finally {
    saving.value = false
  }
}

async function remove(g: Gasto) {
  if (!confirm(`¿Eliminar gasto "${g.descripcion}"?`)) return
  await store.removeGasto(g.id)
}

// ─── Filtros ─────────────────────────────────────────────────────────────────
const filtroCategoria = ref<GastoCategoria | ''>('')
const filtroMes = ref('')

const gastosFiltrados = computed(() => {
  return store.gastos.filter((g) => {
    if (filtroCategoria.value && g.categoria !== filtroCategoria.value) return false
    if (filtroMes.value && !g.fecha.startsWith(filtroMes.value)) return false
    return true
  })
})

const totalFiltrado = computed(() =>
  gastosFiltrados.value.reduce((sum, g) => sum + Number(g.monto), 0)
)

// ─── Helpers ─────────────────────────────────────────────────────────────────
const CATEGORIAS: Record<GastoCategoria, { label: string; color: string }> = {
  alimentacion: { label: 'Alimentación', color: 'bg-green-100 text-green-800' },
  veterinaria:  { label: 'Veterinaria',  color: 'bg-red-100 text-red-800' },
  mantenimiento:{ label: 'Mantenimiento',color: 'bg-yellow-100 text-yellow-800' },
  equipos:      { label: 'Equipos',      color: 'bg-blue-100 text-blue-800' },
  combustible:  { label: 'Combustible',  color: 'bg-orange-100 text-orange-800' },
  personal:     { label: 'Personal',     color: 'bg-purple-100 text-purple-800' },
  otro:         { label: 'Otro',         color: 'bg-slate-100 text-slate-700' }
}

function fmt(n: number) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)
}

function fmtFecha(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}

// foto lightbox
const lightboxUrl = ref<string | null>(null)
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">Gastos</h1>
        <p class="text-sm text-slate-500 mt-0.5">Registro de gastos de la finca</p>
      </div>
      <BaseButton variant="primary" @click="openNew">
        <PlusCircle class="w-4 h-4 mr-1.5" />
        Nuevo gasto
      </BaseButton>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard title="Total gastos" :value="fmt(store.total)" />
      <StatCard title="Registros" :value="String(store.gastos.length)" />
      <StatCard title="Filtrado actual" :value="fmt(totalFiltrado)" />
    </div>

    <!-- Filtros -->
    <div class="flex flex-wrap gap-3 bg-white p-4 rounded-xl border border-slate-200">
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-600">Categoría</label>
        <select
          v-model="filtroCategoria"
          class="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">Todas</option>
          <option v-for="(info, key) in CATEGORIAS" :key="key" :value="key">{{ info.label }}</option>
        </select>
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-xs font-medium text-slate-600">Mes</label>
        <input
          v-model="filtroMes"
          type="month"
          class="text-sm border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div class="flex items-end">
        <button
          class="text-sm text-slate-500 hover:text-slate-800 underline"
          @click="filtroCategoria = ''; filtroMes = ''"
        >
          Limpiar
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="store.loading" class="text-center py-12 text-slate-400">Cargando...</div>

    <!-- Empty -->
    <div
      v-else-if="gastosFiltrados.length === 0"
      class="text-center py-16 bg-white rounded-xl border border-slate-200"
    >
      <Receipt class="w-10 h-10 mx-auto text-slate-300 mb-3" />
      <p class="text-slate-500">No hay gastos registrados</p>
      <BaseButton variant="primary" class="mt-4" @click="openNew">Agregar primero</BaseButton>
    </div>

    <!-- Lista -->
    <div v-else class="grid grid-cols-1 gap-3">
      <div
        v-for="g in gastosFiltrados"
        :key="g.id"
        class="bg-white rounded-xl border border-slate-200 p-4 flex gap-4 items-start"
      >
        <!-- Foto -->
        <div
          class="shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center cursor-pointer"
          @click="g.foto_url && (lightboxUrl = g.foto_url)"
        >
          <img v-if="g.foto_url" :src="g.foto_url" class="w-full h-full object-cover" alt="Factura" />
          <ImageOff v-else class="w-6 h-6 text-slate-300" />
        </div>

        <!-- Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-start justify-between gap-2">
            <p class="font-semibold text-slate-900 truncate">{{ g.descripcion }}</p>
            <span class="text-lg font-bold text-slate-900 whitespace-nowrap">{{ fmt(g.monto) }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-2 mt-1.5">
            <span
              class="text-xs px-2 py-0.5 rounded-full font-medium"
              :class="CATEGORIAS[g.categoria].color"
            >
              {{ CATEGORIAS[g.categoria].label }}
            </span>
            <span class="text-xs text-slate-400">{{ fmtFecha(g.fecha) }}</span>
          </div>
        </div>

        <!-- Acciones -->
        <div class="flex gap-1 shrink-0">
          <button
            class="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
            @click="openEdit(g)"
          >
            <Pencil class="w-4 h-4" />
          </button>
          <button
            class="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
            @click="remove(g)"
          >
            <Trash2 class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>

    <!-- Lightbox foto -->
    <Teleport to="body">
      <div
        v-if="lightboxUrl"
        class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
        @click="lightboxUrl = null"
      >
        <img :src="lightboxUrl" class="max-h-full max-w-full rounded-lg shadow-2xl" alt="Factura" />
      </div>
    </Teleport>

    <!-- Modal -->
    <BaseModal :open="showModal" :title="editing ? 'Editar gasto' : 'Nuevo gasto'" @close="showModal = false">
      <form class="space-y-4" @submit.prevent="submit">
        <!-- Descripción -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Descripción *</label>
          <input
            v-model="form.descripcion"
            required
            type="text"
            placeholder="Ej: Concentrado para cerdos"
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <!-- Monto + Fecha -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Monto *</label>
            <input
              v-model.number="form.monto"
              required
              type="number"
              min="0"
              step="0.01"
              placeholder="0"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-700 mb-1">Fecha *</label>
            <input
              v-model="form.fecha"
              required
              type="date"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <!-- Categoría -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Categoría *</label>
          <select
            v-model="form.categoria"
            required
            class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option v-for="(info, key) in CATEGORIAS" :key="key" :value="key">{{ info.label }}</option>
          </select>
        </div>

        <!-- Vincular inventario — multi-producto (solo en nuevos gastos) -->
        <div v-if="!editing" class="border border-slate-200 rounded-lg p-3 space-y-3">
          <p class="text-xs font-semibold text-slate-500 uppercase tracking-wide">Agregar al inventario (opcional)</p>

          <!-- Buscador con dropdown -->
          <div class="relative">
            <input
              v-model="invSearch"
              type="text"
              placeholder="Buscar producto para agregar..."
              autocomplete="off"
              class="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              @focus="showDropdown = true"
              @blur="setTimeout(() => showDropdown = false, 150)"
            />
            <!-- Dropdown -->
            <div
              v-if="showDropdown && invFiltered.length"
              class="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
            >
              <button
                v-for="item in invFiltered"
                :key="item.id"
                type="button"
                class="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 flex items-center justify-between gap-2"
                @mousedown.prevent="addInvItem(item)"
              >
                <span>{{ item.name }}</span>
                <span class="text-xs text-slate-400 shrink-0">{{ item.quantity }} {{ item.unit }}</span>
              </button>
            </div>
          </div>

          <!-- Lista de productos seleccionados -->
          <div v-if="invLines.length" class="space-y-2">
            <div
              v-for="(line, idx) in invLines"
              :key="line.item_id"
              class="flex items-center gap-2 bg-slate-50 rounded-lg px-3 py-2"
            >
              <span class="flex-1 text-sm text-slate-700 truncate">{{ line.name }}</span>
              <input
                v-model.number="line.quantity"
                type="number"
                min="0.01"
                step="0.01"
                class="w-20 border border-slate-300 rounded-md px-2 py-1 text-sm text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <span class="text-xs text-slate-500 w-8 shrink-0">{{ line.unit }}</span>
              <button
                type="button"
                class="p-1 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                @click="removeInvLine(idx)"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
            <p class="text-xs text-slate-400">{{ invLines.length }} producto{{ invLines.length !== 1 ? 's' : '' }} seleccionado{{ invLines.length !== 1 ? 's' : '' }}</p>
          </div>
          <p v-else class="text-xs text-slate-400">Ningún producto seleccionado — busca arriba para agregar.</p>
        </div>

        <!-- Foto factura -->
        <div>
          <label class="block text-sm font-medium text-slate-700 mb-1">Foto de factura</label>
          <div
            class="border-2 border-dashed border-slate-300 rounded-lg p-4 text-center hover:border-primary-400 transition-colors cursor-pointer relative"
            @click="($refs.fotoInput as HTMLInputElement).click()"
          >
            <input
              ref="fotoInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="onFotoChange"
            />
            <div v-if="fotoPreview" class="relative">
              <img :src="fotoPreview" class="max-h-40 mx-auto rounded-lg object-contain" alt="Preview" />
              <p class="text-xs text-slate-400 mt-2">Toca para cambiar la foto</p>
            </div>
            <div v-else class="py-4">
              <Receipt class="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p class="text-sm text-slate-500">Toca para tomar foto o seleccionar</p>
              <p class="text-xs text-slate-400 mt-1">JPG, PNG, HEIC</p>
            </div>
          </div>
        </div>

        <!-- Botones -->
        <div class="flex justify-end gap-2 pt-2">
          <BaseButton variant="secondary" type="button" @click="showModal = false">Cancelar</BaseButton>
          <BaseButton variant="primary" type="submit" :disabled="saving">
            {{ saving ? 'Guardando...' : (editing ? 'Guardar cambios' : 'Registrar gasto') }}
          </BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
