<script setup lang="ts" generic="T extends Record<string, unknown>">
import { Loader2 } from 'lucide-vue-next'

export interface Column<Row> {
  key: string
  label: string
  class?: string
  render?: (row: Row) => string
}

withDefaults(
  defineProps<{
    columns: Column<T>[]
    rows: T[]
    loading?: boolean
    emptyMessage?: string
    rowKey?: keyof T
  }>(),
  {
    loading: false,
    emptyMessage: 'No hay datos disponibles.',
    rowKey: 'id' as keyof T
  }
)

defineEmits<{ rowClick: [row: T] }>()
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-gray-100">
    <table class="min-w-full divide-y divide-gray-100">
      <thead class="bg-gray-50">
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            scope="col"
            class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
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
        <!-- Loading -->
        <tr v-if="loading">
          <td :colspan="columns.length + ($slots.actions ? 1 : 0)" class="py-12 text-center">
            <Loader2 class="w-6 h-6 animate-spin text-primary-500 mx-auto" />
          </td>
        </tr>

        <!-- Empty -->
        <tr v-else-if="!rows.length">
          <td
            :colspan="columns.length + ($slots.actions ? 1 : 0)"
            class="py-12 text-center text-sm text-gray-400"
          >
            {{ emptyMessage }}
          </td>
        </tr>

        <!-- Rows -->
        <tr
          v-for="row in rows"
          v-else
          :key="String(row[rowKey])"
          class="hover:bg-gray-50 transition-colors cursor-pointer"
          @click="$emit('rowClick', row)"
        >
          <td
            v-for="col in columns"
            :key="col.key"
            class="px-4 py-3 text-sm text-gray-700"
            :class="col.class"
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
</template>
