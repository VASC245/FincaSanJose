<script setup lang="ts">
import { ref, nextTick, onUnmounted, computed } from 'vue'
import { Mic, MicOff, Send, X, Bot, Loader2, ChevronDown, Volume2, VolumeX } from 'lucide-vue-next'
import { sendMessage, type ConversationMessage } from '@/services/aiService'

// ─── State ────────────────────────────────────────────────────────────────────

const isOpen = ref(false)
const input = ref('')
const isLoading = ref(false)
const toolStatus = ref('')
const isListening = ref(false)
const interimText = ref('')
const messagesEl = ref<HTMLElement | null>(null)
const voiceEnabled = ref(true)

interface ChatMsg {
  id: number
  role: 'user' | 'assistant'
  content: string
}

const messages = ref<ChatMsg[]>([])
const history = ref<ConversationMessage[]>([])
let msgId = 0

// ─── Text-to-Speech ───────────────────────────────────────────────────────────

function speak(text: string) {
  if (!voiceEnabled.value || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const clean = text.replace(/[✓✗]/g, '').trim()
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang = 'es-CO'
  utterance.rate = 1.05
  utterance.pitch = 1

  // Prefer a Spanish voice if available
  const voices = window.speechSynthesis.getVoices()
  const spanish = voices.find(v => v.lang.startsWith('es')) ?? null
  if (spanish) utterance.voice = spanish

  window.speechSynthesis.speak(utterance)
}

function stopSpeaking() {
  window.speechSynthesis?.cancel()
}

// ─── Scroll helpers ───────────────────────────────────────────────────────────

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
    const reply = await sendMessage(history.value, (label) => {
      toolStatus.value = label
    })

    messages.value.push({ id: msgId++, role: 'assistant', content: reply })
    history.value.push({ role: 'assistant', content: reply })
    speak(reply)
  } catch (e) {
    const err = (e as Error).message
    const msg = err.includes('401') || err.includes('authentication')
      ? 'API key de Anthropic inválida. Revisa el archivo .env.'
      : `Error: ${err}`
    messages.value.push({ id: msgId++, role: 'assistant', content: msg })
  } finally {
    isLoading.value = false
    toolStatus.value = ''
    scrollToBottom()
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// ─── Voice (Web Speech API) ───────────────────────────────────────────────────

const SpeechRecognition =
  (window as unknown as { SpeechRecognition?: typeof globalThis.SpeechRecognition }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: typeof globalThis.SpeechRecognition }).webkitSpeechRecognition

const hasVoice = computed(() => !!SpeechRecognition)

let recognition: InstanceType<typeof SpeechRecognition> | null = null

function setupRecognition() {
  if (!SpeechRecognition) return
  recognition = new SpeechRecognition()
  recognition.lang = 'es-CO'
  recognition.continuous = false
  recognition.interimResults = true

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = ''
    let final = ''
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

  recognition.onerror = () => {
    isListening.value = false
    interimText.value = ''
  }
}

function toggleMic() {
  if (!SpeechRecognition) return
  if (isListening.value) {
    stopListening()
  } else {
    startListening()
  }
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
  if (recognition && isListening.value) {
    recognition.stop()
  }
  isListening.value = false
}

onUnmounted(() => stopListening())

// ─── Open/close ───────────────────────────────────────────────────────────────

function open() {
  isOpen.value = true
  scrollToBottom()
}

function close() {
  isOpen.value = false
  stopListening()
  stopSpeaking()
}

function clearChat() {
  messages.value = []
  history.value = []
}
</script>

<template>
  <!-- Panel -->
  <Transition name="ai-panel">
    <div
      v-if="isOpen"
      class="fixed bottom-20 right-4 z-50 w-[min(380px,calc(100vw-2rem))] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden"
      style="height: min(520px, calc(100dvh - 100px))"
    >
      <!-- Header -->
      <div class="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white shrink-0">
        <Bot class="w-5 h-5 shrink-0" />
        <div class="flex-1 min-w-0">
          <p class="font-semibold text-sm leading-tight">Asistente Finca</p>
          <p class="text-xs text-emerald-100 truncate">Pregunta o da una instrucción por voz</p>
        </div>
        <button
          class="p-1 rounded-lg hover:bg-white/20 transition-colors"
          :title="voiceEnabled ? 'Silenciar voz' : 'Activar voz'"
          @click="voiceEnabled = !voiceEnabled; if (!voiceEnabled) stopSpeaking()"
        >
          <component :is="voiceEnabled ? Volume2 : VolumeX" class="w-4 h-4" />
        </button>
        <button
          class="p-1 rounded-lg hover:bg-white/20 transition-colors"
          title="Limpiar conversación"
          @click="clearChat"
        >
          <ChevronDown class="w-4 h-4" />
        </button>
        <button class="p-1 rounded-lg hover:bg-white/20 transition-colors" @click="close">
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Messages -->
      <div ref="messagesEl" class="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        <!-- Empty state -->
        <div v-if="messages.length === 0" class="h-full flex flex-col items-center justify-center gap-3 text-center py-8">
          <Bot class="w-10 h-10 text-slate-300" />
          <p class="text-sm text-slate-500 font-medium">¿En qué puedo ayudarte?</p>
          <div class="grid grid-cols-1 gap-2 w-full">
            <button
              v-for="suggestion in ['¿Cómo va la finca hoy?', 'Vacuna el lote de la cerda 12 con Ivermectina 1ml', '¿Qué tareas están pendientes?', 'Registra un gasto de 50 mil en concentrado']"
              :key="suggestion"
              class="text-xs text-left px-3 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition-colors"
              @click="send(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </div>

        <!-- Messages -->
        <template v-else>
          <div
            v-for="msg in messages"
            :key="msg.id"
            :class="msg.role === 'user' ? 'flex justify-end' : 'flex justify-start'"
          >
            <div
              :class="[
                'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words',
                msg.role === 'user'
                  ? 'bg-emerald-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm'
              ]"
            >
              {{ msg.content }}
            </div>
          </div>

          <!-- Loading bubble -->
          <div v-if="isLoading" class="flex justify-start">
            <div class="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2.5 text-sm text-slate-500">
              <Loader2 class="w-3.5 h-3.5 animate-spin text-emerald-600 shrink-0" />
              {{ toolStatus }}
            </div>
          </div>
        </template>
      </div>

      <!-- Input -->
      <div class="px-3 py-3 border-t border-slate-100 shrink-0">
        <!-- Interim transcript preview -->
        <p v-if="interimText" class="text-xs text-slate-400 italic px-1 mb-1.5 truncate">
          "{{ interimText }}"
        </p>

        <div class="flex items-end gap-2">
          <!-- Mic -->
          <button
            v-if="hasVoice"
            :disabled="isLoading"
            :class="[
              'p-2.5 rounded-xl transition-all shrink-0',
              isListening
                ? 'bg-red-500 text-white animate-pulse'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200 disabled:opacity-40'
            ]"
            :title="isListening ? 'Detener' : 'Hablar'"
            @click="toggleMic"
          >
            <component :is="isListening ? MicOff : Mic" class="w-4 h-4" />
          </button>

          <!-- Text input -->
          <textarea
            v-model="input"
            rows="1"
            :disabled="isLoading"
            placeholder="Escribe o usa el micrófono..."
            class="flex-1 resize-none text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 min-h-[40px] max-h-[100px]"
            @keydown="onKeydown"
            @input="($event.target as HTMLTextAreaElement).style.height = 'auto'; ($event.target as HTMLTextAreaElement).style.height = ($event.target as HTMLTextAreaElement).scrollHeight + 'px'"
          />

          <!-- Send -->
          <button
            :disabled="(!input.trim() && !isListening) || isLoading"
            class="p-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            @click="send()"
          >
            <Send class="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Floating button -->
  <button
    :class="[
      'fixed bottom-4 right-4 z-50 rounded-full shadow-lg transition-all duration-200',
      isOpen ? 'bg-slate-700 w-12 h-12' : 'bg-emerald-600 hover:bg-emerald-700 w-14 h-14'
    ]"
    :title="isOpen ? 'Cerrar asistente' : 'Abrir asistente IA'"
    @click="isOpen ? close() : open()"
  >
    <Transition name="icon-swap" mode="out-in">
      <X v-if="isOpen" key="x" class="w-5 h-5 text-white mx-auto" />
      <Bot v-else key="bot" class="w-6 h-6 text-white mx-auto" />
    </Transition>
  </button>
</template>

<style scoped>
.ai-panel-enter-active,
.ai-panel-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.ai-panel-enter-from,
.ai-panel-leave-to {
  opacity: 0;
  transform: translateY(12px) scale(0.97);
}

.icon-swap-enter-active,
.icon-swap-leave-active {
  transition: opacity 0.1s;
}
.icon-swap-enter-from,
.icon-swap-leave-to {
  opacity: 0;
}
</style>
