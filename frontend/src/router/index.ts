import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      component: () => import('@/components/layout/AppLayout.vue'),
      children: [
        {
          path: '',
          name: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: 'Dashboard' }
        },
        // Cattle
        {
          path: 'cattle',
          name: 'cattle-list',
          component: () => import('@/views/cattle/CattleListView.vue'),
          meta: { title: 'Bovinos' }
        },
        {
          path: 'cattle/milk',
          name: 'milk',
          component: () => import('@/views/cattle/MilkView.vue'),
          meta: { title: 'Producción de Leche' }
        },
        {
          path: 'cattle/new',
          name: 'cattle-new',
          component: () => import('@/views/cattle/CattleFormView.vue'),
          meta: { title: 'Nuevo Bovino' }
        },
        {
          path: 'cattle/:id',
          name: 'cattle-detail',
          component: () => import('@/views/cattle/CattleDetailView.vue'),
          meta: { title: 'Detalle Bovino' }
        },
        {
          path: 'cattle/:id/edit',
          name: 'cattle-edit',
          component: () => import('@/views/cattle/CattleFormView.vue'),
          meta: { title: 'Editar Bovino' }
        },
        // Pigs
        {
          path: 'pigs',
          name: 'pigs-list',
          component: () => import('@/views/pigs/PigListView.vue'),
          meta: { title: 'Porcinos' }
        },
        {
          path: 'pigs/new',
          name: 'pigs-new',
          component: () => import('@/views/pigs/PigFormView.vue'),
          meta: { title: 'Nuevo Porcino' }
        },
        {
          path: 'pigs/litters',
          name: 'litters',
          component: () => import('@/views/pigs/LittersView.vue'),
          meta: { title: 'Camadas' }
        },
        {
          path: 'pigs/:id',
          name: 'pigs-detail',
          component: () => import('@/views/pigs/PigDetailView.vue'),
          meta: { title: 'Detalle Porcino' }
        },
        {
          path: 'pigs/:id/edit',
          name: 'pigs-edit',
          component: () => import('@/views/pigs/PigFormView.vue'),
          meta: { title: 'Editar Porcino' }
        },
        {
          path: 'pigs/:id/litter/new',
          name: 'litter-new',
          component: () => import('@/views/pigs/LitterFormView.vue'),
          meta: { title: 'Registrar Camada' }
        },
        // Inventory
        {
          path: 'inventory',
          name: 'inventory',
          component: () => import('@/views/inventory/InventoryView.vue'),
          meta: { title: 'Inventario' }
        },
        {
          path: 'inventory/movement',
          name: 'inventory-movement',
          component: () => import('@/views/inventory/InventoryMovementView.vue'),
          meta: { title: 'Movimiento de Inventario' }
        },
        // Tasks
        {
          path: 'tasks',
          name: 'tasks',
          component: () => import('@/views/tasks/TasksView.vue'),
          meta: { title: 'Tareas' }
        },
        // Gastos
        {
          path: 'gastos',
          name: 'gastos',
          component: () => import('@/views/gastos/GastosView.vue'),
          meta: { title: 'Gastos' }
        },
      ]
    }
  ]
})

router.afterEach((to) => {
  const title = to.meta?.title as string | undefined
  document.title = title ? `${title} — Finca` : 'Finca Agropecuaria'
})

export default router
