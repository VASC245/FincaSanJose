<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import {
  LayoutDashboard,
  Beef,
  PiggyBank,
  Package,
  ClipboardList,
  X,
  Leaf,
  Baby,
  Milk,
  Receipt
} from 'lucide-vue-next'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const route = useRoute()

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cattle', label: 'Bovinos', icon: Beef },
  { to: '/cattle/milk', label: 'Leche', icon: Milk },
  { to: '/pigs', label: 'Porcinos', icon: PiggyBank },
  { to: '/pigs/litters', label: 'Camadas', icon: Baby },
  { to: '/inventory', label: 'Inventario', icon: Package },
  { to: '/tasks', label: 'Tareas', icon: ClipboardList },
  { to: '/gastos', label: 'Gastos', icon: Receipt }
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>

<template>
  <!-- Desktop sidebar -->
  <aside
    class="hidden lg:flex flex-col w-64 bg-slate-800 text-white shrink-0"
  >
    <SidebarContent :nav-items="navItems" :is-active="isActive" />
  </aside>

  <!-- Mobile sidebar drawer -->
  <Transition name="slide">
    <aside
      v-if="open"
      class="fixed inset-y-0 left-0 z-30 flex flex-col w-64 bg-slate-800 text-white lg:hidden"
    >
      <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <span class="font-bold text-lg flex items-center gap-2">
          <Leaf class="w-5 h-5 text-primary-400" />
          Finca
        </span>
        <button
          class="p-1 rounded hover:bg-slate-700 transition-colors"
          @click="emit('close')"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="
            isActive(item.to)
              ? 'bg-primary-600 text-white'
              : 'text-slate-300 hover:bg-slate-700 hover:text-white'
          "
          @click="emit('close')"
        >
          <component :is="item.icon" class="w-5 h-5 shrink-0" />
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
  </Transition>

  <!-- Desktop sidebar inner (reused via component) -->
</template>

<!-- Reusable inner content for desktop -->
<script lang="ts">
// Sub-component rendered directly inside desktop aside
import { defineComponent, h } from 'vue'
import { RouterLink } from 'vue-router'
import { Leaf } from 'lucide-vue-next'

const SidebarContent = defineComponent({
  props: {
    navItems: { type: Array as () => { to: string; label: string; icon: any }[], required: true },
    isActive: { type: Function as unknown as () => (path: string) => boolean, required: true }
  },
  setup(props) {
    return () =>
      h('div', { class: 'flex flex-col h-full' }, [
        h(
          'div',
          { class: 'flex items-center gap-2 px-5 py-4 border-b border-slate-700' },
          [
            h(Leaf, { class: 'w-6 h-6 text-primary-400' }),
            h('span', { class: 'font-bold text-xl tracking-tight' }, 'Finca')
          ]
        ),
        h(
          'nav',
          { class: 'flex-1 px-3 py-4 space-y-1 overflow-y-auto' },
          props.navItems.map((item) =>
            h(
              RouterLink,
              {
                key: item.to,
                to: item.to,
                class: [
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  props.isActive(item.to)
                    ? 'bg-primary-600 text-white'
                    : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                ]
              },
              () => [
                h(item.icon, { class: 'w-5 h-5 shrink-0' }),
                h('span', item.label)
              ]
            )
          )
        ),
        h(
          'div',
          { class: 'px-5 py-3 border-t border-slate-700 text-xs text-slate-500' },
          '© 2025 Finca Agropecuaria'
        )
      ])
  }
})
</script>

<style scoped>
.slide-enter-active,
.slide-leave-active {
  transition: transform 0.25s ease;
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(-100%);
}
</style>
