<script setup lang="ts" generic="T extends Record<string, unknown>">
import { computed } from 'vue'
import { Loader2, ChevronRight } from 'lucide-vue-next'

export interface Column<Row> {
  key: string
  label: string
  class?: string
  render?: (row: Row) => string
}

const props = withDefaults(
  defineProps<{
    columns: Column<T>[]
    rows: T[]
    loading?: boolean
    emptyMessage?: string
    rowKey?: keyof T
    /** En el celular: columna que va como título de la tarjeta (por defecto la primera) */
    titleKey?: string
  }>(),
  {
    loading: false,
    emptyMessage: 'No hay datos disponibles.',
    rowKey: 'id' as keyof T
  }
)

defineEmits<{ rowClick: [row: T] }>()

// En la vista de tarjetas (celular) el título se separa del resto de columnas
const titleCol = computed(() => props.columns.find((c) => c.key === props.titleKey) ?? props.columns[0])
function rowId(row: T) {
  return String(row[props.rowKey as keyof T])
}
const detailCols = computed(() => props.columns.filter((c) => c !== titleCol.value))
</script>


<template>
  <div>
    <!-- Celular: cada fila es una tarjeta que se toca entera -->
    <div class="sm:hidden space-y-2">
      <div v-if="loading" class="card-empty">
        <Loader2 class="w-6 h-6 animate-spin text-primary-600 mx-auto" aria-label="Cargando" />
      </div>
      <div v-else-if="!rows.length" class="card-empty">{{ emptyMessage }}</div>
      <template v-else>
        <div
          v-for="row in rows"
          :key="rowId(row)"
          role="button"
          tabindex="0"
          class="card-link p-4 sm:p-4 cursor-pointer"
          @click="$emit('rowClick', row)"
          @keydown.enter="$emit('rowClick', row)"
        >
          <div class="flex items-center justify-between gap-3">
            <p class="text-base font-semibold text-gray-900 truncate">
              <slot :name="titleCol.key" :row="row" :value="row[titleCol.key]">
                {{ titleCol.render ? titleCol.render(row) : row[titleCol.key] }}
              </slot>
            </p>
            <div class="flex items-center gap-1 shrink-0">
              <slot name="actions" :row="row" />
              <ChevronRight class="w-4 h-4 text-gray-400" aria-hidden="true" />
            </div>
          </div>
          <dl class="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            <div v-for="col in detailCols" :key="col.key" class="min-w-0">
              <dt class="field-label">{{ col.label }}</dt>
              <dd class="text-sm text-gray-900 mt-0.5 break-words">
                <slot :name="col.key" :row="row" :value="row[col.key]">
                  {{ (col.render ? col.render(row) : row[col.key]) ?? '—' }}
                </slot>
              </dd>
            </div>
          </dl>
        </div>
      </template>
    </div>

    <!-- Pantallas grandes: tabla -->
    <div class="hidden sm:block overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              scope="col"
              class="table-th"
              :class="col.class"
            >
              {{ col.label }}
            </th>
            <th v-if="$slots.actions" scope="col" class="relative px-4 py-3">
              <span class="sr-only">Acciones</span>
            </th>
          </tr>
        </thead>

        <tbody class="bg-white divide-y divide-gray-100">
          <tr v-if="loading">
            <td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="py-12 text-center">
              <Loader2 class="w-6 h-6 animate-spin text-primary-600 mx-auto" aria-label="Cargando" />
            </td>
          </tr>

          <tr v-else-if="!rows.length">
            <td
              :colspan="columns.length + ($slots.actions ? 1 : 0)"
              class="py-12 text-center text-sm text-gray-500"
            >
              {{ emptyMessage }}
            </td>
          </tr>

          <tr
            v-for="row in rows"
            v-else
            :key="rowId(row)"
            class="hover:bg-gray-50 transition-colors cursor-pointer"
            @click="$emit('rowClick', row)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="table-td"
              :class="[col.class, col === titleCol ? 'font-semibold text-gray-900' : '']"
            >
              <slot :name="col.key" :row="row" :value="row[col.key]">
                {{ col.render ? col.render(row) : row[col.key] }}
              </slot>
            </td>
            <td v-if="$slots.actions" class="px-4 py-3 text-right">
              <slot name="actions" :row="row" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
