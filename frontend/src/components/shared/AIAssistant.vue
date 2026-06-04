<script setup lang="ts">
import { ref, nextTick, onUnmounted } from 'vue'
import { Mic, MicOff, Send, X, Bot, Loader2, Trash2, Volume2, VolumeX } from 'lucide-vue-next'
import { sendMessage, type ConversationMessage } from '@/services/aiService'

// ─── State ────────────────────────────────────────────────────────────────────

interface ChatMsg {
  id: number
  role: 'user' | 'assistant'
  content: string
}

const isOpen      = ref(false)
const messages    = ref<ChatMsg[]>([])
const history     = ref<ConversationMessage[]>([])
const input       = ref('')
const isLoading   = ref(false)
const toolStatus  = ref('')
const isListening = ref(false)
const interimText = ref('')
const voiceEnabled = ref(true)
const messagesEl  = ref<HTMLElement | null>(null)
let msgId = 0

const SUGGESTIONS = [
  '¿Cómo va la finca hoy?',
  '¿Cuánta leche produjimos esta semana?',
  '¿Qué tareas están pendientes?',
  '¿Cuáles vacas están preñadas?',
  '¿Cómo está el inventario?',
  '¿Cuánto hemos gastado este mes?',
]

// ─── TTS ──────────────────────────────────────────────────────────────────────

function speak(text: string) {
  if (!voiceEnabled.value || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text.replace(/[✓✗]/g, '').trim())
  utterance.lang = 'es-CO'
  utterance.rate = 1.05
  const voices = window.speechSynthesis.getVoices()
  const spanish = voices.find(v => v.lang.startsWith('es')) ?? null
  if (spanish) utterance.voice = spanish
  window.speechSynthesis.speak(utterance)
}

function stopSpeaking() { window.speechSynthesis?.cancel() }

// ─── Scroll ───────────────────────────────────────────────────────────────────

async function scrollToBottom() {
  await nextTick()
  if (messagesEl.value) messagesEl.value.scrollTop = messagesEl.value.scrollHeight
}

// ─── Send ─────────────────────────────────────────────────────────────────────

async function send(text?: string) {
  const userText = (text ?? input.value).trim()
  if (!userText || isLoading.value) return

  input.value = ''
  interimText.value = ''
  stopListening()

  messages.value.push({ id: msgId++, role: 'user', content: userText })
  history.value.push({ role: 'user', content: userText })
  scrollToBottom()

  isLoading.value = true
  toolStatus.value = 'Pensando...'

  try {
    const reply = await sendMessage(history.value, (label) => { toolStatus.value = label })
    messages.value.push({ id: msgId++, role: 'assistant', content: reply })
    history.value.push({ role: 'assistant', content: reply })
    speak(reply)
  } catch (e) {
    const err = (e as Error).message
    const msg = err.includes('401') || err.includes('authentication')
      ? 'API key inválida. Revisa el archivo .env.'
      : `Error: ${err}`
    messages.value.push({ id: msgId++, role: 'assistant', content: msg })
  } finally {
    isLoading.value = false
    toolStatus.value = ''
    scrollToBottom()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
}

function clearChat() {
  messages.value = []
  history.value  = []
  stopSpeaking()
}

// ─── Voice ────────────────────────────────────────────────────────────────────

const SpeechRecognition =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition

let recognition: any = null

function setupRecognition() {
  if (!SpeechRecognition) return
  recognition = new SpeechRecognition()
  recognition.lang = 'es-CO'
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onresult = (event: any) => {
    let interim = '', final = ''
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript
      if (event.results[i].isFinal) final += t
      else interim += t
    }
    interimText.value = interim
    if (final) input.value = final
  }

  recognition.onend = () => {
    isListening.value = false
    if (input.value.trim()) send()
  }

  recognition.onerror = () => { isListening.value = false; interimText.value = '' }
}

function toggleMic() {
  if (isListening.value) stopListening()
  else startListening()
}

function startListening() {
  if (!recognition) setupRecognition()
  if (!recognition) return
  input.value = ''
  interimText.value = ''
  isListening.value = true
  recognition.start()
}

function stopListening() {
  if (recognition && isListening.value) recognition.stop()
  isListening.value = false
}

// ─── Open / close ─────────────────────────────────────────────────────────────

function open()  { isOpen.value = true;  scrollToBottom() }
function close() { isOpen.value = false; stopListening(); stopSpeaking() }

onUnmounted(() => { stopListening(); stopSpeaking() })
</script>

<template>
  <!-- Backdrop (mobile) -->
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-40 bg-black/30 lg:hidden"
      @click="close"
    />
  </Transition>

  <!-- Panel expandido -->
  <Transition name="ai-panel">
    <div
      v-if="isOpen"
      class="fixed z-50 bg-white shadow-2xl border border-slate-200 flex flex-col
             inset-x-0 bottom-0 rounded-t-2xl
             lg:inset-auto lg:bottom-20 lg:right-4 lg:rounded-2xl lg:w-[600px]"
      style="height: min(82dvh, 800px); max-height: calc(100dvh - 20px)"
    >
      <!-- Header -->
      <div class="flex items-center gap-3 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-t-2xl shrink-0">
        <div class="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
          <Bot class="w-4 h-4" />
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-semibold leading-tight">Asistente Finca</p>
          <p class="text-xs text-emerald-100">Pregunta o da instrucciones</p>
        </div>
        <button
          :title="voiceEnabled ? 'Silenciar' : 'Activar voz'"
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="voiceEnabled = !voiceEnabled; if (!voiceEnabled) stopSpeaking()"
        >
          <component :is="voiceEnabled ? Volume2 : VolumeX" class="w-4 h-4" />
        </button>
        <button
          title="Limpiar chat"
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="clearChat"
        >
          <Trash2 class="w-4 h-4" />
        </button>
        <button
          class="p-1.5 rounded-lg hover:bg-white/20 transition-colors"
          @click="close"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesEl" class="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">

        <!-- Empty state -->
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center gap-5 py-6">
          <div class="text-center">
            <div class="w-14 h-14 rounded-2xl bg-emerald-50 border-2 border-emerald-100 flex items-center justify-center mx-auto mb-3">
              <Bot class="w-7 h-7 text-emerald-600" />
            </div>
            <p class="font-semibold text-slate-700">¿En qué te puedo ayudar?</p>
            <p class="text-xs text-slate-400 mt-1">Puedo consultar datos, registrar vacunas, gastos y más</p>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <button
              v-for="s in SUGGESTIONS"
              :key="s"
              class="text-xs text-left px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-emerald-50 hover:border-emerald-200 text-slate-600 border border-slate-200 transition-colors"
              @click="send(s)"
            >
              {{ s }}
            </button>
          </div>
        </div>

        <!-- Mensajes -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start gap-2.5'"
          >
            <div
              v-if="msg.role === 'assistant'"
              class="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0 mt-0.5"
            >
              <Bot class="w-4 h-4 text-white" />
            </div>
            <div
              :class="[
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              ]"
            >
              {{ msg.content }}
            </div>
          </div>

          <!-- Thinking -->
          <div v-if="isLoading" class="flex justify-start gap-2.5">
            <div class="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center shrink-0">
              <Bot class="w-4 h-4 text-white" />
            </div>
            <div class="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
              {{ toolStatus }}
            </div>
          </div>
        </template>
      </div>

      <!-- Input -->
      <div class="px-4 pb-4 pt-2 border-t border-slate-100 shrink-0">
        <p v-if="interimText" class="text-xs text-slate-400 italic px-1 mb-1.5 truncate">
          "{{ interimText }}"
        </p>
        <div class="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500 focus-within:border-transparent transition-all">
          <button
            v-if="SpeechRecognition"
            :disabled="isLoading"
            :class="[
              'p-2 rounded-xl transition-all shrink-0 mb-0.5',
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'text-slate-400 hover:text-emerald-600 hover:bg-white disabled:opacity-40'
            ]"
            :title="isListening ? 'Detener' : 'Hablar'"
            @click="toggleMic"
          >
            <component :is="isListening ? MicOff : Mic" class="w-5 h-5" />
          </button>

          <textarea
            v-model="input"
            rows="1"
            :disabled="isLoading"
            placeholder="Escribe o usa el micrófono..."
            class="flex-1 resize-none text-sm bg-transparent outline-none py-2 min-h-[38px] max-h-[120px] placeholder-slate-400 disabled:opacity-50"
            @keydown="onKeydown"
            @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          />

          <button
            :disabled="!input.trim() || isLoading"
            class="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0 mb-0.5"
            @click="send()"
          >
            <Send class="w-5 h-5" />
          </button>
        </div>
        <p class="text-xs text-slate-400 text-center mt-1.5">Enter para enviar · Shift+Enter nueva línea</p>
      </div>
    </div>
  </Transition>

  <!-- Botón flotante -->
  <button
    :class="[
      'fixed bottom-5 right-5 z-50 rounded-full shadow-xl transition-all duration-200 flex items-center justify-center',
      isOpen ? 'w-12 h-12 bg-slate-700' : 'w-14 h-14 bg-emerald-600 hover:bg-emerald-700 hover:scale-105'
    ]"
    :title="isOpen ? 'Cerrar asistente' : 'Abrir asistente IA'"
    @click="isOpen ? close() : open()"
  >
    <Transition name="icon-swap" mode="out-in">
      <X   v-if="isOpen"  key="x"   class="w-5 h-5 text-white" />
      <Bot v-else          key="bot" class="w-6 h-6 text-white" />
    </Transition>
  </button>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.2s }
.fade-enter-from, .fade-leave-to       { opacity: 0 }

.ai-panel-enter-active, .ai-panel-leave-active { transition: opacity 0.2s, transform 0.25s }
.ai-panel-enter-from, .ai-panel-leave-to       { opacity: 0; transform: translateY(16px) scale(0.97) }

.icon-swap-enter-active, .icon-swap-leave-active { transition: opacity 0.1s }
.icon-swap-enter-from, .icon-swap-leave-to       { opacity: 0 }
</style>
